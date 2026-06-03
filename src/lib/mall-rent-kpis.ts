import type { TenantRentSummary } from '@/lib/db/queries';

export type MallRentKpis = {
  totalTenants: number;
  /** إجمالي المسدّد من مطالبات الإيجار (كل الشهور) */
  collectedRent: number;
  /** إجمالي المستحق = مسدّد + متبقي على المطالبات */
  expectedRent: number;
  outstandingRent: number;
  collectionRate: number;
  openChargesCount: number;
  /** عدد مستأجرين أوفيّا على الشهر الحالي */
  currentMonthPaidCount: number;
  basis: 'charges' | 'monthly';
};

/**
 * مؤشرات تحصيل المول من مطالبات الإيجار (total_rent_paid + open_charges_total)،
 * وليس من إيجار الشهر الحالي فقط.
 */
/** إيجار شهري × عدد أشهر السنة المنقضية (تقدير عقود — ليس مطالبات مسجّلة) */
export function theoreticalYtdRentFromTenants(
  tenants: Pick<TenantRentSummary, 'monthly_rent'>[],
  ytdMonthCount: number,
): number {
  if (ytdMonthCount <= 0) return 0;
  return tenants.reduce(
    (s, t) => s + (Number(t.monthly_rent) || 0) * ytdMonthCount,
    0,
  );
}

export function aggregateMallRentKpis(
  tenants: TenantRentSummary[],
): MallRentKpis {
  const totalTenants = tenants.length;
  let collected = 0;
  let outstanding = 0;
  let openChargesCount = 0;
  let currentMonthPaidCount = 0;

  for (const t of tenants) {
    collected += Number(t.total_rent_paid ?? 0);
    outstanding += Number(t.open_charges_total ?? 0);
    openChargesCount += Number(t.open_charges_count ?? 0);
    if (t.current_month_status === 'paid_full') {
      currentMonthPaidCount += 1;
    }
  }

  const billed = collected + outstanding;
  if (billed > 0) {
    return {
      totalTenants,
      collectedRent: collected,
      expectedRent: billed,
      outstandingRent: outstanding,
      collectionRate: (collected / billed) * 100,
      openChargesCount,
      currentMonthPaidCount,
      basis: 'charges',
    };
  }

  const expectedRent = tenants.reduce(
    (s, t) => s + (Number(t.monthly_rent) || 0),
    0,
  );
  const collectedRent = tenants.reduce(
    (s, t) => s + Number(t.current_month_paid ?? 0),
    0,
  );
  const outstandingRent = Math.max(0, expectedRent - collectedRent);
  const collectionRate =
    expectedRent > 0 ? (collectedRent / expectedRent) * 100 : 0;

  return {
    totalTenants,
    collectedRent,
    expectedRent,
    outstandingRent,
    collectionRate,
    openChargesCount,
    currentMonthPaidCount,
    basis: 'monthly',
  };
}
