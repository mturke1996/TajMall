/**
 * The closing statement of a lease that is about to end: what the tenant still owes, what deposit the books
 * hold for him, the net of the two in one plain sentence, and what to look at before the lease is ended.
 *
 * Built from what the tenant profile already shows (the rent account, his transactions, his leases), so the
 * figures here are the profile's figures. Every source is `null` when it could not be read, and a source
 * that could not be read never reads as zero: the statement is then incomplete, has no net, and says which
 * part is missing.
 *
 * The deposit is taken from the tenant's transactions, not from the contract: his counted (posted and
 * reconciled) revenue in the deposit account LIA-DEP minus his counted expense in it. The contract's own
 * figure is only compared with it. A deposit booked or handed back by a manual journal entry is not a
 * transaction and is not seen here; the statement says so where the deposit is nil. An expense in LIA-DEP debits that liability and credits the cashbox
 * (process_transaction_posting), which is exactly what handing a deposit back is.
 */
import type { TxDialogPrefill } from '@/stores/transaction-dialog';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { daysBetween } from '@/lib/mall-dates';
import { roundLyd } from '@/lib/rent-allocation';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { arabicCount, formatDate, formatMoney } from '@/lib/utils';

/** The account tenant deposits live in. */
export const DEPOSIT_CODE = 'LIA-DEP';

/**
 * The new-transaction dialog lists an account under expenses by the account's own kind, and a liability
 * account carries the kind ADJUSTMENT, so the deposit account is not offered there. Set this to true once
 * that dialog lists LIA-DEP under expenses whatever its stored kind is.
 */
export const TX_DIALOG_LISTS_DEPOSIT_ACCOUNT = false;

const EPS = 0.0005;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const sum = (xs: number[]) => roundLyd(xs.reduce((s, x) => s + x, 0));

const MONTHS: [string, string, string, string] = ['شهر واحد', 'شهرين', 'أشهر', 'شهراً'];
const DAYS: [string, string, string, string] = ['يوم واحد', 'يومين', 'أيام', 'يوماً'];
const PAYMENTS: [string, string, string, string] = ['دفعة واحدة', 'دفعتين', 'دفعات', 'دفعة'];

export type SettlementSource = 'rent' | 'transactions' | 'contracts';

const SOURCE_NAME: Record<SettlementSource, string> = {
  rent: 'مطالبات المستأجر',
  transactions: 'معاملات المستأجر',
  contracts: 'عقود المستأجر',
};

/** One month of the tenant's rent account (src/lib/tenant-rent-account.ts), as far as the statement reads it. */
export type SettlementMonth = {
  month: string;
  kind: string;
  paid: number;
  remaining: number;
  owedNow: number;
  chargeId: string | null;
};

export type SettlementCharge = {
  id: string;
  type: string;
  description?: string | null;
  due_date: string;
  amount: number | string | null;
  total_paid?: number | string | null;
  status: string;
};

export type SettlementTx = {
  id: string;
  kind: string;
  status: string;
  amount: number | string;
  tx_date: string;
  category?: { code?: string | null } | null;
};

export type SettlementLease = {
  id: string;
  status: string;
  deposit_amount: number | string | null;
  unit?: { unit_number?: string | null } | null;
};

export type SettlementInput = {
  /** "YYYY-MM-DD": the day the lease would end */
  today: string;
  contract: { id: string; endDate: string };
  /** every lease of the tenant, this one included */
  leases: SettlementLease[] | null;
  /** the tenant's rent account (its months) and his charges of every type */
  rent: { years: { months: SettlementMonth[] }[]; charges: SettlementCharge[] } | null;
  /** every transaction of the tenant */
  transactions: SettlementTx[] | null;
  /** rent received but linked to no month; undefined when it was not asked, null when it could not be read */
  unlinkedReceipts?: { total: number; count: number } | null;
};

export type ArrearsRow = {
  key: string;
  kind: 'rent' | 'other';
  label: string;
  sub: string | null;
  amount: number;
};

