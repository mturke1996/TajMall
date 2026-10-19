/**
 * Monthly billing preview: which active leases still lack the month's rent (and service) charge, before
 * and after pressing «توليد الفواتير».
 *
 * It predicts what generate_monthly_charges does, not what it must do. The function bills every active
 * lease and skips months a tenant is exempt from, so the preview counts a lease as due when it is active,
 * overlaps the month and has something to bill, and leaves the rest to the server's own result. Three
 * things follow from how the server works and are mirrored here:
 *  - rent is one charge per tenant and month (it lands on one of the tenant's leases), so a tenant with
 *    two running leases is billed rent once; a service charge is per lease;
 *  - an explicit exempt month removes the rent but not the service charge;
 *  - a lease still marked active after its end date is billed too, which is why it is reported apart
 *    instead of being silently counted or dropped.
 */
import { arabicCount, formatMoney } from '@/lib/utils';
import { formatMonthLabelAr } from '@/lib/rent-months';

type Num = number | string | null | undefined;

export type BillingContract = {
  id: string;
  tenant_id: string;
  status: string;
  /** "YYYY-MM-DD" */
  start_date: string | null;
  /** "YYYY-MM-DD"; an empty end means open-ended */
  end_date: string | null;
  monthly_rent?: Num;
  services_amount?: Num;
  tenant?: { name?: string | null } | null;
  unit?: { unit_number?: string | null } | null;
};

export type BillingCharge = {
  contract_id: string;
  type: string;
  due_date: string | null;
  contract?: { tenant_id?: string | null } | null;
};

export type BillingExempt = { tenant_id: string; month_key: string };

export type BillingMonthStatus = {
  /** "YYYY-MM" */
  month: string;
  /** leases that have something to bill this month */
  total: number;
  generated: number;
  missing: number;
  /** contract value (rent + services) of the charges not generated yet */
  missingAmount: number;
  complete: boolean;
};

export type BillingMissingLine = {
  contractId: string;
  tenantId: string;
  tenantName: string;
  unitNumber: string | null;
  /** the rent still to generate, or null when this lease's rent exists or is carried by another lease */
  missingRent: number | null;
  missingService: number | null;
};

export type BillingPreview = BillingMonthStatus & {
  today: string;
  missingLines: BillingMissingLine[];
  /** active leases that ended before this month: the run still bills them, so they are not counted above */
  endedActive: number;
  /** tenants whose rent is exempt this month (their service charge, if any, still counts above) */
  exemptTenants: number;
  /** leases with no rent figure and no service amount: nothing to bill */
  unpriced: number;
  /** the month has not started yet */
  future: boolean;
  /** the current month and the two before it, oldest first */
  recent: BillingMonthStatus[];
};

export type BillingPostingRule = 'open' | 'dated-today' | 'blocked';
export type BillingPeriod = { start_date: string; end_date: string; is_closed: boolean };

export type BillingRunResult = {
  month: string | null;
  rentCreated: number;
  serviceCreated: number;
  created: number;
};

const MONTH_RX = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RX = /^\d{4}-\d{2}-\d{2}/;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const day = (v: string | null | undefined) => (typeof v === 'string' && DAY_RX.test(v) ? v.slice(0, 10) : '');

export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RX.test(v);
}

/** "2026-01" moved by whole months; an invalid key is returned unchanged. */
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RX.exec(month);
  if (!m) return month;
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}

