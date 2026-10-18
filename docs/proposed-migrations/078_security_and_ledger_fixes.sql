-- ============================================================================
-- 078 (PROPOSED — NOT APPLIED) — security lockdown + ledger correctness fixes
-- Generated 2026-10-18 from the LIVE production function bodies.
--
-- Validated only on an isolated PGlite replica:
--   node scripts/test-accounting-scenarios.mjs --prod-functions --apply docs/proposed-migrations/078_security_and_ledger_fixes.sql
-- Exact rollback: docs/proposed-migrations/078_security_and_ledger_fixes.ROLLBACK.sql
-- Apply only after a fresh pg_dump backup, on a Supabase branch first, then production.
-- This file deliberately lives outside supabase/migrations so no apply script picks it up.
-- ============================================================================
BEGIN;

-- 1. Anonymous visitors: no table, view, sequence or function access. The tenant portal reads
--    data on the server with service_role, so it does not depend on anon grants.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 2. Internal maintenance functions are reachable only from SECURITY DEFINER code and service_role.
REVOKE EXECUTE ON FUNCTION public.apply_strict_rbac_policies(text),
  public.dedupe_rent_charges_data(),
  public.purge_rent_links_for_journal(uuid),
  public.recalc_tenant_charge_rent_paid(uuid),
  public.refresh_contacts_api_grants(),
  public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb)
  FROM authenticated;

-- 3. Legacy "USING (true)" write policies OR-ed around the RBAC policies; the rbac_* policies stay.
DROP POLICY IF EXISTS "auth full access journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "auth full access journal_lines" ON public.journal_lines;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.account_mappings;
DROP POLICY IF EXISTS "auth_update_policy" ON public.account_mappings;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.account_mappings;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.fiscal_periods;
DROP POLICY IF EXISTS "auth_update_policy" ON public.fiscal_periods;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.fiscal_periods;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.lease_contracts;
DROP POLICY IF EXISTS "auth_update_policy" ON public.lease_contracts;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.lease_contracts;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.mall_units;
DROP POLICY IF EXISTS "auth_update_policy" ON public.mall_units;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.mall_units;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.tenant_charge_allocations;
DROP POLICY IF EXISTS "auth_update_policy" ON public.tenant_charge_allocations;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.tenant_charge_allocations;
DROP POLICY IF EXISTS "auth_insert_policy" ON public.tenant_charges;
DROP POLICY IF EXISTS "auth_update_policy" ON public.tenant_charges;
DROP POLICY IF EXISTS "auth_delete_policy" ON public.tenant_charges;
DROP POLICY IF EXISTS "auth insert correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth update correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth delete correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth insert receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth update receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth delete receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth insert receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "auth update receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "auth delete receipt_voucher_lines" ON public.receipt_voucher_lines;
CREATE POLICY "rbac_insert_correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_update_correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR UPDATE TO authenticated USING (public.auth_role_may_write()) WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_delete_correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR DELETE TO authenticated USING (public.auth_role_may_write());
CREATE POLICY "rbac_insert_receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_update_receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR UPDATE TO authenticated USING (public.auth_role_may_write()) WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_delete_receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR DELETE TO authenticated USING (public.auth_role_may_write());
CREATE POLICY "rbac_insert_receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_update_receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR UPDATE TO authenticated USING (public.auth_role_may_write()) WITH CHECK (public.auth_role_may_write());
CREATE POLICY "rbac_delete_receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR DELETE TO authenticated USING (public.auth_role_may_write());

-- 4. New helpers and a kind/category consistency check.
-- Accrual date: the charge's own month while that period is open, otherwise today (catch-up accrual).
CREATE OR REPLACE FUNCTION public.charge_accrual_entry_date(p_due date)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.fiscal_periods fp
                 WHERE p_due BETWEEN fp.start_date AND fp.end_date AND fp.is_closed) THEN CURRENT_DATE
    ELSE p_due
  END;
$function$;

