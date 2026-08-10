import { CONTACT_LIST_COLUMNS } from '@/lib/db/contact-columns';

/**
 * Business tables included in cold desktop backups.
 * Order is used by the emergency restore script (parents before children).
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
  'disbursement_vouchers',
  'disbursement_voucher_lines',
  'correspondence_letters',
  'receipt_vouchers',
  'receipt_voucher_lines',
  'budgets',
  'audit_log',
  'app_notifications',
] as const;

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

export const PAGE_SIZE = 1000;
