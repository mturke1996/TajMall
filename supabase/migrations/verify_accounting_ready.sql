-- ============================================================
-- تحقق سريع: هل قاعدة البيانات جاهزة للمحاسبة والمول؟
-- شغّل في Supabase SQL Editor بعد تطبيق الهجرات 007→038
-- ============================================================

DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  fn text;
  tbl text;
  col text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'get_journal_entries_filtered',
    'get_general_ledger_lines',
    'get_trial_balance',
    'get_profit_loss',
    'get_cash_flow',
    'get_balance_sheet',
    'get_tenant_ar_aging',
    'create_journal_entry',
    'post_journal_entry',
    'backfill_existing_transactions_to_ledger',
    'apply_charge_allocations',
    'sync_overdue_charge_notifications',
    'post_to_ledger',
    'get_audit_log_feed',
    'user_has_audit_access',
    'get_treasury_balance_total',
    'get_my_role',
    'auth_is_viewer',
    'auth_role_may_write',
    'get_tenant_rent_calendar',
    'ensure_tenant_rent_charges',
    'record_rent_payment',
    'set_tenant_rent_month_status',
    'ensure_tenant_lease_contract',
    'recalc_tenant_charge_rent_paid',
    'purge_rent_links_for_journal',
    'reverse_journal_entry',
    'dedupe_rent_charges_data'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN
      missing := array_append(missing, 'RPC: ' || fn);
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'journal_entries',
    'journal_lines',
    'tenant_charges',
    'tenant_charge_allocations',
    'tenant_rent_journal_links',
    'fiscal_periods',
    'app_notifications',
    'disbursement_vouchers',
    'audit_log'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      missing := array_append(missing, 'TABLE: ' || tbl);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'auto_allocate_charges'
  ) THEN
    missing := array_append(missing, 'COLUMN: transactions.auto_allocate_charges (هجرة 019)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE code = 'AST-CSH' AND active = true
  ) THEN
    missing := array_append(missing, 'SEED: categories.AST-CSH (هجرة 013)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE code = 'REV-RNT' AND active = true
  ) THEN
    missing := array_append(missing, 'SEED: categories.REV-RNT (هجرة 013)');
  END IF;

  IF array_length(missing, 1) IS NULL THEN
    RAISE NOTICE '✅ قاعدة البيانات جاهزة — كل RPC والجداول الأساسية موجودة.';
  ELSE
    RAISE WARNING '❌ عناصر ناقصة (%): %', array_length(missing, 1), array_to_string(missing, E'\n  • ');
  END IF;
END $$;

-- إحصائيات سريعة
SELECT 'journal_entries POSTED' AS metric, COUNT(*)::text AS value
FROM public.journal_entries WHERE status = 'POSTED'
UNION ALL
SELECT 'tenant_charges open', COUNT(*)::text
FROM public.tenant_charges WHERE status IN ('UNPAID', 'PARTIAL')
UNION ALL
SELECT 'app_notifications unread', COUNT(*)::text
FROM public.app_notifications WHERE is_read = false;
