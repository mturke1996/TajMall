import { monthKey, monthNameAr, parseMonthKey } from '@/lib/rent-months';

/** سنة عرض مؤشرات الإيجار في لوحة التحكم (السنة الحالية) */
export function getMallRentDashboardYear(reference = new Date()): number {
  return reference.getFullYear();
}

export const MALL_RENT_DASHBOARD_YEAR = getMallRentDashboardYear();

export type RentChargeSlice = {
  id?: string;
  contract_id: string;
  amount: number;
  total_paid: number;
  due_date: string;
  status?: 'UNPAID' | 'PARTIAL' | 'PAID' | string;
};

export type RentMonthBucket = {
  monthKey: string;
  label: string;
  billed: number;
  collected: number;
  outstanding: number;
  rate: number;
  chargeCount: number;
};

export type PeriodRentKpis = {
  /** مجموع مبالغ مطالبات الإيجار (بعد إزالة التكرار: عقد + شهر) */
  billed: number;
  collected: number;
  outstanding: number;
  rate: number;
  chargeCount: number;
  monthsWithCharges: number;
  monthKeys: string[];
  ytdMonthCount: number;
};

const CHARGE_STATUS_RANK: Record<string, number> = {
  PAID: 3,
  PARTIAL: 2,
  UNPAID: 1,
};

function monthKeyFromDueDate(dueDate: string): string {
  return dueDate.slice(0, 7);
}

function chargeIsMorePaid(a: RentChargeSlice, b: RentChargeSlice): boolean {
  const ra = CHARGE_STATUS_RANK[a.status ?? ''] ?? 0;
  const rb = CHARGE_STATUS_RANK[b.status ?? ''] ?? 0;
  if (ra !== rb) return ra > rb;
  const paidA = Number(a.total_paid) || 0;
  const paidB = Number(b.total_paid) || 0;
  if (paidA !== paidB) return paidA > paidB;
  return (Number(a.amount) || 0) >= (Number(b.amount) || 0);
}

/**
 * مطالبة واحدة لكل (عقد + شهر) — نفس منطق تقويم المستأجر.
 * يمنع مضاعفة المبالغ عند وجود مطالبات مكررة.
 */
export function dedupeRentChargesByContractMonth(
  charges: RentChargeSlice[],
): RentChargeSlice[] {
  const byKey = new Map<string, RentChargeSlice>();
  for (const c of charges) {
    if (!c.contract_id || !c.due_date) continue;
    const key = `${c.contract_id}|${monthKeyFromDueDate(c.due_date)}`;
    const existing = byKey.get(key);
    if (!existing || chargeIsMorePaid(c, existing)) {
      byKey.set(key, c);
    }
  }
  return Array.from(byKey.values());
}

export function buildYearMonthSeries(
  year: number,
  charges: RentChargeSlice[],
): RentMonthBucket[] {
  const buckets = new Map<string, RentMonthBucket>();

  for (let m = 1; m <= 12; m++) {
    const key = monthKey(year, m);
    buckets.set(key, {
      monthKey: key,
      label: monthNameAr(key),
      billed: 0,
      collected: 0,
      outstanding: 0,
      rate: 0,
      chargeCount: 0,
    });
  }

  for (const c of charges) {
    const key = monthKeyFromDueDate(c.due_date);
    const { year: y } = parseMonthKey(key);
    if (y !== year) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(c.amount) || 0;
    const paid = Math.min(Math.max(Number(c.total_paid) || 0, 0), amount);
    bucket.billed += amount;
    bucket.collected += paid;
    bucket.outstanding += Math.max(0, amount - paid);
    bucket.chargeCount += 1;
  }

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    rate: b.billed > 0 ? (b.collected / b.billed) * 100 : 0,
  }));
}

/** أشهر السنة المنقضية حتى الشهر الحالي (أو كامل السنة إن انتهت) */
export function ytdMonthKeysInYear(
  year: number,
  reference = new Date(),
): string[] {
  const refYear = reference.getFullYear();
  const refMonth = reference.getMonth() + 1;
  const endMonth =
    refYear > year ? 12 : refYear === year ? refMonth : 0;
  if (endMonth <= 0) return [];
  const keys: string[] = [];
  for (let m = 1; m <= endMonth; m++) {
    keys.push(monthKey(year, m));
  }
  return keys;
}

/** آخر N أشهر ضمن السنة (حتى الشهر الحالي) */
export function lastNMonthKeysInYear(
  year: number,
  n = 6,
  reference = new Date(),
): string[] {
  const ytd = ytdMonthKeysInYear(year, reference);
  if (ytd.length === 0) return [];
  return ytd.slice(-n);
}

export function aggregatePeriodFromSeries(
  series: RentMonthBucket[],
  monthKeys: string[],
): PeriodRentKpis {
  const keySet = new Set(monthKeys);
  let billed = 0;
  let collected = 0;
  let chargeCount = 0;
  let monthsWithCharges = 0;

  for (const b of series) {
    if (!keySet.has(b.monthKey)) continue;
    billed += b.billed;
    collected += b.collected;
    chargeCount += b.chargeCount;
    if (b.chargeCount > 0) monthsWithCharges += 1;
  }

  const outstanding = Math.max(0, billed - collected);
  const rate = billed > 0 ? (collected / billed) * 100 : 0;

  return {
    billed,
    collected,
    outstanding,
    rate,
    chargeCount,
    monthsWithCharges,
    monthKeys,
    ytdMonthCount: monthKeys.length,
  };
}

export function buildMallRentDashboardModel(
  rawCharges: RentChargeSlice[],
  year = getMallRentDashboardYear(),
  reference = new Date(),
) {
  const deduped = dedupeRentChargesByContractMonth(rawCharges);
  const duplicateCount = Math.max(0, rawCharges.length - deduped.length);

  const series = buildYearMonthSeries(year, deduped);
  const ytdKeys = ytdMonthKeysInYear(year, reference);
  const last6Keys = lastNMonthKeysInYear(year, 6, reference);

  const yearKpis = aggregatePeriodFromSeries(
    series,
    ytdKeys.length > 0
      ? ytdKeys
      : series.filter((s) => s.chargeCount > 0).map((s) => s.monthKey),
  );
  const last6Kpis = aggregatePeriodFromSeries(
    series,
    last6Keys.length > 0
      ? last6Keys
      : series.filter((s) => s.chargeCount > 0).map((s) => s.monthKey),
  );

  const chartSeries = series.filter((s) => {
    if (s.chargeCount === 0) return false;
    const { month } = parseMonthKey(s.monthKey);
    const refYear = reference.getFullYear();
    const refMonth = reference.getMonth() + 1;
    if (refYear < year) return false;
    if (refYear > year) return true;
    return month <= refMonth;
  });

  return {
    year,
    series,
    chartSeries,
    yearKpis,
    last6Kpis,
    last6Keys,
    last6Labels: last6Keys.map((k) => monthNameAr(k)),
    ytdKeys,
    ytdLabels: ytdKeys.map((k) => monthNameAr(k)),
    duplicateCount,
    rawChargeCount: rawCharges.length,
    dedupedChargeCount: deduped.length,
  };
}

export type MallRentDashboardModel = ReturnType<
  typeof buildMallRentDashboardModel
>;
