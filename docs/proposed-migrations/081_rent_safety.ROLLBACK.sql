-- ROLLBACK for 081 — restores the definitions in force before 081 (production + 078).
BEGIN;
CREATE OR REPLACE FUNCTION public.auth_role_may_write()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT public.auth_is_viewer();
$function$;

CREATE OR REPLACE FUNCTION public.process_tenant_charge_posting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_rec_cat_id uuid;
  v_rev_cat_id uuid;
  v_tenant_id uuid;
  v_journal_id uuid;
  v_has_charge_accrual boolean := false;
  v_keep_existing_link boolean := false;
  v_accrual_credit numeric := 0;
BEGIN
  IF current_setting('fluxen.skip_charge_posting', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;

  IF NEW.type = 'SERVICE' THEN
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;
  ELSE
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.lease_contracts
  WHERE id = NEW.contract_id;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'PAID'
      AND NEW.journal_entry_id IS NOT NULL
      AND OLD.amount IS NOT DISTINCT FROM NEW.amount
      AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date
      AND OLD.contract_id IS NOT DISTINCT FROM NEW.contract_id
    THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.source_type = 'CHARGE'
          AND je.source_id = NEW.id
          AND je.status = 'POSTED'
      ) INTO v_has_charge_accrual;

      IF v_has_charge_accrual THEN
        SELECT COALESCE(SUM(jl.credit), 0)
        INTO v_accrual_credit
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.journal_id = je.id
        JOIN public.categories cat ON cat.id = jl.category_id
        WHERE je.source_type = 'CHARGE'
          AND je.source_id = NEW.id
          AND je.status = 'POSTED'
          AND cat.code IN ('REV-RNT', 'REV-SRV');

        IF v_accrual_credit IS NOT DISTINCT FROM NEW.amount THEN
          RETURN NEW;
        END IF;

        PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
      END IF;
    ELSE
      PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    RETURN OLD;
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rec_cat_id,
    'debit', NEW.amount,
    'credit', 0,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rev_cat_id,
    'debit', 0,
    'credit', NEW.amount,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_journal_id := public.post_to_ledger(
    'CHARGE',
    NEW.id,
    NEW.due_date,
    NEW.description,
    NULL,
    NULL,
    v_lines
  );

  IF NEW.journal_entry_id IS DISTINCT FROM v_journal_id THEN
    IF NEW.journal_entry_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.id = NEW.journal_entry_id
          AND (
            je.source_type IS DISTINCT FROM 'CHARGE'
            OR je.source_id IS DISTINCT FROM NEW.id
          )
      ) INTO v_keep_existing_link;
    END IF;

    IF NOT v_keep_existing_link THEN
      PERFORM set_config('fluxen.skip_charge_posting', '1', true);
      UPDATE public.tenant_charges
      SET journal_entry_id = v_journal_id
      WHERE id = NEW.id;
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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

DROP FUNCTION IF EXISTS public.rent_missing_charges(text);
DROP TRIGGER IF EXISTS trg_contacts_protect_history ON public.contacts;
DROP FUNCTION IF EXISTS public.prevent_contact_delete_with_history();
NOTIFY pgrst, 'reload schema';
COMMIT;
