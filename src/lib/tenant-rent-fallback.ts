import type { TenantRentSummary } from '@/lib/db/queries';
import type { ContactRow } from '@/lib/db/types';

/** ملخص إيجار افتراضي عند غياب صف في tenant_rent_summary */
export function fallbackTenantRentFromContact(
  contact: ContactRow,
): TenantRentSummary {
  const monthly = Number(contact.monthly_rent) || 0;
  return {
    id: contact.id,
    name: contact.name,
    shop_number: contact.shop_number,
    floor: contact.floor,
    monthly_rent: contact.monthly_rent,
    phone: contact.phone,
    current_month_paid: '0',
    current_month_amount: String(monthly),
    current_month_status: monthly > 0 ? 'unpaid' : 'no_rent_set',
    last_12_months_revenue: '0',
    total_balance: '0',
    total_rent_paid: '0',
    open_charges_count: 0,
    open_charges_total: '0',
  };
}
