import type { TenantRentSummary } from '@/lib/db/queries';
import type {
  MallRentDashboardModel,
  PeriodRentKpis,
  RentMonthBucket,
} from '@/lib/mall-rent-collection-series';
import { currentMonthNameAr } from '@/lib/rent-months';

export type MallRentPeriodId = 'ytd' | 'last6';

export type MallRentMonthRow = {
  monthKey: string;
  label: string;
  billed: number;
  collected: number;
  outstanding: number;
  rate: number;
  chargeCount: number;
  hasData: boolean;
};

export type MallRentHealthSnapshot = {
  activeTenants: number;
  withRentSet: number;
  currentMonthPaid: number;
  currentMonthPartial: number;
  currentMonthUnpaid: number;
  currentMonthLabel: string;
  openAllTime: number;
  openCountAllTime: number;
};

export function buildMallRentHealth(
  tenants: TenantRentSummary[],
): MallRentHealthSnapshot {
  let currentMonthPaid = 0;
  let currentMonthPartial = 0;
  let currentMonthUnpaid = 0;
  let withRentSet = 0;
  let openAllTime = 0;
  let openCountAllTime = 0;

  for (const t of tenants) {
    if (Number(t.monthly_rent) > 0) withRentSet += 1;
    if (t.current_month_status === 'paid_full') currentMonthPaid += 1;
    else if (t.current_month_status === 'paid_partial') currentMonthPartial += 1;
    else if (t.current_month_status === 'unpaid') currentMonthUnpaid += 1;
    openAllTime += Number(t.open_charges_total ?? 0);
    openCountAllTime += Number(t.open_charges_count ?? 0);
  }

  return {
    activeTenants: tenants.length,
    withRentSet,
    currentMonthPaid,
    currentMonthPartial,
    currentMonthUnpaid,
    currentMonthLabel: currentMonthNameAr(),
    openAllTime,
    openCountAllTime,
  };
}

export function buildMonthTableRows(
  series: RentMonthBucket[],
  monthKeys: string[],
): MallRentMonthRow[] {
  const byKey = new Map(series.map((s) => [s.monthKey, s]));
  return monthKeys.map((key) => {
    const b = byKey.get(key);
    if (!b || b.chargeCount === 0) {
      return {
        monthKey: key,
        label: b?.label ?? key,
        billed: 0,
        collected: 0,
        outstanding: 0,
        rate: 0,
        chargeCount: 0,
        hasData: false,
      };
    }
    return {
      monthKey: key,
      label: b.label,
      billed: b.billed,
      collected: b.collected,
      outstanding: b.outstanding,
      rate: b.rate,
      chargeCount: b.chargeCount,
      hasData: true,
    };
  });
}

export function periodMeta(
  period: MallRentPeriodId,
  model: MallRentDashboardModel,
): {
  kpis: PeriodRentKpis;
  title: string;
  rangeLabel: string;
  monthKeys: string[];
} {
  if (period === 'last6') {
    return {
      kpis: model.last6Kpis,
      title: 'آخر 6 أشهر',
      rangeLabel: model.last6Labels.join(' · '),
      monthKeys: model.last6Keys,
    };
  }
  return {
    kpis: model.yearKpis,
    title: `من بداية ${model.year}`,
    rangeLabel:
      model.ytdLabels.length > 0
        ? `${model.ytdLabels[0]} — ${model.ytdLabels[model.ytdLabels.length - 1]}`
        : `سنة ${model.year}`,
    monthKeys: model.ytdKeys,
  };
}

export function collectionRateTone(rate: number): 'good' | 'mid' | 'low' {
  if (rate >= 85) return 'good';
  if (rate >= 55) return 'mid';
  return 'low';
}
