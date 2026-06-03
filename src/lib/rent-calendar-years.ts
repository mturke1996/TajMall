import { currentYear } from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';

/** سنوات تقويم الإيجار من مطالبات RENT فقط (وليس من تاريخ المعاملات) */
export function deriveTenantRentYears(
  charges: TenantChargeWithRelations[],
  contractStartYear?: number | null,
): number[] {
  const years = new Set<number>([currentYear()]);

  if (contractStartYear && contractStartYear > 1990) {
    years.add(contractStartYear);
  }

  for (const c of charges) {
    if (c.type === 'RENT' && c.due_date?.length >= 4) {
      const y = Number(c.due_date.slice(0, 4));
      if (!Number.isNaN(y)) years.add(y);
    }
  }

  return [...years].sort((a, b) => b - a);
}
