import { chargeBelongsToTenant } from '@/lib/rent-calendar-from-charges';
import { formatMonthLabelAr } from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';

export function rentChargesByMonth(
  charges: TenantChargeWithRelations[],
  tenantId: string,
): Map<string, TenantChargeWithRelations> {
  const map = new Map<string, TenantChargeWithRelations>();
  for (const c of charges) {
    if (c.type !== 'RENT' || !chargeBelongsToTenant(c, tenantId) || !c.due_date) continue;
    const key = c.due_date.slice(0, 7);
    map.set(key, c);
  }
  return map;
}

function chargeUsesJournal(
  charge: TenantChargeWithRelations,
  journalId: string,
): boolean {
  if (charge.journal_entry_id === journalId) return true;
  return (charge.rent_journal_links ?? []).some(
    (l) => l.journal_entry_id === journalId,
  );
}

/** شهر آخر مربوط بنفس القيد (إن وُجد) — يُستثنى الشهر/الشهور المحددة حالياً */
export function monthLinkedToJournal(
  charges: TenantChargeWithRelations[],
  tenantId: string,
  journalId: string,
  exceptMonths?: string | string[],
): string | null {
  const exceptSet = new Set(
    exceptMonths == null
      ? []
      : Array.isArray(exceptMonths)
        ? exceptMonths
        : [exceptMonths],
  );
  for (const [month, c] of rentChargesByMonth(charges, tenantId)) {
    if (exceptSet.has(month)) continue;
    if (chargeUsesJournal(c, journalId)) return month;
  }
  return null;
}

export function sumRentMonthsRemaining(
  chargesByMonth: Map<string, TenantChargeWithRelations>,
  months: string[],
  monthlyRent: number,
): { totalRemaining: number; totalAmount: number; totalPaid: number } {
  let totalRemaining = 0;
  let totalAmount = 0;
  let totalPaid = 0;
  for (const month of months) {
    const c = chargesByMonth.get(month);
    const amount = Math.max(Number(c?.amount) || monthlyRent || 0, 0);
    const paid = Math.max(Number(c?.total_paid) || 0, 0);
    totalAmount += amount;
    totalPaid += paid;
    totalRemaining += Math.max(amount - paid, 0);
  }
  return { totalRemaining, totalAmount, totalPaid };
}

export function journalAlreadyLinkedToMonth(
  charge: TenantChargeWithRelations | undefined,
  journalId: string,
): boolean {
  if (!charge) return false;
  return chargeUsesJournal(charge, journalId);
}

export function filterTenantJournalEntries(
  entries: JournalEntryRow[],
  excludeReversed = true,
): JournalEntryRow[] {
  return entries.filter((je) => {
    if (excludeReversed && je.status === 'REVERSED') return false;
    return true;
  });
}

export function formatJournalOptionLabel(je: JournalEntryRow): string {
  const parts = [`قيد #${je.number}`, je.entry_date?.slice(0, 10) ?? ''];
  if (je.description?.trim()) parts.push(je.description.trim());
  return parts.join(' · ');
}

export function formatJournalLinkedHint(monthKey: string | null): string | null {
  if (!monthKey) return null;
  return `مربوط بـ ${formatMonthLabelAr(monthKey)}`;
}
