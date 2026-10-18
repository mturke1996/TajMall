/**
 * Leases that need a decision: already past their end date but still marked active, or ending soon.
 *
 * A lease left active after its end date keeps the shop counted as rented and the tenant on the monthly
 * charge run, so it is listed to be renewed or ended, not only as a reminder.
 */
import { daysBetween } from '@/lib/mall-dates';
import type { OccupancyContract } from '@/lib/mall-occupancy';

export type ExpiryBucket = 'expired' | 'within30' | 'within60' | 'within90';

export const EXPIRY_HORIZON_DAYS = 90;

export type ExpiryItem = {
  contract: OccupancyContract & { unit?: { id: string; unit_number: string; floor: string } | null };
  tenantId: string;
  tenantName: string;
  phone: string | null;
  unitNumber: string | null;
  floor: string | null;
  endDate: string;
  /** days until the end date; negative when it has passed */
  daysLeft: number;
  bucket: ExpiryBucket;
  monthlyRent: number;
  /** the end date has passed and the lease is still active */
  pastEnd: boolean;
};

export type ContractExpiry = {
  items: ExpiryItem[];
  counts: Record<ExpiryBucket, number>;
  total: number;
  /** expired + within 30 days */
  urgent: number;
  /** monthly rent of the listed leases: the rent that depends on them being renewed */
  monthlyRentAtRisk: number;
};

export const BUCKET_ORDER: ExpiryBucket[] = ['expired', 'within30', 'within60', 'within90'];

export function expiryBucket(daysLeft: number): ExpiryBucket | null {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'within30';
  if (daysLeft <= 60) return 'within60';
  if (daysLeft <= EXPIRY_HORIZON_DAYS) return 'within90';
  return null;
}

type ExpiryContract = ExpiryItem['contract'];

export function buildContractExpiry(input: {
  contracts: ExpiryContract[];
  /** "YYYY-MM-DD" */
  today: string;
}): ContractExpiry {
  const { contracts, today } = input;
  const active = contracts.filter((c) => c.status === 'ACTIVE');

  const items: ExpiryItem[] = [];
  for (const c of active) {
    // a lease already followed by another active one for the same tenant and unit has been renewed
    const renewed = active.some(
      (o) => o.id !== c.id && o.unit_id === c.unit_id && o.tenant_id === c.tenant_id && o.start_date > c.start_date,
    );
    if (renewed) continue;
    const daysLeft = daysBetween(today, c.end_date);
    if (daysLeft == null) continue;
    const bucket = expiryBucket(daysLeft);
    if (!bucket) continue;
    items.push({
      contract: c,
      tenantId: c.tenant_id,
      tenantName: c.tenant?.name ?? 'مستأجر',
      phone: c.tenant?.phone ?? null,
      unitNumber: c.unit?.unit_number ?? null,
      floor: c.unit?.floor ?? null,
      endDate: c.end_date,
      daysLeft,
      bucket,
      monthlyRent: Number(c.monthly_rent) || 0,
      pastEnd: daysLeft < 0,
    });
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft || a.tenantName.localeCompare(b.tenantName, 'ar'));

  const counts: Record<ExpiryBucket, number> = { expired: 0, within30: 0, within60: 0, within90: 0 };
  for (const i of items) counts[i.bucket] += 1;

  return {
    items,
    counts,
    total: items.length,
    urgent: counts.expired + counts.within30,
    monthlyRentAtRisk: Math.round(items.reduce((s, i) => s + i.monthlyRent, 0) * 1000) / 1000,
  };
}
