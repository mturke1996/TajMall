import type { TenantChargeWithRelations } from '@/lib/db/types';

export function chargeToInvoiceModel(charge: TenantChargeWithRelations) {
  return {
    description: charge.description,
    type: charge.type,
    due_date: charge.due_date,
    amount: Number(charge.amount),
    total_paid: Number(charge.total_paid),
    status: charge.status,
    tenant_name: charge.contract?.tenant?.name ?? 'مستأجر',
    shop_number: charge.contract?.unit?.unit_number ?? null,
    unit_floor: charge.contract?.unit?.floor ?? null,
    phone: charge.contract?.tenant?.phone ?? null,
  };
}

export function isRentCategoryCode(code: string | undefined) {
  return code === 'REV-RNT' || code === 'REV-SRV';
}
