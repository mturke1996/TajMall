import { isRentCategoryCode } from '@/lib/charge-invoice';
import {
  applyExemptOverlayToCalendarMonths,
} from '@/lib/rent-exempt-months';
import type { TenantChargeWithRelations, TransactionWithRelations } from '@/lib/db/types';
import {
  monthKey,
  type RentCalendarMonth,
  type RentMonthStatus,
  type TenantRentCalendar,
} from '@/lib/rent-months';

const STATUS_RANK: Record<RentMonthStatus, number> = {
  paid: 6,
  partial: 5,
  // exempt أعلى من unpaid/no_charge حتى لا تظهر كمستحق
  exempt: 4,
  unpaid: 3,
  no_charge: 2,
  na: 1,
};

const CHARGE_STATUS_RANK: Record<string, number> = {
  PAID: 3,
  PARTIAL: 2,
  UNPAID: 1,
};

const MONTH_KEY_RE = /(20\d{2})-(0[1-9]|1[0-2])/;

export function chargeBelongsToTenant(
  charge: TenantChargeWithRelations,
  tenantId: string,
): boolean {
  const tid =
    charge.contract?.tenant?.id ??
    (charge.contract as { tenant_id?: string } | null | undefined)?.tenant_id;
  return tid === tenantId;
}

function activeRentJournalLinks(charge: TenantChargeWithRelations) {
  return (charge.rent_journal_links ?? []).filter(
    (l) =>
      l.journal?.status !== 'REVERSED' &&
      (l.journal?.status === 'POSTED' || l.journal?.status === 'DRAFT'),
  );
}

/** مبلغ مسدّد فعلياً — يستبعد قيوداً معكوسة أو محذوفة من الربط */
export function effectiveRentPaidOnCharge(
  charge: TenantChargeWithRelations,
): number {
  const amount = Number(charge.amount) || 0;
  if (charge.journal?.status === 'REVERSED') {
    return 0;
  }

  // شهر مُعلَم مدفوعاً في قاعدة البيانات (مثلاً بعد تسوية سعر) يُعرض كاملاً
  if (charge.status === 'PAID' && amount > 0) {
    return amount;
  }

  const links = charge.rent_journal_links ?? [];
  if (links.length > 0) {
    const fromLinks = activeRentJournalLinks(charge).reduce(
      (sum, l) => sum + (Number(l.amount) || 0),
      0,
    );
    return Math.min(Math.max(fromLinks, 0), amount);
  }

  return Math.min(Math.max(Number(charge.total_paid) || 0, 0), amount);
}