export type DepositState =
  /** the books hold no deposit and the contract names none */
  | 'none'
  /** the books hold a deposit and the contract agrees */
  | 'agree'
  /** the books hold a deposit and the contract says another figure */
  | 'mismatch'
  /** the contract names a deposit that the books never received */
  | 'unrecorded'
  /** more was handed back than was received */
  | 'over_refunded';

export type DepositFigures = {
  /** counted revenue in the deposit account */
  received: number;
  /** counted expense in the deposit account */
  refunded: number;
  /** what the books still hold for the tenant (never below zero) */
  held: number;
  /** this lease's deposit_amount */
  contractAmount: number;
  state: DepositState;
  /** deposit refunds saved as drafts, not yet counted */
  pendingRefund: number;
};

export type EndPlan = {
  /** the date the lease will be recorded as ended */
  newEnd: string;
  registeredEnd: string;
  /** days from today to the registered end; negative once it has passed, null when the date is unreadable */
  daysToEnd: number | null;
  relation: 'early' | 'today' | 'passed' | 'unknown';
  text: string;
};

export type Verdict =
  | { kind: 'refund' | 'owed' | 'even'; amount: number; sentence: string; detail: string }
  | { kind: 'unknown'; amount: 0; sentence: string; detail: string };

export type RefundPlan =
  | {
      available: true;
      /** the one-tap amount: the deposit left after the arrears */
      amount: number;
      /** the whole deposit that may still be handed back */
      full: number;
      /** kept against the arrears when `amount` is taken (0 when there are no arrears to keep it for) */
      offset: number;
    }
  | { available: false; reason: 'incomplete' | 'no_deposit' | 'refunded' | 'covered_by_arrears'; message: string };

export type SettlementNoteKey =
  | 'deposit_mismatch'
  | 'deposit_unrecorded'
  | 'deposit_over_refunded'
  | 'unlinked'
  | 'uncharged'
  | 'after_end'
  | 'prepaid'
  | 'pending_refund'
  | 'other_leases'
  | 'unlinked_unchecked'
  | 'last_payment';

export type SettlementNote = { key: SettlementNoteKey; tone: 'warning' | 'info'; text: string };

/** Faults that change the net come first, context last. */
const NOTE_ORDER: SettlementNoteKey[] = [
  'deposit_mismatch',
  'deposit_unrecorded',
  'deposit_over_refunded',
  'unlinked',
  'uncharged',
  'after_end',
  'prepaid',
  'pending_refund',
  'other_leases',
  'unlinked_unchecked',
  'last_payment',
];

export type Settlement = {
  /** every source was read: only then is there a net */
  complete: boolean;
  unavailable: SettlementSource[];
  endPlan: EndPlan;
  arrears: { rent: number; other: number; total: number; rows: ArrearsRow[] } | null;
  deposit: DepositFigures | null;
  /** deposit held − arrears: positive is owed to the tenant, negative is owed by him */
  net: number | null;
  verdict: Verdict;
  refund: RefundPlan;
  notes: SettlementNote[];
  lastPayment: { date: string; amount: number; daysAgo: number | null } | null;
};

/** Where the lease stands against its registered end date, and what ending it today records. */
export function planEnd(today: string, registeredEnd: string): EndPlan {
  const daysToEnd = daysBetween(today, registeredEnd);
  const base = { newEnd: today, registeredEnd, daysToEnd };
  const stamp = `بتاريخ اليوم ${formatDate(today)}`;
  if (daysToEnd == null) {
    return { ...base, relation: 'unknown', text: `يُسجَّل الإنهاء ${stamp}.` };
  }
  if (daysToEnd > 0) {
    return {
      ...base,
      relation: 'early',
      text: `يُسجَّل الإنهاء ${stamp}، قبل نهاية العقد المسجَّلة ${formatDate(registeredEnd)} بـ ${arabicCount(daysToEnd, DAYS)}.`,
    };
  }
  if (daysToEnd === 0) {
    return { ...base, relation: 'today', text: `ينتهي العقد اليوم ${formatDate(today)} حسب تاريخه المسجَّل.` };
  }
  return {
    ...base,
    relation: 'passed',
    text: `انتهت مدة العقد في ${formatDate(registeredEnd)} منذ ${arabicCount(-daysToEnd, DAYS)} وما زال نشطاً. يُسجَّل الإنهاء ${stamp}.`,
  };
}

