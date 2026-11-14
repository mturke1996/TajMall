import { CONTACT_LIST_COLUMNS } from '@/lib/db/contact-columns';

/**
 * Business tables included in cold desktop backups.
 *
 * Listed parents-first for readability, but the restore tool does NOT depend on this order: it sorts the
 * tables by the target database's foreign keys (scripts/lib/cold-restore.mjs).
 *
 * Every public table the schema creates must be here or in BACKUP_EXCLUDED_TABLES with a reason. The CI
 * check `npm run verify:backup-coverage` fails otherwise, so a new table can never be silently left out of
 * the backup (this is how rent price bands, payroll, leave and the cashbox count were missed before).
 * Tables that only exist after a not-yet-applied migration are skipped at backup time (missing table).
 */
export const COLD_BACKUP_TABLES = [
  'profiles',
  'branches',
  'categories',
  'cashboxes',
  'contacts',
  'fiscal_periods',
  'account_mappings',
  'mall_units',
  'lease_contracts',
  'transactions',
  'cash_transfers',
  'journal_entries',
  'journal_lines',
  'journal_reference_sequences',
  'journal_form_drafts',
  'transaction_form_drafts',
  'tenant_charges',
  'tenant_charge_allocations',
  'tenant_rent_journal_links',
  'tenant_rent_exempt_months',
  'tenant_rent_price_bands',
  'disbursement_vouchers',
  'disbursement_voucher_lines',
  'correspondence_letters',
  'receipt_vouchers',
  'receipt_voucher_lines',
  'budgets',
  'cashbox_inventory_runs',
  'cashbox_inventory_lines',
  'employee_details',
  'employee_leave_requests',
  'payroll_salary_structures',
  'payroll_runs',
  'payroll_run_lines',
  'payroll_adjustments',
  'payroll_advances',
  'payroll_advance_repayments',
  'payroll_payments',
  'audit_log',
  'app_notifications',
] as const;

/**
 * Public tables deliberately kept OUT of the backup file, with the reason. A table appears here only when
 * putting it in a plain file would be wrong, never because it was forgotten.
 */
export const BACKUP_EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  app_secrets: 'secret values (e.g. the cashbox count PIN hash) must never be written to a backup file',
};

export type ColdBackupTable = (typeof COLD_BACKUP_TABLES)[number];

/**
 * Tables where `SELECT *` fails because column-level grants hide sensitive
 * columns (e.g. contacts.portal_token). Use the same lists as the app UI.
 */
export const COLD_BACKUP_SELECT: Partial<Record<ColdBackupTable, string>> = {
  contacts: CONTACT_LIST_COLUMNS,
};

export function coldBackupSelect(table: ColdBackupTable): string {
  return COLD_BACKUP_SELECT[table] ?? '*';
}

/**
 * Paging with `.range()` needs a stable order, otherwise a row that changes while the backup runs can be
 * skipped or read twice. Every table is read ordered by its primary key: `id` unless listed here. The CI
 * check `verify:backup-coverage` compares this against the primary keys the migrations declare.
 */
export const COLD_BACKUP_ORDER_BY: Partial<Record<ColdBackupTable, string>> = {
  journal_reference_sequences: 'year',
  employee_details: 'employee_id',
};

export function coldBackupOrderBy(table: ColdBackupTable): string {
  return COLD_BACKUP_ORDER_BY[table] ?? 'id';
}

export const PAGE_SIZE = 1000;