function lastDayOf(month: string): string {
  const m = MONTH_RX.exec(month);
  if (!m) return '';
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** The current month and the two before it, oldest first. */
export function recentBillingMonths(today: string): string[] {
  const current = day(today).slice(0, 7);
  if (!isMonthKey(current)) return [];
  return [shiftMonth(current, -2), shiftMonth(current, -1), current];
}

/** Months the billing run can be pointed at: next month first, then back a year. */
export function billingMonthOptions(today: string): string[] {
  const current = day(today).slice(0, 7);
  if (!isMonthKey(current)) return [];
  return Array.from({ length: 14 }, (_, i) => shiftMonth(current, 1 - i));
}

/** The span of months whose exempt marks the preview needs (everything the run can be pointed at). */
export function billingExemptWindow(today: string): { from: string; to: string } | null {
  const options = billingMonthOptions(today);
  return options.length ? { from: options[options.length - 1], to: options[0] } : null;
}

type MonthIndex = { rentTenants: Set<string>; serviceContracts: Set<string> };

function indexCharges(charges: BillingCharge[], months: Set<string>, tenantOf: Map<string, string>) {
  const byMonth = new Map<string, MonthIndex>();
  for (const m of months) byMonth.set(m, { rentTenants: new Set(), serviceContracts: new Set() });
  for (const c of charges) {
    if (c.type !== 'RENT' && c.type !== 'SERVICE') continue;
    const due = day(c.due_date);
    // the database matches a month's charge on its first day
    if (!due || due.slice(8, 10) !== '01') continue;
    const slot = byMonth.get(due.slice(0, 7));
    if (!slot) continue;
    if (c.type === 'SERVICE') {
      slot.serviceContracts.add(c.contract_id);
    } else {
      const tenant = tenantOf.get(c.contract_id) ?? c.contract?.tenant_id ?? null;
      if (tenant) slot.rentTenants.add(tenant);
    }
  }
  return byMonth;
}

const byShop = (a: BillingMissingLine, b: BillingMissingLine) => {
  if (a.unitNumber == null && b.unitNumber != null) return 1;
  if (a.unitNumber != null && b.unitNumber == null) return -1;
  return (
    (a.unitNumber ?? '').localeCompare(b.unitNumber ?? '', 'en', { numeric: true }) ||
    a.tenantName.localeCompare(b.tenantName, 'ar') ||
    a.contractId.localeCompare(b.contractId)
  );
};

function evaluateMonth(month: string, active: BillingContract[], exempt: Set<string>, index: MonthIndex) {
  const first = `${month}-01`;
  const last = lastDayOf(month);

  const running: BillingContract[] = [];
  let endedActive = 0;
  for (const c of active) {
    const start = day(c.start_date);
    const end = day(c.end_date);
    if (start && start > last) continue;
    if (end && end < first) {
      endedActive += 1;
      continue;
    }
    running.push(c);
  }

  const byTenant = new Map<string, BillingContract[]>();
  for (const c of running) {
    const group = byTenant.get(c.tenant_id);
    if (group) group.push(c);
    else byTenant.set(c.tenant_id, [c]);
  }

  let total = 0;
  let generated = 0;
  let unpriced = 0;
  let exemptTenants = 0;
  let missingAmount = 0;
  const missingLines: BillingMissingLine[] = [];

  for (const [tenantId, leases] of byTenant) {
    const withRent = leases.filter((l) => num(l.monthly_rent) > 0);
    const isExempt = exempt.has(`${tenantId}|${month}`);
    if (isExempt && withRent.length > 0) exemptTenants += 1;

    // the lease that carries the tenant's rent: the latest one with a rent figure
    const carrier = isExempt
      ? null
      : [...withRent].sort((a, b) => day(b.start_date).localeCompare(day(a.start_date)) || a.id.localeCompare(b.id))[0] ?? null;

    for (const lease of leases) {
      const rent = lease === carrier ? round3(num(lease.monthly_rent)) : 0;
      const service = round3(num(lease.services_amount));
      if (rent <= 0 && service <= 0) {
        // a lease that only duplicates the tenant's rent has nothing of its own; one with no figure at all is reported
        if (withRent.length === 0) unpriced += 1;
        continue;
      }
      total += 1;
      const missingRent = rent > 0 && !index.rentTenants.has(tenantId) ? rent : null;
      const missingService = service > 0 && !index.serviceContracts.has(lease.id) ? service : null;
      if (missingRent == null && missingService == null) {
        generated += 1;
        continue;
      }
      missingAmount += (missingRent ?? 0) + (missingService ?? 0);
      missingLines.push({
        contractId: lease.id,
        tenantId,
        tenantName: lease.tenant?.name?.trim() || 'مستأجر',
        unitNumber: lease.unit?.unit_number?.trim() || null,
        missingRent,
        missingService,
      });
    }
  }

  missingLines.sort(byShop);
  const status: BillingMonthStatus = {
    month,
    total,
    generated,
    missing: total - generated,
    missingAmount: round3(missingAmount),
    complete: total === generated,
  };
  return { status, missingLines, endedActive, exemptTenants, unpriced };
}

export function buildBillingPreview(input: {
  contracts: BillingContract[];
  charges: BillingCharge[];
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD" */
  today: string;
  exemptMonths?: BillingExempt[];
}): BillingPreview {
  const { contracts, charges, month, exemptMonths = [] } = input;
  const today = day(input.today);
  const currentMonth = today.slice(0, 7);
  const recentMonths = recentBillingMonths(today);

  const emptyStatus = (m: string): BillingMonthStatus => ({ month: m, total: 0, generated: 0, missing: 0, missingAmount: 0, complete: true });
  if (!isMonthKey(month)) {
    return {
      ...emptyStatus(month),
      today,
      missingLines: [],
      endedActive: 0,
      exemptTenants: 0,
      unpriced: 0,
      future: false,
      recent: recentMonths.map(emptyStatus),
    };
  }

  const active = contracts.filter((c) => c.status === 'ACTIVE');
  const tenantOf = new Map(contracts.map((c) => [c.id, c.tenant_id] as const));
  const exempt = new Set(exemptMonths.map((e) => `${e.tenant_id}|${e.month_key}`));
  const wanted = new Set([month, ...recentMonths]);
  const index = indexCharges(charges, wanted, tenantOf);
  const empty: MonthIndex = { rentTenants: new Set(), serviceContracts: new Set() };

  const selected = evaluateMonth(month, active, exempt, index.get(month) ?? empty);
  const recent = recentMonths.map((m) => (m === month ? selected.status : evaluateMonth(m, active, exempt, index.get(m) ?? empty).status));

  return {
    ...selected.status,
    today,
    missingLines: selected.missingLines,
    endedActive: selected.endedActive,
    exemptTenants: selected.exemptTenants,
    unpriced: selected.unpriced,
    future: isMonthKey(currentMonth) && month > currentMonth,
    recent,
  };
}

/**
 * The newest month in `recent` that still lacks charges, with how many earlier months are incomplete too.
 * Months after today's are ignored: a month that has not begun is not late.
 */
export function latestIncompleteMonth(recent: BillingMonthStatus[], today: string) {
  const current = day(today).slice(0, 7);
  const incomplete = recent.filter((m) => m.missing > 0 && m.month <= current);
  if (incomplete.length === 0) return null;
  return { status: incomplete[incomplete.length - 1], earlierMonths: incomplete.length - 1 };
}

/** The month's charges are expected within its first days; from the 5th an incomplete current month is late. */
export const BILLING_LATE_FROM_DAY = 5;

/** An incomplete past month is late whatever the day; the current month only once its first days have passed. */
export function billingIsLate(late: NonNullable<ReturnType<typeof latestIncompleteMonth>>, today: string): boolean {
  const d = day(today);
  const dayOfMonth = Number(d.slice(8, 10)) || 1;
  return late.status.month < d.slice(0, 7) || late.earlierMonths > 0 || dayOfMonth >= BILLING_LATE_FROM_DAY;
}

/**
 * Whether the run can post this month's charges. The server dates a charge on its month and, when that
 * period is closed, on today instead; it refuses only when today's period is closed as well.
 */
export function billingPostingRule(input: { month: string; today: string; periods: BillingPeriod[] }): BillingPostingRule {
  const closedOn = (d: string) => input.periods.some((p) => p.is_closed && p.start_date <= d && d <= p.end_date);
  if (!isMonthKey(input.month) || !closedOn(`${input.month}-01`)) return 'open';
  return closedOn(day(input.today)) ? 'blocked' : 'dated-today';
}

/** What generate_monthly_charges reports; null when the reply is not the shape the screen understands. */
export function parseBillingRunResult(data: unknown): BillingRunResult | null {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  // a count the server did not send, or sent as something else, is unknown (null), never zero
  const count = (v: unknown) => {
    if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v.trim())) return null;
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const rent = count(d.rent_created);
  const service = count(d.service_created);
  const created = count(d.created) ?? (rent != null || service != null ? (rent ?? 0) + (service ?? 0) : null);
  if (created == null) return null;
  return {
    month: isMonthKey(d.month) ? d.month : null,
    rentCreated: rent ?? 0,
    serviceCreated: service ?? 0,
    created,
  };
}

