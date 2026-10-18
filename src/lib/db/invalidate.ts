import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached query whose numbers come from transactions or the ledger. A posted, deleted or
 * re-linked transaction can change any of them (balances, rent months, reports, a contact's ledger),
 * so they are refreshed together instead of each mutation listing the few it remembered.
 */
const MONEY_ROOTS = new Set([
  'transactions',
  'journal_entries',
  'journal_entries_period',
  'journal_entry',
  'journal_lines',
  'journal_summary',
  'journal_year_count',
  'cashbox_balances',
  'cashbox_ledger',
  'cash_transfers',
  'dashboard_stats',
  'monthly_summary',
  'top_expense_categories',
  'cash_flow',
  'employee_summary',
  'tenant_rent_summary',
  'tenant_rent_summary_for_month',
  'tenant_charges',
  'tenant_rent_calendar',
  'mall_rent_charges_year',
  'tenant_ar_aging',
  'contacts',
  'party_report',
  'category_transactions_for_month',
  'ledger',
  'trial_balance',
  'profit_loss',
  'balance_sheet',
  'budget_actuals',
  'audit_log_feed',
  'app_notifications',
]);

/**
 * Marks them stale and refetches the ones on screen in the background. Returns nothing on purpose:
 * a mutation's onSuccess that returned the promise would keep its dialog spinning until every list
 * and report had reloaded.
 */
export function invalidateMoneyQueries(qc: QueryClient): void {
  void qc.invalidateQueries({
    predicate: (q) => MONEY_ROOTS.has(String(q.queryKey[0])),
  });
}