function monthStatusFromCharge(charge: TenantChargeWithRelations): RentMonthStatus {
  const amount = Number(charge.amount) || 0;
  const paid = effectiveRentPaidOnCharge(charge);
  if (amount > 0 && paid >= amount) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

function chargeIsMorePaid(
  a: TenantChargeWithRelations,
  b: TenantChargeWithRelations,
): boolean {
  const ra = CHARGE_STATUS_RANK[a.status] ?? 0;
  const rb = CHARGE_STATUS_RANK[b.status] ?? 0;
  if (ra !== rb) return ra > rb;
  return Number(a.total_paid) > Number(b.total_paid);
}

function pickBetterMonth(a: RentCalendarMonth, b: RentCalendarMonth): RentCalendarMonth {
  return STATUS_RANK[a.status] >= STATUS_RANK[b.status] ? a : b;
}

function emptyMonth(
  year: number,
  index: number,
  monthlyRent: number,
  amountForMonth?: (monthKeyStr: string) => number,
): RentCalendarMonth {
  const month = monthKey(year, index);
  const amount = Math.max(
    0,
    amountForMonth?.(month) ?? monthlyRent,
  );
  if (amount > 0) {
    return {
      month,
      status: 'no_charge',
      amount,
      paid: 0,
      charge_id: null,
      description: null,
    };
  }
  return {
    month,
    status: 'na',
    amount: 0,
    paid: 0,
    charge_id: null,
    description: null,
  };
}

/** يبني تقويم السنة من مطالبات RENT لكل عقود المستأجر */
export function buildRentCalendarFromCharges(
  tenantId: string,
  year: number,
  monthlyRent: number,
  charges: TenantChargeWithRelations[],
  exemptOptions?: {
    claimStart?: string | null;
    manualExemptMonths?: ReadonlySet<string> | string[];
  },
  amountForMonth?: (monthKeyStr: string) => number,
): TenantRentCalendar {
  const tenantRent = charges.filter(
    (c) =>
      c.type === 'RENT' &&
      chargeBelongsToTenant(c, tenantId) &&
      c.due_date?.startsWith(String(year)),
  );

  const byMonth = new Map<string, TenantChargeWithRelations>();
  for (const c of tenantRent) {
    const key = c.due_date.slice(0, 7);
    const existing = byMonth.get(key);
    if (!existing || chargeIsMorePaid(c, existing)) {
      byMonth.set(key, c);
    }
  }

  const months: RentCalendarMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = monthKey(year, i + 1);
    const charge = byMonth.get(month);

    if (charge) {
      const amount = Number(charge.amount) || 0;
      const paid = effectiveRentPaidOnCharge(charge);
      const journal_links = activeRentJournalLinks(charge).map((l) => ({
        journal_entry_id: l.journal_entry_id,
        journal_number: l.journal?.number ?? null,
        amount: Number(l.amount) || 0,
      }));
      return {
        month,
        status: monthStatusFromCharge(charge),
        amount,
        paid,
        charge_id: charge.id,
        description: charge.description,
        journal_entry_id: charge.journal_entry_id,
        journal_number: charge.journal?.number ?? null,
        journal_links: journal_links.length > 0 ? journal_links : undefined,
      };
    }

    return emptyMonth(year, i + 1, monthlyRent, amountForMonth);
  });

  const resolvedMonths = exemptOptions
    ? applyExemptOverlayToCalendarMonths(months, exemptOptions)
    : months;

  let contractId: string | null = null;
  for (const c of tenantRent) {
    if (c.contract_id) {
      contractId = c.contract_id;
      break;
    }
  }

  return {
    year,
    tenant_id: tenantId,
    monthly_rent: monthlyRent,
    contract_id: contractId,
    months: resolvedMonths,
  };
}

/** يستنتج شهر الإيجار من الوصف أو تاريخ المعاملة */
export function inferRentMonthKey(
  tx: { tx_date: string; description?: string | null },
  year: number,
): string | null {
  const fromDesc = tx.description?.match(MONTH_KEY_RE);
  if (fromDesc) {
    const key = `${fromDesc[1]}-${fromDesc[2]}`;
    if (key.startsWith(String(year))) return key;
  }
  const fromDate = tx.tx_date?.slice(0, 7);
  if (fromDate?.startsWith(String(year))) return fromDate;
  return null;
}

/** يرفع حالة الشهر إذا وُجد تحصيل إيجار دون تحديث المطالبة */
export function applyRentTransactionsToCalendar(
  calendar: TenantRentCalendar,
  transactions: TransactionWithRelations[],
): TenantRentCalendar {
  const paidByMonth = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.kind !== 'REVENUE') continue;
    if (!isRentCategoryCode(tx.category?.code)) continue;
    const month = inferRentMonthKey(tx, calendar.year);
    if (!month) continue;
    paidByMonth.set(
      month,
      (paidByMonth.get(month) ?? 0) + (Number(tx.amount) || 0),
    );
  }

  const months = calendar.months.map((m) => {
    if (m.status === 'paid') return m;

    const txPaid = paidByMonth.get(m.month) ?? 0;
    if (txPaid <= 0) return m;

    const expected =
      m.amount > 0 ? m.amount : calendar.monthly_rent > 0 ? calendar.monthly_rent : 0;
    const combinedPaid = m.paid + txPaid;

    if (expected > 0 && combinedPaid >= expected * 0.99) {
      return {
        ...m,
        status: 'paid' as const,
        paid: Math.max(m.paid, combinedPaid),
      };
    }

    if (combinedPaid > 0) {
      return {
        ...m,
        status: 'partial' as const,
        paid: Math.max(m.paid, combinedPaid),
      };
    }

    return m;
  });

  return { ...calendar, months };
}