// «من» takes the genitive: «من عقدين»
const CONTRACTS_AFTER_FROM: [string, string, string, string] = ['عقد واحد', 'عقدين', 'عقود', 'عقداً'];
const CONTRACTS: [string, string, string, string] = ['عقد واحد', 'عقدان', 'عقود', 'عقداً'];
const CHARGES_CREATED: [string, string, string, string] = ['مطالبة واحدة', 'مطالبتين', 'مطالبات', 'مطالبة'];

/** «وُلِّد 52 من 68 عقداً · ناقص 16» */
export function billingCountLine(s: Pick<BillingMonthStatus, 'total' | 'generated' | 'missing'>): string {
  if (s.total === 0) return 'لا عقود تُطالَب في هذا الشهر';
  const base = `وُلِّد ${s.generated} من ${arabicCount(s.total, CONTRACTS_AFTER_FROM)}`;
  return s.missing > 0 ? `${base} · ناقص ${s.missing}` : base;
}

/** The follow-up row's second line: «ناقص 16 من 68 عقداً · قيمتها في العقود 28,400 د.ل · وشهر سابق ناقص أيضاً» */
export function billingFollowUpDetail(item: { count: number; amount: number | null; billing?: { total: number; earlierMonths: number } }): string {
  const total = item.billing?.total ?? item.count;
  const parts = [`ناقص ${item.count} من ${arabicCount(total, CONTRACTS_AFTER_FROM)}`];
  if (item.amount != null && item.amount > 0) parts.push(`قيمتها في العقود ${formatMoney(item.amount, 'LYD')}`);
  const earlier = item.billing?.earlierMonths ?? 0;
  if (earlier === 1) parts.push('وشهر سابق ناقص أيضاً');
  else if (earlier >= 2) parts.push('وشهران سابقان ناقصان أيضاً');
  return parts.join(' · ');
}