-- Posts Dr AST-REC / Cr REV-RNT (or REV-SRV) for a charge that has no POSTED accrual yet. Idempotent.
CREATE OR REPLACE FUNCTION public.post_missing_charge_accrual(p_charge_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge public.tenant_charges%ROWTYPE;
  v_tenant_id uuid;
  v_rec_id uuid;
  v_rev_id uuid;
BEGIN
  SELECT * INTO v_charge FROM public.tenant_charges WHERE id = p_charge_id;
  IF NOT FOUND OR v_charge.amount <= 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries je
             WHERE je.source_type = 'CHARGE' AND je.source_id = v_charge.id AND je.status = 'POSTED') THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM public.lease_contracts WHERE id = v_charge.contract_id;
  SELECT id INTO v_rec_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
  SELECT id INTO v_rev_id FROM public.categories
  WHERE code = CASE WHEN v_charge.type = 'SERVICE' THEN 'REV-SRV' ELSE 'REV-RNT' END LIMIT 1;
  RETURN public.post_to_ledger(
    'CHARGE', v_charge.id, public.charge_accrual_entry_date(v_charge.due_date), v_charge.description, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('category_id', v_rec_id, 'debit', v_charge.amount, 'credit', 0,
                         'description', v_charge.description, 'contact_id', v_tenant_id),
      jsonb_build_object('category_id', v_rev_id, 'debit', 0, 'credit', v_charge.amount,
                         'description', v_charge.description, 'contact_id', v_tenant_id)));
END;
$function$;

-- A revenue on an expense account silently reduces the expense (and vice versa).
CREATE OR REPLACE FUNCTION public.check_transaction_category_kind()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type public.account_type;
BEGIN
  IF NEW.category_id IS NULL OR NEW.kind NOT IN ('REVENUE', 'EXPENSE') THEN
    RETURN NEW;
  END IF;
  SELECT type INTO v_type FROM public.categories WHERE id = NEW.category_id;
  IF (NEW.kind = 'REVENUE' AND v_type = 'EXPENSE') OR (NEW.kind = 'EXPENSE' AND v_type = 'REVENUE') THEN
    RAISE EXCEPTION 'البند المحاسبي لا يطابق نوع المعاملة (%)', NEW.kind USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tx_category_matches_kind ON public.transactions;
CREATE TRIGGER trg_tx_category_matches_kind
  BEFORE INSERT OR UPDATE OF kind, category_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_transaction_category_kind();