export function mergeTenantRentCalendars(
  ...calendars: (TenantRentCalendar | null | undefined)[]
): TenantRentCalendar | null {
  const valid = calendars.filter((c): c is TenantRentCalendar => !!c?.months?.length);
  if (valid.length === 0) return null;

  const year = valid[0].year;
  const tenantId = valid[0].tenant_id;
  const monthlyRent = Math.max(...valid.map((c) => c.monthly_rent ?? 0));
  const contractId = valid.find((c) => c.contract_id)?.contract_id ?? null;

  const months: RentCalendarMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = monthKey(year, i + 1);
    let best: RentCalendarMonth | null = null;
    for (const cal of valid) {
      const cell = cal.months.find((x) => x.month === month);
      if (!cell) continue;
      best = best ? pickBetterMonth(best, cell) : cell;
    }
    return best ?? emptyMonth(year, i + 1, monthlyRent);
  });

  return {
    year,
    tenant_id: tenantId,
    monthly_rent: monthlyRent,
    contract_id: contractId,
    months,
  };
}

/** تقويم الإيجار من المطالبات فقط — لا يُستنتج من تاريخ المعاملات */
export function buildMergedTenantRentCalendar(input: {
  tenantId: string;
  year: number;
  monthlyRent: number;
  charges: TenantChargeWithRelations[];
  rpcCalendar?: TenantRentCalendar | null;
  exemptOptions?: {
    claimStart?: string | null;
    manualExemptMonths?: ReadonlySet<string> | string[];
  };
  /** جدول أسعار متغير — يُستخدم للأشهر بلا مطالبة بعد */
  amountForMonth?: (monthKeyStr: string) => number;
}): TenantRentCalendar {
  const fromCharges = buildRentCalendarFromCharges(
    input.tenantId,
    input.year,
    input.monthlyRent,
    input.charges,
    input.exemptOptions,
    input.amountForMonth,
  );

  const merged =
    mergeTenantRentCalendars(fromCharges, input.rpcCalendar ?? null) ?? fromCharges;

  if (!input.exemptOptions) return merged;

  return {
    ...merged,
    months: applyExemptOverlayToCalendarMonths(merged.months, input.exemptOptions),
  };
}

export function monthStatusLabelForCalendar(
  calendar: TenantRentCalendar | undefined,
  monthKeyStr: string,
): RentMonthStatus | null {
  return calendar?.months.find((m) => m.month === monthKeyStr)?.status ?? null;
}

function flattenRpcMonths(raw: unknown): RentCalendarMonth[] {
  if (!Array.isArray(raw)) return [];
  const out: RentCalendarMonth[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      out.push(...flattenRpcMonths(item));
      continue;
    }
    if (item && typeof item === 'object' && 'month' in item) {
      out.push(item as RentCalendarMonth);
    }
  }
  return out;
}

export function normalizeRpcRentCalendar(
  raw: unknown,
  tenantId: string,
  year: number,
): TenantRentCalendar | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  let monthsRaw = payload.months;
  if (monthsRaw && !Array.isArray(monthsRaw) && typeof monthsRaw === 'object') {
    monthsRaw = Object.values(monthsRaw as Record<string, unknown>);
  }
  const months = flattenRpcMonths(monthsRaw);
  if (months.length === 0) return null;

  return {
    year: Number(payload.year ?? year),
    tenant_id: String(payload.tenant_id ?? tenantId),
    monthly_rent: Number(payload.monthly_rent ?? 0),
    contract_id: (payload.contract_id as string) ?? null,
    months,
  };
}
