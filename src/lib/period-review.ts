/**
 * Checks to run before closing a fiscal period: things an accountant fixes while the period is still
 * open, because after closing nothing can be changed inside it. Each check is computed from data the
 * screen already loads (see usePeriodReview) and says what to fix and where.
 */
import { arabicCount } from '@/lib/utils';

export type ReviewTx = {
  id: string;
  number: number | null;
  kind: string;
  status: string;
  amount: number | string;
  method?: string | null;
  reference?: string | null;
  description?: string | null;
  contact_id?: string | null;
  category_id?: string | null;
  tx_date: string;
  category?: { code?: string | null } | null;
};

export type ReviewCheck = {
  key: string;
  title: string;
  status: 'ok' | 'warn';
  detail: string;
  /** where to fix it */
  href?: string;
};

export type PeriodReviewInput = {
  transactions: ReviewTx[];
  /** rent receipts (by transaction id) not fully linked to months, with the amount still free */
  unlinkedReceipts: { transactionId: string; free: number }[];
  draftJournalCount: number;
  pendingVoucherCount: number;
  cashboxCountRuns: number;
};

const COUNTED = new Set(['POSTED', 'RECONCILED']);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const moneyPlain = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
const txCount = (n: number) => arabicCount(n, ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة']);
// "رقم 1019، 1029": a leading "#" is reordered by the browser inside Arabic text ("1059#")
const numbers = (rows: ReviewTx[]) => {
  const list = rows
    .slice(0, 4)
    .map((t) => t.number)
    .filter((n): n is number => n != null);
  if (!list.length) return '';
  return `${list.length === 1 ? 'رقم' : 'أرقام'} ${list.join('، ')}${rows.length > 4 ? '…' : ''}`;
};

export function buildPeriodReview(input: PeriodReviewInput): ReviewCheck[] {
  const counted = input.transactions.filter((t) => COUNTED.has(t.status));
  const checks: ReviewCheck[] = [];

  const noDescription = counted.filter((t) => !t.description?.trim());
  checks.push({
    key: 'description',
    title: 'معاملات بلا بيان',
    status: noDescription.length ? 'warn' : 'ok',
    detail: noDescription.length
      ? `${txCount(noDescription.length)}: ${numbers(noDescription)} — البيان يظهر في الكشوف والإيصالات.`
      : 'كل المعاملات لها بيان.',
    href: noDescription[0] ? `/transactions?highlight=${noDescription[0].id}` : undefined,
  });

  const noReference = counted.filter(
    (t) => (t.method === 'CHEQUE' || t.method === 'TRANSFER') && !t.reference?.trim(),
  );
  checks.push({
    key: 'reference',
    title: 'صكوك وحوالات بلا رقم',
    status: noReference.length ? 'warn' : 'ok',
    detail: noReference.length
      ? `${txCount(noReference.length)}: ${numbers(noReference)} — رقم الصك أو الحوالة يلزم لمطابقة كشف المصرف.`
      : 'كل الصكوك والحوالات لها رقم.',
    href: noReference[0] ? `/transactions?highlight=${noReference[0].id}` : undefined,
  });

  const noParty = counted.filter((t) => t.kind === 'EXPENSE' && !t.contact_id);
  const noPartyTotal = round3(noParty.reduce((s, t) => s + (Number(t.amount) || 0), 0));
  checks.push({
    key: 'party',
    title: 'مصروفات بلا جهة',
    status: noParty.length ? 'warn' : 'ok',
    detail: noParty.length
      ? `${txCount(noParty.length)} بمجموع ${moneyPlain(noPartyTotal)} د.ل — اربطها بالمورد أو الموظف حتى تظهر في تقارير الإنفاق.`
      : 'كل المصروفات مربوطة بجهة.',
    href: noParty[0] ? `/expenses?highlight=${noParty[0].id}` : undefined,
  });

  // same day, kind, amount, account and party: usually the same payment entered twice
  const groups = new Map<string, ReviewTx[]>();
  for (const t of counted) {
    const key = [t.tx_date.slice(0, 10), t.kind, round3(Number(t.amount) || 0), t.category_id ?? '', t.contact_id ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const duplicates = [...groups.values()].filter((g) => g.length > 1);
  checks.push({
    key: 'duplicates',
    title: 'تكرار محتمل',
    status: duplicates.length ? 'warn' : 'ok',
    detail: duplicates.length
      ? `${arabicCount(duplicates.length, ['مجموعة واحدة', 'مجموعتان', 'مجموعات', 'مجموعة'])} من معاملات متطابقة في اليوم والمبلغ والبند والجهة: ${duplicates
          .slice(0, 3)
          .map((g) => numbers(g))
          .join(' · ')} — تأكد أنها ليست الدفعة نفسها مرتين.`
      : 'لا معاملات متطابقة في اليوم نفسه.',
    href: duplicates[0]?.[1] ? `/transactions?highlight=${duplicates[0][1].id}` : undefined,
  });

  const unlinkedTotal = round3(input.unlinkedReceipts.reduce((s, r) => s + r.free, 0));
  checks.push({
    key: 'rent-links',
    title: 'تحصيلات إيجار غير مربوطة بأشهر',
    status: input.unlinkedReceipts.length ? 'warn' : 'ok',
    detail: input.unlinkedReceipts.length
      ? `${arabicCount(input.unlinkedReceipts.length, ['تحصيل واحد', 'تحصيلان', 'تحصيلات', 'تحصيلاً'])} بمبلغ ${moneyPlain(unlinkedTotal)} د.ل لم يُنسب إلى شهر — يبقى المستأجر مطالَباً به حتى يُربط.`
      : 'كل تحصيلات الإيجار مربوطة بأشهرها.',
    href: input.unlinkedReceipts[0] ? `/transactions?highlight=${input.unlinkedReceipts[0].transactionId}` : undefined,
  });

  checks.push({
    key: 'draft-journals',
    title: 'قيود يومية مسودة',
    status: input.draftJournalCount ? 'warn' : 'ok',
    detail: input.draftJournalCount
      ? `${arabicCount(input.draftJournalCount, ['قيد واحد', 'قيدان', 'قيود', 'قيداً'])} لم يُرحَّل — رحّله أو احذفه قبل الإقفال.`
      : 'لا قيود مسودة.',
    href: input.draftJournalCount ? '/journals' : undefined,
  });

  checks.push({
    key: 'vouchers',
    title: 'أذونات صرف غير معتمدة',
    status: input.pendingVoucherCount ? 'warn' : 'ok',
    detail: input.pendingVoucherCount
      ? `${arabicCount(input.pendingVoucherCount, ['إذن واحد', 'إذنان', 'أذونات', 'إذناً'])} مسودة أو بانتظار الاعتماد بتاريخ داخل الفترة.`
      : 'كل الأذونات معتمدة أو مرفوضة.',
    href: input.pendingVoucherCount ? '/vouchers' : undefined,
  });

  checks.push({
    key: 'cash-count',
    title: 'جرد الخزائن',
    status: input.cashboxCountRuns ? 'ok' : 'warn',
    detail: input.cashboxCountRuns
      ? `سُجّل ${arabicCount(input.cashboxCountRuns, ['جرد واحد', 'جردان', 'عمليات جرد', 'عملية جرد'])} في الفترة.`
      : 'لم يُسجَّل جرد للخزائن في هذه الفترة — عُدّ النقد وطابقه مع الدفتر قبل الإقفال.',
    href: input.cashboxCountRuns ? undefined : '/settings/cashbox-count',
  });

  return checks;
}
