'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAllPages, fetchInChunks } from '@/lib/db/fetch-all';
import { fetchTenantCharges } from '@/lib/db/mall-queries';
import { activeLeaseRent } from '@/lib/tenant-rent-account-from-data';
import type { StatementReceipt } from '@/lib/tenant-statement';
import type { TenantStatementSource } from '@/lib/tenant-statements-report';
import type { ContactRow } from '@/lib/db/types';

type Rows<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
type Lease = { id: string; tenant_id: string; status: string; start_date: string | null; monthly_rent: number | string | null };
type Band = { tenant_id: string; from_month: string; to_month: string; amount: number | string };
type Receipt = StatementReceipt & { contact_id: string | null };
type Entry = { id: string; status: string; source_type: string | null; source_id: string | null };

const group = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k) out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
};

/**
 * What every tenant's statement needs, read in a handful of requests instead of six per tenant: the
 * same tables and the same charge query the tenant profile uses, grouped by tenant.
 */
async function loadTenantStatementSources(): Promise<TenantStatementSource[]> {
  const supabase = createSupabaseBrowserClient();
  const all = <T,>(build: (from: number, to: number) => unknown) =>
    fetchAllPages<T>((from, to) => build(from, to) as Rows<T>);

  const [contacts, summaries, leases, charges, exempt, bands, receipts] = await Promise.all([
    all<ContactRow>((f, t) => supabase.from('contacts').select('*').eq('kind', 'TENANT').order('id').range(f, t)),
    all<{ id: string; rent_claim_start: string | null }>((f, t) =>
      supabase.from('tenant_rent_summary').select('id, rent_claim_start').order('id').range(f, t),
    ),
    all<Lease>((f, t) =>
      supabase.from('lease_contracts').select('id, tenant_id, status, start_date, monthly_rent').order('id').range(f, t),
    ),
    fetchTenantCharges(supabase),
    all<{ tenant_id: string; month_key: string }>((f, t) =>
      supabase.from('tenant_rent_exempt_months').select('id, tenant_id, month_key').order('id').range(f, t),
    ),
    all<Band>((f, t) =>
      supabase
        .from('tenant_rent_price_bands')
        .select('id, tenant_id, from_month, to_month, amount')
        .order('from_month')
        .order('id')
        .range(f, t),
    ),
    all<Receipt>((f, t) =>
      supabase
        .from('transactions')
        .select('id, number, kind, status, amount, method, reference, description, tx_date, contact_id, category:categories(code)')
        .eq('kind', 'REVENUE')
        .not('contact_id', 'is', null)
        .order('id')
        .range(f, t),
    ),
  ]);

  const tenantIds = new Set(contacts.map((c) => c.id));
  const tenantReceipts = receipts.filter((r) => r.contact_id && tenantIds.has(r.contact_id));
  const entries = await fetchInChunks<Entry>(
    tenantReceipts.filter((r) => r.category?.code === 'REV-RNT').map((r) => r.id),
    (chunk) =>
      supabase
        .from('journal_entries')
        .select('id, status, source_type, source_id')
        .eq('source_type', 'TRANSACTION')
        .in('source_id', chunk) as unknown as Rows<Entry>,
  );

  const claimById = new Map(summaries.map((s) => [s.id, s.rent_claim_start]));
  const leasesBy = group(leases, (l) => l.tenant_id);
  // the tenant a charge belongs to, read the way chargeBelongsToTenant reads it
  const chargesBy = group(charges, (c) => c.contract?.tenant?.id ?? (c.contract as { tenant_id?: string } | null)?.tenant_id);
  const exemptBy = group(exempt, (e) => e.tenant_id);
  const bandsBy = group(bands, (b) => b.tenant_id);
  const receiptsBy = group(tenantReceipts, (r) => r.contact_id);
  // a receipt can have a reversed entry and its replacement: keep both, the account skips reversed ones
  const entriesByReceipt = group(entries, (e) => e.source_id);

  return contacts.map((contact) => {
    const claimStart = claimById.get(contact.id) ?? contact.contract_start ?? null;
    const startDate = contact.contract_start || claimById.get(contact.id);
    const own = receiptsBy.get(contact.id) ?? [];
    return {
      tenant: {
        id: contact.id,
        name: contact.name,
        shop_number: contact.shop_number,
        phone: contact.phone,
        is_active: contact.is_active,
      },
      claimStart,
      contractStartYear: startDate ? Number(String(startDate).slice(0, 4)) || null : null,
      monthlyRent: Number(contact.monthly_rent) || 0,
      charges: chargesBy.get(contact.id) ?? [],
      manualExemptMonths: (exemptBy.get(contact.id) ?? []).map((e) => e.month_key),
      pricing: {
        bands: (bandsBy.get(contact.id) ?? []).map((b) => ({ from_month: b.from_month, to_month: b.to_month, amount: Number(b.amount) })),
        leaseRent: activeLeaseRent(leasesBy.get(contact.id) ?? []),
        contactRent: Number(contact.monthly_rent) || 0,
      },
      receipts: own,
      journalEntries: own.flatMap((r) => entriesByReceipt.get(r.id) ?? []),
    };
  });
}

export function useTenantStatementSources() {
  return useQuery({
    // under "tenant_rent_summary" so any money change refreshes the report
    queryKey: ['tenant_rent_summary', 'statement_sources'],
    queryFn: loadTenantStatementSources,
  });
}