export function billingFollowUpTitle(month: string): string {
  return `شهر ${formatMonthLabelAr(month)} لم تُولَّد مطالباته كاملة`;
}

/** What the run really created, as the server counted it. */
export function billingRunHeadline(r: BillingRunResult): string {
  return r.created === 0 ? 'لم يُنشئ النظام مطالبات جديدة' : `أنشأ النظام ${arabicCount(r.created, CHARGES_CREATED)}`;
}

/** «إيجار 14 · خدمات 2», or null when the run created nothing */
export function billingRunBreakdown(r: BillingRunResult): string | null {
  const parts = [r.rentCreated > 0 ? `إيجار ${r.rentCreated}` : null, r.serviceCreated > 0 ? `خدمات ${r.serviceCreated}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Active leases past their end date: the run bills them, yet the preview does not count them. */
export function billingEndedActiveNote(n: number): string {
  if (n === 1) return 'عقد نشط انتهت مدته قبل هذا الشهر وليس ضمن العدّ، وقد يولّد النظام له مطالبة أيضاً.';
  if (n === 2) return 'عقدان نشطان انتهت مدتهما قبل هذا الشهر وليسا ضمن العدّ، وقد يولّد النظام لهما مطالبة أيضاً.';
  return `${arabicCount(n, ['', '', 'عقود نشطة', 'عقداً نشطاً'])} انتهت مدتها قبل هذا الشهر وليست ضمن العدّ، وقد يولّد النظام لها مطالبات أيضاً.`;
}

/** «بقي 3 عقود دون مطالبة» */
export function billingLeftLine(missing: number): string {
  return `بقي ${arabicCount(missing, CONTRACTS)} دون مطالبة`;
}