function chargeDay(c: SettlementCharge) {
  return String(c.due_date ?? '').slice(0, 10);
}

function chargeLabel(c: SettlementCharge) {
  return c.description?.trim() || 'رسوم أخرى';
}

/** Deposit figures from the tenant's transactions; the contract's figure is only compared with them. */
function depositFigures(txs: SettlementTx[], leases: SettlementLease[], contractId: string): DepositFigures {
  const inAccount = txs.filter((t) => t.category?.code === DEPOSIT_CODE);
  const counted = inAccount.filter(isCountedTransaction);
  const received = sum(counted.filter((t) => t.kind === 'REVENUE').map((t) => num(t.amount)));
  const refunded = sum(counted.filter((t) => t.kind === 'EXPENSE').map((t) => num(t.amount)));
  const pendingRefund = sum(inAccount.filter((t) => t.status === 'DRAFT' && t.kind === 'EXPENSE').map((t) => num(t.amount)));
  const contractAmount = num(leases.find((l) => l.id === contractId)?.deposit_amount);
  const contractsTotal = sum(leases.map((l) => num(l.deposit_amount)));

  const held = roundLyd(Math.max(received - refunded, 0));
  const hasBooks = received > EPS || refunded > EPS;

  let state: DepositState;
  if (!hasBooks) {
    state = contractAmount > EPS ? 'unrecorded' : 'none';
  } else if (refunded > received + EPS) {
    state = 'over_refunded';
  } else {
    // a renewal keeps the old deposit under the new lease (its own figure is 0), and a part refund lowers what
    // is held: the contract agrees when its figure, or the sum over the tenant's leases, is what was received
    const agrees =
      near(contractAmount, held) || near(contractAmount, received) || near(contractsTotal, received) || near(contractsTotal, held);
    state = agrees ? 'agree' : 'mismatch';
  }
  return { received, refunded, held, contractAmount, state, pendingRefund };
}

function verdictOf(net: number, held: number, arrears: number): Verdict {
  const detail =
    held > EPS && arrears > EPS
      ? `التأمين ${formatMoney(held, 'LYD')} والمتأخرات ${formatMoney(arrears, 'LYD')}.`
      : held > EPS
        ? `التأمين ${formatMoney(held, 'LYD')} ولا متأخرات.`
        : arrears > EPS
          ? `لا تأمين محتجزاً، والمتأخرات ${formatMoney(arrears, 'LYD')}.`
          : 'لا تأمين محتجزاً ولا متأخرات.';
  if (net > EPS) return { kind: 'refund', amount: net, sentence: `يُرَد للمستأجر ${formatMoney(net, 'LYD')}`, detail };
  if (net < -EPS) return { kind: 'owed', amount: -net, sentence: `يبقى على المستأجر ${formatMoney(-net, 'LYD')}`, detail };
  return { kind: 'even', amount: 0, sentence: 'لا شيء مستحق للطرفين', detail };
}

function refundPlanOf(args: { complete: boolean; deposit: DepositFigures | null; arrears: number; cap: number }): RefundPlan {
  const { complete, deposit, arrears, cap } = args;
  if (!complete || !deposit) {
    return { available: false, reason: 'incomplete', message: 'يظهر رد التأمين بعد اكتمال الأرقام.' };
  }
  if (cap <= EPS) {
    return deposit.received > EPS
      ? { available: false, reason: 'refunded', message: 'رُدَّ التأمين بالكامل.' }
      : { available: false, reason: 'no_deposit', message: 'لا تأمين مقبوضاً في معاملات هذا المستأجر، فلا شيء يُرَد من هنا.' };
  }
  const afterArrears = roundLyd(Math.min(Math.max(deposit.held - arrears, 0), cap));
  if (afterArrears <= EPS) {
    return { available: false, reason: 'covered_by_arrears', message: 'التأمين كله مقابل المتأخرات، فلا يُرَد منه شيء.' };
  }
  return { available: true, amount: afterArrears, full: cap, offset: roundLyd(Math.max(cap - afterArrears, 0)) };
}

