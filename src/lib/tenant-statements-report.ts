/**
 * Rent statements for every tenant at once: the same statement each tenant profile shows (built by the
 * same functions from the same data), plus the totals across the mall. Used by the statements report
 * screen and its PDF, which prints a summary page followed by each tenant's statement.
 */
import type { RentPricing } from '@/lib/rent-allocation';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import { buildTenantRentAccountFromData, tenantRentYears } from '@/lib/tenant-rent-account-from-data';
import { unlinkedRentReceipts } from '@/lib/tenant-rent-account';
import { buildTenantStatement, type StatementReceipt, type TenantStatement } from '@/lib/tenant-statement';

export type StatementTenant = {
  id: string;
  name: string;
  shop_number: string | null;
  phone: string | null;
  is_active: boolean;
};

/** Everything one tenant's statement is built from, as the tenant profile loads it. */
export type TenantStatementSource = {
  tenant: StatementTenant;
  claimStart: string | null;
  contractStartYear: number | null;
  monthlyRent: number;
  charges: TenantChargeWithRelations[];
  manualExemptMonths: string[];
  pricing: RentPricing;
  /** the tenant's revenue transactions; only posted rent receipts count */
  receipts: StatementReceipt[];
  /** journal entries of those receipts (source_id = transaction id) */
  journalEntries: { id: string; status: string; source_type?: string | null; source_id?: string | null }[];
};

export type TenantStatementLine = { tenant: StatementTenant; statement: TenantStatement };

export type TenantStatementsReport = {
  year: number | null;
  lines: TenantStatementLine[];
  totals: {
    opening: number;
    debit: number;
    credit: number;
    closing: number;
    /** sum of balances tenants owe */
    owed: number;
    /** sum of balances paid ahead (positive number) */
    ahead: number;
  };
  /** tenants left out: nothing due, nothing paid and no balance in the period */
  skipped: number;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;

export function buildTenantStatementFromSource(
  src: TenantStatementSource,
  year: number | null,
  methodLabel?: (method: string | null | undefined) => string,
): TenantStatement {
  const years = tenantRentYears(src.charges, src.contractStartYear, src.claimStart);
  const account = buildTenantRentAccountFromData({
    tenantId: src.tenant.id,
    contactRent: src.monthlyRent,
    claimStart: src.claimStart,
    years,
    charges: src.charges,
    manualExemptMonths: src.manualExemptMonths,
    pricing: src.pricing,
  });
  const unlinked = unlinkedRentReceipts({ receipts: src.receipts, journalEntries: src.journalEntries, charges: src.charges });
  return buildTenantStatement({ account, receipts: src.receipts, unlinkedTotal: unlinked.total, year, methodLabel });
}

const byShop = (a: StatementTenant, b: StatementTenant) =>
  (a.shop_number ?? '').localeCompare(b.shop_number ?? '', 'ar', { numeric: true }) ||
  a.name.localeCompare(b.name, 'ar');

export function buildTenantStatementsReport(
  sources: TenantStatementSource[],
  year: number | null,
  methodLabel?: (method: string | null | undefined) => string,
): TenantStatementsReport {
  const lines: TenantStatementLine[] = [];
  let skipped = 0;
  for (const src of sources) {
    const statement = buildTenantStatementFromSource(src, year, methodLabel);
    const active = statement.rows.length > 0 || Math.abs(statement.opening) > EPS || Math.abs(statement.closing) > EPS;
    if (active) lines.push({ tenant: src.tenant, statement });
    else skipped += 1;
  }
  lines.sort((a, b) => byShop(a.tenant, b.tenant));
  return { year, lines, totals: statementTotals(lines), skipped };
}

/** Totals over some lines (all of them, or the ones a filter kept). */
export function statementTotals(lines: TenantStatementLine[]): TenantStatementsReport['totals'] {
  const sum = (f: (s: TenantStatement) => number) => round3(lines.reduce((t, l) => t + f(l.statement), 0));
  return {
    opening: sum((s) => s.opening),
    debit: sum((s) => s.totalDebit),
    credit: sum((s) => s.totalCredit),
    closing: sum((s) => s.closing),
    owed: sum((s) => (s.closing > EPS ? s.closing : 0)),
    ahead: sum((s) => (s.closing < -EPS ? -s.closing : 0)),
  };
}