REVOKE EXECUTE ON FUNCTION public.post_missing_charge_accrual(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Patched functions (production body + the change described in each comment).
CREATE OR REPLACE FUNCTION public.record_rent_payment(tenant_id uuid, amount numeric, payment_date date DEFAULT CURRENT_DATE, cashbox_id uuid DEFAULT NULL::uuid, description text DEFAULT NULL::text, rent_months text[] DEFAULT NULL::text[], payment_method text DEFAULT 'CASH'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_tx_id uuid;
  effective_cashbox_id uuid;
  rent_category_id uuid;
  v_desc text;
  v_method public.payment_method;
  v_method_raw text;
  v_journal_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;
  v_method_raw := upper(trim(coalesce(payment_method, 'CASH')));
  IF v_method_raw NOT IN ('CASH', 'CHEQUE', 'TRANSFER', 'CARD') THEN
    v_method_raw := 'CASH';
  END IF;
  v_method := v_method_raw::public.payment_method;

  IF rent_months IS NULL OR cardinality(rent_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهر إيجار واحداً على الأقل';
  END IF;

  IF cashbox_id IS NULL THEN
    SELECT c.id INTO effective_cashbox_id
    FROM public.cashboxes c
    WHERE c.active = true
    ORDER BY c.created_at
    LIMIT 1;
  ELSE
    effective_cashbox_id := cashbox_id;
  END IF;

  SELECT cat.id INTO rent_category_id
  FROM public.categories cat
  WHERE cat.code = 'REV-RNT'
  LIMIT 1;

  v_desc := COALESCE(
    description,
    'تحصيل إيجار: ' || array_to_string(rent_months, '، ')
  );

  INSERT INTO public.transactions (
    kind, status, method, amount, currency, tx_date, description,
    category_id, cashbox_id, contact_id, contact_type, posted_at,
    auto_allocate_charges
  ) VALUES (
    'REVENUE', 'POSTED', v_method, amount, 'LYD', payment_date, v_desc,
    rent_category_id, effective_cashbox_id, tenant_id, 'PAYER', now(),
    false
  )
  RETURNING id INTO new_tx_id;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.source_type = 'TRANSACTION'
    AND je.source_id = new_tx_id
    AND je.status IN ('POSTED', 'DRAFT')
  ORDER BY je.created_at DESC
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'لم يُنشأ قيد للمعاملة — تحقق من ترحيل اليومية';
  END IF;

  PERFORM public.set_tenant_rent_month_status(
    tenant_id,
    rent_months,
    true,
    v_journal_id,
    amount
  );

  RETURN jsonb_build_object(
    'transaction_id', new_tx_id,
    'journal_entry_id', v_journal_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_rent_exempt_months(p_tenant_id uuid, p_months text[], p_exempt boolean DEFAULT true, p_claim_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month text;
  v_due date;
  v_claim_start date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'معرّف المستأجر مطلوب';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_tenant_id AND c.kind = 'TENANT'
  ) THEN
    RAISE EXCEPTION 'المستأجر غير موجود';
  END IF;

  v_claim_start := COALESCE(p_claim_start, public.tenant_rent_claim_start(p_tenant_id));

  IF p_claim_start IS NOT NULL THEN
    UPDATE public.contacts
    SET contract_start = p_claim_start
    WHERE id = p_tenant_id;

    UPDATE public.lease_contracts lc
    SET start_date = p_claim_start
    WHERE lc.tenant_id = p_tenant_id
      AND lc.status = 'ACTIVE'
      AND lc.start_date > p_claim_start;
  END IF;

  IF p_months IS NULL OR array_length(p_months, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claim_start', v_claim_start,
      'months', '[]'::jsonb
    );
  END IF;

  FOREACH v_month IN ARRAY p_months LOOP
    IF v_month IS NULL OR v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      CONTINUE;
    END IF;

    v_due := (v_month || '-01')::date;

    IF p_exempt THEN
      INSERT INTO public.tenant_rent_exempt_months (tenant_id, month_key, source, notes)
      VALUES (p_tenant_id, v_month, 'manual', 'بدون مطالبة من بروفايل المستأجر')
      ON CONFLICT (tenant_id, month_key) DO NOTHING;

      DELETE FROM public.tenant_rent_journal_links trjl
      USING public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE trjl.charge_id = tc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
        AND tc.status IN ('UNPAID', 'PARTIAL');

      DELETE FROM public.tenant_charges tc
      USING public.lease_contracts lc
      WHERE tc.contract_id = lc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
        AND tc.status IN ('UNPAID', 'PARTIAL');
    ELSE
      DELETE FROM public.tenant_rent_exempt_months em
      WHERE em.tenant_id = p_tenant_id
        AND em.month_key = v_month
        AND em.source = 'manual';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'claim_start', COALESCE(p_claim_start, public.tenant_rent_claim_start(p_tenant_id)),
    'months', to_jsonb(p_months)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_charge_allocations(p_transaction_id uuid, p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tx record;
  v_item jsonb;
  v_charge record;
  v_alloc numeric;
  v_total numeric := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المعاملة غير موجودة';
  END IF;

  IF v_tx.status != 'POSTED' THEN
    RAISE EXCEPTION 'المعاملة غير مرحّلة';
  END IF;

  IF v_tx.contact_id IS NULL THEN
    RAISE EXCEPTION 'المعاملة غير مرتبطة بمستأجر';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_charge_allocations
    WHERE transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'تم تخصيص هذه المعاملة مسبقاً';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_alloc := COALESCE((v_item->>'amount')::numeric, 0);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    v_total := v_total + v_alloc;

    SELECT tc.* INTO v_charge
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE tc.id = (v_item->>'charge_id')::uuid
      AND lc.tenant_id = v_tx.contact_id
      AND tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'مطالبة غير صالحة أو مغلقة للمستأجر';
    END IF;

    IF (v_charge.amount - v_charge.total_paid) < v_alloc THEN
      RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على المطالبة';
    END IF;

    INSERT INTO public.tenant_charge_allocations (charge_id, transaction_id, amount)
    VALUES (v_charge.id, p_transaction_id, v_alloc);

    UPDATE public.tenant_charges
    SET
      total_paid = total_paid + v_alloc,
      status = CASE
        WHEN total_paid + v_alloc >= amount THEN 'PAID'
        WHEN total_paid + v_alloc > 0 THEN 'PARTIAL'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_charge.id;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'يجب تخصيص مبلغ واحد على الأقل';
  END IF;

  IF v_total > v_tx.amount THEN
    RAISE EXCEPTION 'مجموع التخصيص يتجاوز مبلغ المعاملة';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_overdue_charge_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_created int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  SELECT
    'OVERDUE_CHARGE',
    'مطالبة متأخرة — ' || c.name,
    tc.description || ' · مستحق ' || to_char(tc.due_date, 'YYYY-MM-DD')
      || ' · متبقي ' || (tc.amount - tc.total_paid)::text || ' د.ل',
    '/mall?tab=charges',
    CASE
      WHEN tc.due_date < CURRENT_DATE - INTERVAL '60 days' THEN 'danger'
      WHEN tc.due_date < CURRENT_DATE - INTERVAL '30 days' THEN 'warning'
      ELSE 'info'
    END,
    'tenant_charge',
    tc.id
  FROM public.tenant_charges tc
  JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  JOIN public.contacts c ON c.id = lc.tenant_id
  WHERE tc.status IN ('UNPAID', 'PARTIAL')
    AND tc.due_date < CURRENT_DATE
    AND tc.amount > tc.total_paid
    AND NOT EXISTS (
      SELECT 1 FROM public.app_notifications n
      WHERE n.entity_type = 'tenant_charge'
        AND n.entity_id = tc.id
        AND n.is_read = false
    );

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'created', v_created,
    'synced_at', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.backfill_existing_transactions_to_ledger()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tx record;
  v_count int := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب محاسباً أو مديراً.' USING ERRCODE = '42501';
  END IF;
  -- Find all transactions that do not have a posted journal entry in public.journal_entries
  FOR v_tx IN 
    SELECT t.* 
    FROM public.transactions t
    LEFT JOIN public.journal_entries je ON je.source_type = 'TRANSACTION' AND je.source_id = t.id AND je.status = 'POSTED'
    WHERE t.status = 'POSTED' AND je.id IS NULL
    ORDER BY t.tx_date ASC, t.number ASC
  Loop
    -- Trigger will handle the posting if we force an update
    UPDATE public.transactions
    SET status = 'POSTED', updated_at = now()
    WHERE id = v_tx.id;
    
    v_count := v_count + 1;
  END LOOP;

  RETURN 'تم ترحيل عدد ' || v_count || ' معاملة سابقة بنجاح إلى قيود اليومية.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_voucher_for_approval(p_voucher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_number text;
  v_amount numeric;
  v_payee text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  UPDATE public.disbursement_vouchers
  SET status = 'PENDING_APPROVAL', submitted_at = now(), submitted_by = auth.uid()
  WHERE id = p_voucher_id AND status IN ('DRAFT', 'REJECTED')
  RETURNING voucher_number, total_amount, payee INTO v_number, v_amount, v_payee;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'الإذن غير موجود أو ليس في حالة تسمح بإرساله للاعتماد';
  END IF;

  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  VALUES (
    'VOUCHER_PENDING_APPROVAL',
    'إذن صرف بانتظار الاعتماد',
    format('إذن %s للمستفيد %s بقيمة %s د.ل — يحتاج موافقة owner/admin.', v_number, v_payee, v_amount::text),
    format('/vouchers?highlight=%s', p_voucher_id::text),
    'warning',
    'disbursement_voucher',
    p_voucher_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.decide_voucher_approval(p_voucher_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_number text;
  v_payee text;
BEGIN
  IF public.get_my_role() NOT IN ('owner', 'admin', 'accountant') THEN
    RAISE EXCEPTION 'غير مصرح: الاعتماد يتطلب صلاحية owner أو admin أو accountant' USING ERRCODE = '42501';
  END IF;

  -- An approved voucher posts Cr cash: without a cashbox the treasury drifts from the ledger, and
  -- without a category the expense lands on whatever expense account sorts first.
  IF p_approve AND EXISTS (SELECT 1 FROM public.disbursement_vouchers v
                           WHERE v.id = p_voucher_id AND (v.cashbox_id IS NULL OR v.category_id IS NULL)) THEN
    RAISE EXCEPTION 'حدّد الخزينة وبند المصروف قبل اعتماد إذن الصرف' USING ERRCODE = '23514';
  END IF;

  IF p_approve THEN
    UPDATE public.disbursement_vouchers
    SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), rejection_reason = NULL
    WHERE id = p_voucher_id AND status = 'PENDING_APPROVAL'
    RETURNING voucher_number, payee INTO v_number, v_payee;
  ELSE
    UPDATE public.disbursement_vouchers
    SET status = 'REJECTED', approved_by = auth.uid(), approved_at = now(), rejection_reason = p_reason
    WHERE id = p_voucher_id AND status = 'PENDING_APPROVAL'
    RETURNING voucher_number, payee INTO v_number, v_payee;
  END IF;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'الإذن غير موجود أو ليس بانتظار الاعتماد';
  END IF;

  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  VALUES (
    CASE WHEN p_approve THEN 'VOUCHER_APPROVED' ELSE 'VOUCHER_REJECTED' END,
    CASE WHEN p_approve THEN 'تمت الموافقة على إذن صرف' ELSE 'تم رفض إذن صرف' END,
    format('إذن %s للمستفيد %s%s', v_number, v_payee, CASE WHEN p_reason IS NOT NULL THEN ' — السبب: ' || p_reason ELSE '' END),
    format('/vouchers?highlight=%s', p_voucher_id::text),
    CASE WHEN p_approve THEN 'success' ELSE 'danger' END,
    'disbursement_voucher',
    p_voucher_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_transaction_posting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_rec_cat_id uuid;
  v_dep_cat_id uuid;
  v_rent_cat_id uuid;
  v_is_rent boolean := false;
  v_is_deposit boolean := false;
BEGIN
  -- Only accounting fields require a new posting; reconciliation flags, notes and timestamps do not.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.kind IS NOT DISTINCT FROM OLD.kind
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.tx_date IS NOT DISTINCT FROM OLD.tx_date
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.cashbox_id IS NOT DISTINCT FROM OLD.cashbox_id
     AND NEW.contact_id IS NOT DISTINCT FROM OLD.contact_id THEN
    RETURN NEW;
  END IF;

  -- Get standard categories
  SELECT category_id INTO v_cash_cat_id FROM public.account_mappings WHERE source_type = 'REVENUE_CASH_ASSET' LIMIT 1;

  -- Fallback: إذا كان الربط ناقصاً أو NULL، استخدم بند AST-CSH مباشرة
  IF v_cash_cat_id IS NULL THEN
    SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  END IF;
  IF v_cash_cat_id IS NULL THEN
    RAISE EXCEPTION 'تعذّر الترحيل: حساب الخزينة/النقد (AST-CSH) غير معرّف ولا يوجد رابط في account_mappings. شغّل هجرة 013 لتعريف البند وربطه.';
  END IF;

  SELECT category_id INTO v_rec_cat_id FROM public.account_mappings WHERE source_type = 'AST-REC' OR source_type = 'RENT_REVENUE' LIMIT 1; -- Fallback
  SELECT category_id INTO v_dep_cat_id FROM public.account_mappings WHERE source_type = 'DEPOSIT_LIABILITY' LIMIT 1;

  -- Rent revenue category
  SELECT id INTO v_rent_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;

  IF NEW.category_id = v_rent_cat_id THEN
    v_is_rent := true;
  END IF;

  SELECT category_id INTO v_rec_cat_id FROM public.account_mappings WHERE source_type = 'RENT_REVENUE' LIMIT 1;

  -- Check if it is deposit (using category code LIA-DEP)
  IF EXISTS (SELECT 1 FROM public.categories WHERE id = NEW.category_id AND code = 'LIA-DEP') THEN
    v_is_deposit := true;
  END IF;

  -- Check if transaction is updated or deleted
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    -- Reverse the old entry first
    PERFORM public.reverse_ledger_entry('TRANSACTION', OLD.id, OLD.created_by);
  END IF;

  -- If it's a delete or voided status, stop here after reversing
  IF (TG_OP = 'DELETE' OR NEW.status != 'POSTED') THEN
    RETURN OLD;
  END IF;

  -- Build Journal Lines based on transaction kind
  IF NEW.kind = 'REVENUE' THEN
    -- Deposit to Cashbox (Debit Cashbox Asset)
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', NEW.description,
      'cashbox_id', NEW.cashbox_id
    );

    IF v_is_deposit = true THEN
      -- Deposit received (Credit Deposit Liability)
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_dep_cat_id,
        'debit', 0,
        'credit', NEW.amount,
        'description', 'تأمين مستأجر مستلم: ' || COALESCE(NEW.description, ''),
        'contact_id', NEW.contact_id
      );
    ELSIF v_is_rent = true AND NEW.contact_id IS NOT NULL THEN
      -- Rent payment (Credit Tenants Receivables - reducing customer's outstanding balance)
      -- Find rec category AST-REC
      SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
      v_lines := v_lines || jsonb_build_object(
        'category_id', COALESCE(v_rec_cat_id, NEW.category_id),
        'debit', 0,
        'credit', NEW.amount,
        'description', 'سداد إيجار مستحق: ' || COALESCE(NEW.description, ''),
        'contact_id', NEW.contact_id
      );
    ELSE
      -- Generic Revenue (Credit Revenue Category)
      v_lines := v_lines || jsonb_build_object(
        'category_id', NEW.category_id,
        'debit', 0,
        'credit', NEW.amount,
        'description', NEW.description,
        'contact_id', NEW.contact_id
      );
    END IF;

  ELSIF NEW.kind = 'EXPENSE' THEN
    -- Debit Expense Category
    v_lines := v_lines || jsonb_build_object(
      'category_id', NEW.category_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', NEW.description,
      'contact_id', NEW.contact_id
    );

    -- Credit Cashbox Asset
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', 0,
      'credit', NEW.amount,
      'description', NEW.description,
      'cashbox_id', NEW.cashbox_id
    );

  ELSIF NEW.kind = 'OPENING' THEN
    -- Debit Cashbox Asset
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', 'رصيد افتتاحي: ' || COALESCE(NEW.description, ''),
      'cashbox_id', NEW.cashbox_id
    );

    -- Credit Opening Balance Equity
    SELECT id INTO v_dep_cat_id FROM public.categories WHERE code = 'EQ-OPB' LIMIT 1;
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_dep_cat_id,
      'debit', 0,
      'credit', NEW.amount,
      'description', 'رصيد افتتاحي رأس المال',
      'contact_id', NEW.contact_id
    );
  END IF;

  -- Post the Journal Entry
  PERFORM public.post_to_ledger(
    'TRANSACTION',
    NEW.id,
    NEW.tx_date,
    NEW.description,
    NEW.notes,
    NEW.created_by,
    v_lines
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_rent_month_status(p_tenant_id uuid, p_months text[], p_paid boolean DEFAULT true, p_journal_entry_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month text;
  v_due date;
  v_je_number int;
  v_je_desc text;
  v_charge_id uuid;
  v_charge_amount numeric;
  v_current_paid numeric;
  v_link_amount numeric;
  v_new_paid numeric;
  v_desc text;
  v_month_count int;
  v_payment_pool numeric;
  v_sorted_months text[];
  v_remaining numeric;
  v_je_debit numeric;
  v_already_linked numeric;
  v_available numeric;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_months IS NULL OR cardinality(p_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهراً واحداً على الأقل';
  END IF;

  v_month_count := cardinality(p_months);

  SELECT array_agg(m ORDER BY m)
  INTO v_sorted_months
  FROM unnest(p_months) AS m;

  IF p_journal_entry_id IS NOT NULL THEN
    SELECT je.number, je.description
    INTO v_je_number, v_je_desc
    FROM public.journal_entries je
    WHERE je.id = p_journal_entry_id
      AND je.status IN ('POSTED', 'DRAFT');

    IF v_je_number IS NULL THEN
      RAISE EXCEPTION 'القيد غير موجود أو غير صالح للربط';
    END IF;
    IF p_paid AND NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      JOIN public.transactions t ON je.source_type = 'TRANSACTION' AND t.id = je.source_id
      JOIN public.categories c ON c.id = t.category_id
      WHERE je.id = p_journal_entry_id
        AND je.status = 'POSTED'
        AND t.kind = 'REVENUE'
        AND t.status = 'POSTED'
        AND c.code = 'REV-RNT'
        AND t.contact_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'يُربط شهر الإيجار بدفعة إيجار مرحّلة لنفس المستأجر فقط' USING ERRCODE = '23514';
    END IF;
  ELSIF p_paid THEN
    RAISE EXCEPTION 'اختر قيد اليومية الذي دُفع به هذا الشهر';
  END IF;

  IF p_paid THEN
    SELECT COALESCE(SUM(jl.debit), 0)
    INTO v_je_debit
    FROM public.journal_lines jl
    WHERE jl.journal_id = p_journal_entry_id;

    SELECT COALESCE(SUM(trjl.amount), 0)
    INTO v_already_linked
    FROM public.tenant_rent_journal_links trjl
    WHERE trjl.journal_entry_id = p_journal_entry_id;

    v_available := GREATEST(v_je_debit - v_already_linked, 0);

    IF p_amount IS NOT NULL AND p_amount > 0 THEN
      IF p_amount > v_available + 0.01 THEN
        RAISE EXCEPTION
          'المبلغ أكبر من المتبقي غير المربوط على هذا القيد (% د.ل)',
          trim(to_char(v_available, '999999999990.999'));
      END IF;
      v_payment_pool := p_amount;
    ELSE
      v_payment_pool := v_available;
    END IF;

    IF v_payment_pool <= 0 THEN
      RAISE EXCEPTION 'لا يتبقى مبلغ غير مربوط على هذا القيد';
    END IF;
  ELSE
    v_payment_pool := NULL;
  END IF;

  BEGIN
    PERFORM set_config('fluxen.skip_charge_posting', '1', true);
    PERFORM public.ensure_tenant_rent_charges(p_tenant_id, v_sorted_months);
    -- Charges inserted above ran with the skip flag set; give each its revenue accrual now.
    PERFORM public.post_missing_charge_accrual(tc.id)
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = p_tenant_id
      AND tc.type = 'RENT'
      AND to_char(tc.due_date, 'YYYY-MM') = ANY (v_sorted_months);

    FOREACH v_month IN ARRAY v_sorted_months LOOP
      IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'صيغة شهر غير صالحة: %', v_month;
      END IF;

      v_due := (v_month || '-01')::date;

      SELECT tc.id, tc.amount, tc.total_paid
      INTO v_charge_id, v_charge_amount, v_current_paid
      FROM public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
      LIMIT 1;

      IF v_charge_id IS NULL THEN
        RAISE EXCEPTION 'لا مطالبة إيجار لشهر %', v_month;
      END IF;

      IF NOT p_paid THEN
        DELETE FROM public.tenant_rent_journal_links WHERE charge_id = v_charge_id;
        UPDATE public.tenant_charges
        SET status = 'UNPAID', total_paid = 0, journal_entry_id = NULL,
            description = 'إيجار شهر ' || v_month, updated_at = now()
        WHERE id = v_charge_id;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.tenant_rent_journal_links trjl
        INNER JOIN public.tenant_charges tc2 ON tc2.id = trjl.charge_id
        INNER JOIN public.lease_contracts lc2 ON lc2.id = tc2.contract_id
        WHERE trjl.journal_entry_id = p_journal_entry_id
          AND lc2.tenant_id IS DISTINCT FROM p_tenant_id
      ) THEN
        RAISE EXCEPTION 'هذا القيد مربوط بمستأجر آخر';
      END IF;

      v_current_paid := COALESCE(v_current_paid, 0);
      v_remaining := GREATEST(v_charge_amount - v_current_paid, 0);
      IF v_remaining <= 0 THEN CONTINUE; END IF;
      IF v_payment_pool <= 0 THEN
        RAISE EXCEPTION 'المبلغ لا يكفي لتغطية كل الأشهر المحددة (توقف عند %)', v_month;
      END IF;
      v_link_amount := LEAST(v_payment_pool, v_remaining);
      v_payment_pool := v_payment_pool - v_link_amount;
      v_new_paid := LEAST(v_current_paid + v_link_amount, v_charge_amount);

      INSERT INTO public.tenant_rent_journal_links (charge_id, journal_entry_id, amount)
      VALUES (v_charge_id, p_journal_entry_id, v_link_amount)
      ON CONFLICT (charge_id, journal_entry_id)
      DO UPDATE SET amount = public.tenant_rent_journal_links.amount + EXCLUDED.amount;

      v_desc := 'إيجار شهر ' || v_month;
      IF v_month_count > 1 THEN
        v_desc := v_desc || ' (ضمن ' || v_month_count::text || ' أشهر)';
      END IF;
      IF v_new_paid < v_charge_amount THEN
        v_desc := v_desc || ' · جزئي ' || trim(to_char(v_new_paid, '999999999990.999'))
          || '/' || trim(to_char(v_charge_amount, '999999999990.999'));
      END IF;
      v_desc := v_desc || ' · قيد #' || v_je_number::text
        || COALESCE(' — ' || NULLIF(btrim(v_je_desc), ''), '');

      UPDATE public.tenant_charges
      SET status = CASE WHEN v_new_paid >= v_charge_amount THEN 'PAID' ELSE 'PARTIAL' END,
          total_paid = v_new_paid,
          journal_entry_id = p_journal_entry_id,
          description = v_desc,
          updated_at = now()
      WHERE id = v_charge_id;
    END LOOP;

    PERFORM set_config('fluxen.skip_charge_posting', '0', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
      RAISE;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'months', to_jsonb(v_sorted_months),
    'paid', p_paid,
    'journal_entry_id', p_journal_entry_id,
    'amount', p_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  -- Only POSTED lines dated on or before p_as_of. A balance on the "wrong" side (e.g. tenants who
  -- prepaid, leaving AST-REC in credit) is shown on the opposite side so the statement balances.
  WITH posted AS (
    SELECT jl.category_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_id
    WHERE je.status = 'POSTED' AND je.entry_date <= p_as_of
  ),
  balances AS (
    SELECT c.id AS category_id, c.code AS category_code, c.name_ar AS category_name, c.type, c.color,
           SUM(p.debit) - SUM(p.credit) AS dr_balance
    FROM posted p JOIN public.categories c ON c.id = p.category_id
    WHERE c.type IN ('ASSET', 'LIABILITY', 'EQUITY')
    GROUP BY c.id, c.code, c.name_ar, c.type, c.color
    HAVING ABS(SUM(p.debit) - SUM(p.credit)) > 0.0005
  ),
  placed AS (
    SELECT category_id, category_code, color,
      CASE
        WHEN type = 'ASSET' AND dr_balance > 0 THEN 'ASSET'
        WHEN type = 'ASSET' THEN 'LIABILITY'
        WHEN type = 'LIABILITY' AND dr_balance < 0 THEN 'LIABILITY'
        WHEN type = 'LIABILITY' THEN 'ASSET'
        ELSE 'EQUITY'
      END AS section,
      CASE
        WHEN type = 'ASSET' AND dr_balance < 0 THEN category_name || ' (رصيد دائن)'
        WHEN type = 'LIABILITY' AND dr_balance > 0 THEN category_name || ' (رصيد مدين)'
        ELSE category_name
      END AS category_name,
      CASE WHEN type = 'EQUITY' THEN -dr_balance ELSE ABS(dr_balance) END AS balance
    FROM balances
  ),
  pnl AS (
    SELECT COALESCE(SUM(CASE WHEN c.type = 'REVENUE' THEN p.credit - p.debit
                             WHEN c.type = 'EXPENSE' THEN p.credit - p.debit END), 0) AS net_income
    FROM posted p JOIN public.categories c ON c.id = p.category_id
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(balance) FROM placed WHERE section = 'ASSET'), 0) AS assets,
      COALESCE((SELECT SUM(balance) FROM placed WHERE section = 'LIABILITY'), 0) AS liabilities,
      COALESCE((SELECT SUM(balance) FROM placed WHERE section = 'EQUITY'), 0) + (SELECT net_income FROM pnl) AS equity
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'assets', COALESCE((SELECT jsonb_agg(jsonb_build_object('category_id', category_id, 'category_code', category_code,
        'category_name', category_name, 'balance', balance, 'color', color) ORDER BY category_code)
      FROM placed WHERE section = 'ASSET'), '[]'::jsonb),
    'liabilities', COALESCE((SELECT jsonb_agg(jsonb_build_object('category_id', category_id, 'category_code', category_code,
        'category_name', category_name, 'balance', balance, 'color', color) ORDER BY category_code)
      FROM placed WHERE section = 'LIABILITY'), '[]'::jsonb),
    'equity', COALESCE((SELECT jsonb_agg(row_obj ORDER BY ord, code) FROM (
        SELECT 1 AS ord, category_code AS code, jsonb_build_object('category_id', category_id, 'category_code', category_code,
          'category_name', category_name, 'balance', balance, 'color', color) AS row_obj
        FROM placed WHERE section = 'EQUITY'
        UNION ALL
        SELECT 2, 'NI-CY', jsonb_build_object('category_id', '00000000-0000-0000-0000-0000000000ni', 'category_code', 'NI-CY',
          'category_name', 'صافي ربح / (خسارة) الفترة الجارية', 'balance', net_income, 'color', NULL, 'is_net_income', true)
        FROM pnl WHERE ABS(net_income) > 0.0005
      ) equity_rows), '[]'::jsonb),
    'summary', (SELECT jsonb_build_object('total_assets', assets, 'total_liabilities', liabilities,
        'total_equity', equity, 'net_income', (SELECT net_income FROM pnl)) FROM totals)
  ) INTO result;
  RETURN result;
END;
$function$;

-- 6. Pin search_path on SECURITY DEFINER functions that lacked it (after the bodies above are replaced).
--    Each one is pinned only if it exists, so the file also applies to a database built from the
--    repository migrations (where some of these were later replaced) — the result on production is the same.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.apply_charge_allocations(uuid,jsonb)',
    'public.backfill_existing_transactions_to_ledger()',
    'public.get_tenant_rent_status(uuid,date)',
    'public.get_trial_balance(integer)',
    'public.sync_overdue_charge_notifications()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