export function buildSettlement(input: SettlementInput): Settlement {
  const { today, contract, leases, rent, transactions } = input;
  const unavailable: SettlementSource[] = [];
  if (!rent) unavailable.push('rent');
  if (!transactions) unavailable.push('transactions');
  if (!leases) unavailable.push('contracts');
  const complete = unavailable.length === 0;
  const money = (n: number) => formatMoney(n, 'LYD');
  const todayMonth = today.slice(0, 7);

  // ── what the tenant owes ──────────────────────────────────────────────────
  let arrears: Settlement['arrears'] = null;
  const notes: SettlementNote[] = [];

  if (rent) {
    const months = rent.years.flatMap((y) => y.months).sort((a, b) => a.month.localeCompare(b.month));

    const rentRows: ArrearsRow[] = months
      .filter((m) => m.owedNow > EPS)
      .map((m) => ({
        key: `rent-${m.month}`,
        kind: 'rent',
        label: `إيجار ${formatMonthLabelAr(m.month)}`,
        sub: m.kind === 'uncharged' ? 'لم تُسجَّل مطالبته بعد' : m.kind === 'partial' ? 'دُفع جزء منه، وهذا المتبقي' : null,
        amount: roundLyd(m.owedNow),
      }));

    const open = rent.charges
      .filter((c) => c.type !== 'RENT' && c.status !== 'PAID')
      .map((c) => ({ c, left: roundLyd(Math.max(num(c.amount) - num(c.total_paid), 0)) }))
      .filter((x) => x.left > EPS);
    const otherRows: ArrearsRow[] = open
      .filter((x) => chargeDay(x.c) <= today)
      .sort((a, b) => chargeDay(a.c).localeCompare(chargeDay(b.c)))
      .map(({ c, left }) => ({
        key: `charge-${c.id}`,
        kind: 'other',
        label: chargeLabel(c),
        sub: `مستحقة في ${formatDate(chargeDay(c))}${num(c.total_paid) > EPS ? '، دُفع جزء منها' : ''}`,
        amount: left,
      }));

    const rentTotal = sum(rentRows.map((r) => r.amount));
    const otherTotal = sum(otherRows.map((r) => r.amount));
    arrears = { rent: rentTotal, other: otherTotal, total: roundLyd(rentTotal + otherTotal), rows: [...rentRows, ...otherRows] };

    const uncharged = months.filter((m) => m.kind === 'uncharged' && m.owedNow > EPS);
    if (uncharged.length > 0) {
      notes.push({
        key: 'uncharged',
        tone: 'warning',
        text: `مبلغ ${money(sum(uncharged.map((m) => m.owedNow)))} مستحق عن ${arabicCount(uncharged.length, MONTHS)} ولم تُسجَّل مطالبته بعد. يدخل في المتأخرات ولا يظهر في الدفاتر. ولّد المطالبة من تبويب المطالبات قبل إنهاء العقد، فالعقد المنتهي لا تُولَّد له مطالبات.`,
      });
    }

    // claims dated after the day the lease ends: ending the lease does not remove them
    const laterRent = months.filter((m) => m.month > todayMonth && m.chargeId && m.remaining > EPS);
    const laterOther = open.filter((x) => chargeDay(x.c) > today);
    if (laterRent.length > 0 || laterOther.length > 0) {
      const parts = [
        laterRent.length > 0 ? `${arabicCount(laterRent.length, MONTHS)} من الإيجار (${money(sum(laterRent.map((m) => m.remaining)))})` : null,
        laterOther.length > 0 ? `رسوم أخرى (${money(sum(laterOther.map((x) => x.left)))})` : null,
      ].filter(Boolean);
      notes.push({
        key: 'after_end',
        tone: 'warning',
        text: `يبقى مطلوباً من المستأجر بعد تاريخ الإنهاء: ${parts.join(' و')}. لا يدخل في الصافي. أعفِ ما لا يلزمه سداده من ملفه قبل الإنهاء.`,
      });
    }

    const prepaid = months.filter((m) => m.month > todayMonth && m.paid > EPS);
    if (prepaid.length > 0) {
      notes.push({
        key: 'prepaid',
        tone: 'warning',
        text: `دفع المستأجر مقدماً عن ${arabicCount(prepaid.length, MONTHS)} بعد تاريخ الإنهاء (${money(sum(prepaid.map((m) => m.paid)))}). لا يدخل في الصافي؛ قرّر ردّه أو إبقاءه.`,
      });
    }
  }

  // ── the deposit the books hold ────────────────────────────────────────────
  const deposit = transactions && leases ? depositFigures(transactions, leases, contract.id) : null;
  if (deposit) {
    if (deposit.state === 'mismatch') {
      notes.push({
        key: 'deposit_mismatch',
        tone: 'warning',
        text:
          deposit.contractAmount > EPS
            ? `مبلغ التأمين في العقد ${money(deposit.contractAmount)} لا يطابق الدفاتر: المقبوض ${money(deposit.received)}${deposit.refunded > EPS ? `، والمردود ${money(deposit.refunded)}` : ''}. الصافي محسوب على ما في الدفاتر، فراجع الفرق قبل رد أي مبلغ.`
            : `العقد لا يذكر تأميناً، لكن الدفاتر تُظهر تأميناً مقبوضاً ${money(deposit.received)}${deposit.refunded > EPS ? `، مردوداً منه ${money(deposit.refunded)}` : ''}. الصافي محسوب على ما في الدفاتر.`,
      });
    } else if (deposit.state === 'unrecorded') {
      notes.push({
        key: 'deposit_unrecorded',
        tone: 'warning',
        text: `العقد يذكر تأميناً ${money(deposit.contractAmount)}، لكن معاملات المستأجر لا تُظهر قبض تأمين. لذلك لا يدخل في الصافي ولا يُرَد منه شيء. إن سُجّل التأمين بقيد يومية فراجعه مع المحاسب.`,
      });
    } else if (deposit.state === 'over_refunded') {
      notes.push({
        key: 'deposit_over_refunded',
        tone: 'warning',
        text: `المردود ${money(deposit.refunded)} أكبر من المقبوض ${money(deposit.received)}. راجع قيود التأمين قبل أي رد جديد.`,
      });
    }
    if (deposit.pendingRefund > EPS) {
      notes.push({
        key: 'pending_refund',
        tone: 'warning',
        text: `رد تأمين بمبلغ ${money(deposit.pendingRefund)} محفوظ كمسودة ولم يُرحَّل بعد. أكمله بدل تسجيل رد جديد.`,
      });
    }
  }

  // a lease of another shop shares the tenant's account
  const others = leases?.filter((l) => l.id !== contract.id && l.status === 'ACTIVE') ?? [];
  if (others.length > 0) {
    const shops = others.map((l) => (l.unit?.unit_number ? `محل ${l.unit.unit_number}` : 'محل آخر')).join('، ');
    notes.push({
      key: 'other_leases',
      tone: 'warning',
      text: `للمستأجر عقد نشط آخر (${shops}). المتأخرات والتأمين محسوبان على حسابه كله، لا على هذا العقد وحده.`,
    });
  }

  if (input.unlinkedReceipts && input.unlinkedReceipts.total > EPS) {
    const { total, count } = input.unlinkedReceipts;
    notes.push({
      key: 'unlinked',
      tone: 'warning',
      text: `مبلغ ${money(total)} قُبض كإيجار ولم يُربط بأشهر (${arabicCount(count, PAYMENTS)}). قد تكون المتأخرات أعلى من حقيقتها؛ اربطه من ملف المستأجر قبل الاعتماد على الصافي.`,
    });
  } else if (input.unlinkedReceipts === null) {
    notes.push({ key: 'unlinked_unchecked', tone: 'info', text: 'تعذّر التحقق من دفعات إيجار غير مربوطة بأشهر.' });
  }

  // the last rent payment is context, not a fault
  let lastPayment: Settlement['lastPayment'] = null;
  if (transactions) {
    const rentReceipts = transactions
      .filter((t) => isCountedTransaction(t) && t.kind === 'REVENUE' && isRentCategoryCode(t.category?.code ?? undefined))
      .sort((a, b) => String(b.tx_date).localeCompare(String(a.tx_date)));
    const last = rentReceipts[0];
    if (last) {
      const date = String(last.tx_date).slice(0, 10);
      const daysAgo = daysBetween(date, today);
      lastPayment = { date, amount: roundLyd(num(last.amount)), daysAgo };
      notes.push({
        key: 'last_payment',
        tone: 'info',
        text: `آخر دفعة إيجار ${formatDate(date)} بمبلغ ${money(lastPayment.amount)}${
          daysAgo == null || daysAgo < 0 ? '' : daysAgo === 0 ? ' (اليوم)' : ` (قبل ${arabicCount(daysAgo, DAYS)})`
        }.`,
      });
    } else {
      notes.push({ key: 'last_payment', tone: 'info', text: 'لا توجد دفعة إيجار مسجَّلة لهذا المستأجر.' });
    }
  }
  notes.sort((a, b) => NOTE_ORDER.indexOf(a.key) - NOTE_ORDER.indexOf(b.key));

  // ── the net ───────────────────────────────────────────────────────────────
  const net = complete && arrears && deposit ? roundLyd(deposit.held - arrears.total) : null;
  const verdict: Verdict =
    net != null && arrears && deposit
      ? verdictOf(net, deposit.held, arrears.total)
      : {
          kind: 'unknown',
          amount: 0,
          sentence: 'تعذّر حساب الصافي',
          detail: `تعذّر تحميل ${unavailable.map((s) => SOURCE_NAME[s]).join('، ')}. أعد المحاولة قبل الاعتماد على الأرقام.`,
        };

  // a shared account must not hand back the other shop's deposit
  const cap = deposit ? (others.length > 0 && deposit.contractAmount > EPS ? Math.min(deposit.held, deposit.contractAmount) : deposit.held) : 0;

  return {
    complete,
    unavailable,
    endPlan: planEnd(today, contract.endDate),
    arrears,
    deposit,
    net,
    verdict,
    refund: refundPlanOf({ complete, deposit, arrears: arrears?.total ?? 0, cap }),
    notes,
    lastPayment,
  };
}

