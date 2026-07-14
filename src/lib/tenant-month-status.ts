import type { TenantRentSummary } from '@/lib/db/queries';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import { effectiveRentPaidOnCharge } from '@/lib/rent-calendar-from-charges';
import type { TenantRentStatusKey } from '@/components/tenants/tenant-status-config';

const CHARGE_STATUS_RANK: Record<string, number> = {
  PAID: 3,
  PARTIAL: 2,
  UNPAID: 1,
};

function chargeIsMorePaid(
  a: TenantChargeWithRelations,
  b: TenantChargeWithRelations,
): boolean {
  const ra = CHARGE_STATUS_RANK[a.status] ?? 0;
  const rb = CHARGE_STATUS_RANK[b.status] ?? 0;
  if (ra !== rb) return ra > rb;
  return Number(a.total_paid) > Number(b.total_paid);
}

/** فهرس مطالبات الإيجار: tenantId → monthKey → أفضل مطالبة */
export function indexRentChargesByTenantMonth(
  charges: TenantChargeWithRelations[],
): Map<string, Map<string, TenantChargeWithRelations>> {
  const byTenant = new Map<string, Map<string, TenantChargeWithRelations>>();

  for (const charge of charges) {
    if (charge.type !== 'RENT' || !charge.due_date) continue;
    const tenantId =
      charge.contract?.tenant?.id ??
      (charge.contract as { tenant_id?: string } | null | undefined)?.tenant_id;
    if (!tenantId) continue;

    const month = charge.due_date.slice(0, 7);
    let byMonth = byTenant.get(tenantId);
    if (!byMonth) {
      byMonth = new Map();
      byTenant.set(tenantId, byMonth);
    }
    const existing = byMonth.get(month);
    if (!existing || chargeIsMorePaid(charge, existing)) {
      byMonth.set(month, charge);
    }
  }

  return byTenant;
}

export function resolveTenantMonthStatus(
  tenant: Pick<TenantRentSummary, 'id' | 'monthly_rent'>,
  monthKey: string,
  index: Map<string, Map<string, TenantChargeWithRelations>>,
): {
  status: TenantRentStatusKey;
  amount: number;
  paid: number;
} {
  const monthlyRent = Number(tenant.monthly_rent) || 0;
  const charge = index.get(tenant.id)?.get(monthKey);

  if (charge) {
    const amount = Number(charge.amount) || monthlyRent || 0;
    const paid = effectiveRentPaidOnCharge(charge);
    if (amount > 0 && paid >= amount) {
      return { status: 'paid_full', amount, paid };
    }
    if (paid > 0) {
      return { status: 'paid_partial', amount, paid };
    }
    if (amount <= 0 && monthlyRent <= 0) {
      return { status: 'no_rent_set', amount: 0, paid: 0 };
    }
    return { status: 'unpaid', amount: amount || monthlyRent, paid };
  }

  if (monthlyRent <= 0) {
    return { status: 'no_rent_set', amount: 0, paid: 0 };
  }
  return { status: 'unpaid', amount: monthlyRent, paid: 0 };
}

/** يحدّث حقول الشهر الحالي في الملخص ليعكس الشهر المختار */
export function withSelectedMonthStatus(
  tenant: TenantRentSummary,
  monthKey: string,
  index: Map<string, Map<string, TenantChargeWithRelations>>,
): TenantRentSummary {
  const resolved = resolveTenantMonthStatus(tenant, monthKey, index);
  return {
    ...tenant,
    current_month_key: monthKey,
    current_month_amount: String(resolved.amount),
    current_month_paid: String(resolved.paid),
    current_month_status: resolved.status,
  };
}
