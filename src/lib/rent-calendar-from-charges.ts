import type { TenantChargeWithRelations } from '@/lib/db/types';
import {
  monthKey,
  type RentCalendarMonth,
  type RentMonthStatus,
  type TenantRentCalendar,
} from '@/lib/rent-months';

/** يبني تقويم السنة من مطالبات RENT (يعمل بدون هجرة 022) */
export function buildRentCalendarFromCharges(
  tenantId: string,
  year: number,
  monthlyRent: number,
  charges: TenantChargeWithRelations[],
): TenantRentCalendar {
  const tenantRent = charges.filter(
    (c) =>
      c.type === 'RENT' &&
      c.contract?.tenant?.id === tenantId &&
      c.due_date?.startsWith(String(year)),
  );

  const byMonth = new Map<string, TenantChargeWithRelations>();
  for (const c of tenantRent) {
    const key = c.due_date.slice(0, 7);
    byMonth.set(key, c);
  }

  const months: RentCalendarMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = monthKey(year, i + 1);
    const charge = byMonth.get(month);

    if (charge) {
      const amount = Number(charge.amount) || 0;
      const paid = Number(charge.total_paid) || 0;
      let status: RentMonthStatus = 'unpaid';
      if (charge.status === 'PAID' || (amount > 0 && paid >= amount)) {
        status = 'paid';
      } else if (paid > 0 || charge.status === 'PARTIAL') {
        status = 'partial';
      }
      return {
        month,
        status,
        amount,
        paid,
        charge_id: charge.id,
        description: charge.description,
      };
    }

    if (monthlyRent > 0) {
      return {
        month,
        status: 'no_charge',
        amount: monthlyRent,
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
  });

  return {
    year,
    tenant_id: tenantId,
    monthly_rent: monthlyRent,
    contract_id: tenantRent[0]?.contract_id ?? null,
    months,
  };
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
  const months = Array.isArray(monthsRaw) ? (monthsRaw as RentCalendarMonth[]) : [];
  if (months.length === 0) return null;

  return {
    year: Number(payload.year ?? year),
    tenant_id: String(payload.tenant_id ?? tenantId),
    monthly_rent: Number(payload.monthly_rent ?? 0),
    contract_id: (payload.contract_id as string) ?? null,
    months,
  };
}