/** What the new-transaction dialog is opened with to hand a deposit back; nothing is posted until it is saved there. */
export function buildRefundPrefill(input: {
  amount: number;
  /** the most that may still be handed back */
  cap: number;
  tenantId: string;
  tenantName: string;
  unitNumber?: string | null;
  categoryId: string | null | undefined;
  /** the amount leaves part of the deposit against the arrears */
  afterArrears?: boolean;
}): TxDialogPrefill | null {
  const amount = roundLyd(Math.min(input.amount, input.cap));
  if (!(amount > EPS) || !input.categoryId || !input.tenantId) return null;
  const shop = input.unitNumber ? ` — محل ${input.unitNumber}` : '';
  return {
    kind: 'EXPENSE',
    contactId: input.tenantId,
    contactKind: 'TENANT',
    categoryId: input.categoryId,
    amount,
    description: `رد تأمين المستأجر ${input.tenantName}${shop}${input.afterArrears ? ' (بعد خصم المتأخرات)' : ''}`,
  };
}

export type DepositAccountState =
  | { state: 'ready'; id: string }
  | { state: 'missing' }
  | { state: 'hidden_in_dialog'; id: string };

/** Whether the deposit account can be used as the account of the refund the dialog is opened with. */
export function depositAccountState(
  categories: { id: string; code: string; kind: string; active?: boolean | null }[] | null | undefined,
): DepositAccountState {
  const cat = categories?.find((c) => c.code === DEPOSIT_CODE && c.active !== false);
  if (!cat) return { state: 'missing' };
  if (cat.kind === 'EXPENSE' || TX_DIALOG_LISTS_DEPOSIT_ACCOUNT) return { state: 'ready', id: cat.id };
  return { state: 'hidden_in_dialog', id: cat.id };
}
