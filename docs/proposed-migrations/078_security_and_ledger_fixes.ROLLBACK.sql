-- ROLLBACK for 078 — restores the exact pre-078 production state captured on 2026-10-18.
BEGIN;

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
    p_voucher_id::text
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
    p_voucher_id::text
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
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH category_balances AS (
    SELECT
      c.id AS category_id,
      c.code AS category_code,
      c.name_ar AS category_name,
      c.type AS category_type,
      c.color,
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance
    FROM public.categories c
    LEFT JOIN public.journal_lines jl ON jl.category_id = c.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date <= p_as_of
    WHERE c.active = true
      AND c.type IN ('ASSET', 'LIABILITY', 'EQUITY')
    GROUP BY c.id, c.code, c.name_ar, c.type, c.color
    HAVING ABS(COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)) > 0.001
  ),
  pnl AS (
    SELECT
      COALESCE((
        SELECT SUM(jl.credit) - SUM(jl.debit)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        JOIN public.categories c ON c.id = jl.category_id
        WHERE je.status = 'POSTED'
          AND je.entry_date <= p_as_of
          AND c.type = 'REVENUE'
          AND c.active = true
      ), 0)
      -
      COALESCE((
        SELECT SUM(jl.debit) - SUM(jl.credit)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        JOIN public.categories c ON c.id = jl.category_id
        WHERE je.status = 'POSTED'
          AND je.entry_date <= p_as_of
          AND c.type = 'EXPENSE'
          AND c.active = true
      ), 0) AS net_income
  ),
  section_totals AS (
    SELECT
      category_type,
      SUM(
        CASE
          WHEN category_type = 'ASSET' THEN GREATEST(balance, 0)
          WHEN category_type IN ('LIABILITY', 'EQUITY') THEN GREATEST(-balance, 0)
          ELSE 0
        END
      ) AS section_total
    FROM category_balances
    GROUP BY category_type
  ),
  equity_total AS (
    SELECT
      COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'EQUITY'), 0)
      + COALESCE((SELECT net_income FROM pnl), 0) AS total_equity_with_ni
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'assets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'balance', GREATEST(balance, 0),
        'color', color
      ) ORDER BY category_code), '[]'::jsonb)
      FROM category_balances WHERE category_type = 'ASSET' AND balance > 0.001
    ),
    'liabilities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'balance', GREATEST(-balance, 0),
        'color', color
      ) ORDER BY category_code), '[]'::jsonb)
      FROM category_balances WHERE category_type = 'LIABILITY' AND balance < -0.001
    ),
    'equity', (
      SELECT COALESCE(jsonb_agg(row_obj ORDER BY ord, code), '[]'::jsonb)
      FROM (
        SELECT
          1 AS ord,
          category_code AS code,
          jsonb_build_object(
            'category_id', category_id,
            'category_code', category_code,
            'category_name', category_name,
            'balance', GREATEST(-balance, 0),
            'color', color
          ) AS row_obj
        FROM category_balances
        WHERE category_type = 'EQUITY' AND balance < -0.001
        UNION ALL
        SELECT
          2 AS ord,
          'NI-CY' AS code,
          jsonb_build_object(
            'category_id', '00000000-0000-0000-0000-0000000000ni',
            'category_code', 'NI-CY',
            'category_name', 'صافي ربح / (خسارة) الفترة الجارية',
            'balance', net_income,
            'color', NULL,
            'is_net_income', true
          ) AS row_obj
        FROM pnl
        WHERE ABS(net_income) > 0.001
      ) equity_rows
    ),
    'summary', jsonb_build_object(
      'total_assets', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'ASSET'), 0),
      'total_liabilities', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'LIABILITY'), 0),
      'total_equity', (SELECT total_equity_with_ni FROM equity_total),
      'net_income', COALESCE((SELECT net_income FROM pnl), 0)
    )
  ) INTO result;

  RETURN result;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tx_category_matches_kind ON public.transactions;
DROP FUNCTION IF EXISTS public.check_transaction_category_kind();
DROP FUNCTION IF EXISTS public.post_missing_charge_accrual(uuid);
DROP FUNCTION IF EXISTS public.charge_accrual_entry_date(date);
DROP POLICY IF EXISTS "rbac_insert_correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "rbac_update_correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "rbac_delete_correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "rbac_insert_receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "rbac_update_receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "rbac_delete_receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "rbac_insert_receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "rbac_update_receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "rbac_delete_receipt_voucher_lines" ON public.receipt_voucher_lines;
CREATE POLICY "auth full access journal_entries" ON public.journal_entries AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access journal_lines" ON public.journal_lines AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_insert_policy" ON public.account_mappings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.account_mappings AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.account_mappings AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_insert_policy" ON public.fiscal_periods AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.fiscal_periods AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.fiscal_periods AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_insert_policy" ON public.lease_contracts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.lease_contracts AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.lease_contracts AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_insert_policy" ON public.mall_units AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.mall_units AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.mall_units AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_insert_policy" ON public.tenant_charge_allocations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.tenant_charge_allocations AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.tenant_charge_allocations AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_insert_policy" ON public.tenant_charges AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_policy" ON public.tenant_charges AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_policy" ON public.tenant_charges AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth insert correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete correspondence_letters" ON public.correspondence_letters AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth insert receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete receipt_vouchers" ON public.receipt_vouchers AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth insert receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete receipt_voucher_lines" ON public.receipt_voucher_lines AS PERMISSIVE FOR DELETE TO authenticated USING (true);
-- Only functions that exist (the repository-built replica lacks some production-only signatures).
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
      EXECUTE format('ALTER FUNCTION %s RESET search_path', f);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_strict_rbac_policies(text), public.dedupe_rent_charges_data(), public.purge_rent_links_for_journal(uuid), public.recalc_tenant_charge_rent_paid(uuid), public.refresh_contacts_api_grants(), public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb) TO authenticated;
-- Function grants are restored only for functions that exist: identical on production, and the
-- file can also be exercised on a replica built from the repository migrations.
DO $$ BEGIN IF to_regprocedure('public._assert_inventory_pin_format(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public._assert_inventory_pin_format(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_cashbox_inventory(text,jsonb,text,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_cashbox_inventory(text,jsonb,text,date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_charge_allocations(uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_charge_allocations(uuid,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_strict_rbac_policies(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_strict_rbac_policies(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.assert_fiscal_period_open(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.assert_fiscal_period_open(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_cashbox_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_cashbox_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_contact_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_contact_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_journal_entry_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_journal_entry_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_lease_contract_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_lease_contract_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_tenant_charge_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_tenant_charge_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_transaction_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_transaction_changes() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_can_manage_org()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_can_manage_org() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_is_viewer()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_is_viewer() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_may_manage_accounts()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_may_manage_accounts() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_may_manage_journals()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_may_manage_journals() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_role_may_write()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_role_may_write() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auto_allocate_tenant_rent_payment()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auto_allocate_tenant_rent_payment() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.backfill_existing_transactions_to_ledger()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.backfill_existing_transactions_to_ledger() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.cashbox_inventory_pin_is_set()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.cashbox_inventory_pin_is_set() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.check_fiscal_period_overlap()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.check_fiscal_period_overlap() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.check_lease_contract_overlap()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.check_lease_contract_overlap() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.close_fiscal_year(integer,boolean)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.close_fiscal_year(integer,boolean) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.close_fiscal_year(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.close_fiscal_year(integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.create_contact(jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.create_contact(jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.create_journal_entry(text,date,text,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.create_journal_entry(text,date,text,text,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.decide_voucher_approval(uuid,boolean,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.decide_voucher_approval(uuid,boolean,text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.dedupe_rent_charges_data()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.dedupe_rent_charges_data() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.delete_disbursement_voucher(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.delete_disbursement_voucher(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.duplicate_journal_entry(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.duplicate_journal_entry(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_lease_contract(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_lease_contract(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_portal_token(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_portal_token(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_rent_charges(uuid,text[])') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_rent_charges(uuid,text[]) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_cash_transfer_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_cash_transfer_reference(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_contact_code()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_contact_code() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_journal_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_journal_reference(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_monthly_charges(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_audit_log_feed(integer,integer,text,date,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_audit_log_feed(integer,integer,text,date,date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_balance_sheet(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_balance_sheet(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cash_flow(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cash_flow(integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cashbox_balance(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cashbox_balance(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cashbox_ledger(uuid,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cashbox_ledger(uuid,integer,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_general_ledger_lines(uuid,date,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_general_ledger_lines(uuid,date,date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_filtered(text,uuid,uuid,text,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_filtered(text,uuid,uuid,text,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_for_period(date,date,text,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date,date,text,integer,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_for_period(date,date,text,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date,date,text,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_lines_for_period(date,date,text,uuid,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date,date,text,uuid,integer,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_lines_for_period(date,date,text,uuid,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date,date,text,uuid,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_my_role()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_my_role() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_profit_loss(integer,text,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_profit_loss(integer,text,integer,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_ar_aging(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_ar_aging(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_rent_calendar(uuid,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_rent_calendar(uuid,integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_rent_status(uuid,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_rent_status(uuid,date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_treasury_balance_total()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_treasury_balance_total() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_trial_balance(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_trial_balance(integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_tenant_rent_month_exempt(uuid,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.is_tenant_rent_month_exempt(uuid,text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.mark_tenant_rent_months_paid(uuid,text[])') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.mark_tenant_rent_months_paid(uuid,text[]) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.peek_next_journal_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.peek_next_journal_reference(date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.post_journal_entry(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.post_journal_entry(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.post_to_ledger(text,uuid,date,text,text,uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.post_to_ledger(text,uuid,date,text,text,uuid,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.prevent_role_self_escalation()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.prevent_role_self_escalation() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.preview_fiscal_year_close(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.preview_fiscal_year_close(integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_disbursement_voucher_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_disbursement_voucher_posting() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_tenant_charge_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_tenant_charge_posting() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_transaction_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_transaction_posting() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.purge_rent_links_for_journal(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.purge_rent_links_for_journal(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.recalc_tenant_charge_rent_paid(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.recalc_tenant_charge_rent_paid(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.record_cashbox_transfer(uuid,uuid,numeric,date,text,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.record_cashbox_transfer(uuid,uuid,numeric,date,text,text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.record_rent_payment(uuid,numeric,date,uuid,text,text[],text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid,numeric,date,uuid,text,text[],text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.refresh_contacts_api_grants()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.refresh_contacts_api_grants() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.resolve_tenant_rent_amount(uuid,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.resolve_tenant_rent_amount(uuid,text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.reverse_journal_entry(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.reverse_ledger_entry(text,uuid,uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry(text,uuid,uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_cashbox_inventory_pin(text,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_cashbox_inventory_pin(text,text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_ledger_event_reconciled(text,uuid,boolean)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_ledger_event_reconciled(text,uuid,boolean) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_exempt_months(uuid,text[],boolean,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_exempt_months(uuid,text[],boolean,date) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_month_status(uuid,text[],boolean,uuid,numeric)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid,text[],boolean,uuid,numeric) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_price_bands(uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_price_bands(uuid,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_transaction_posted()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_transaction_posted() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.submit_voucher_for_approval(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.submit_voucher_for_approval(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_overdue_charge_notifications()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_overdue_charge_notifications() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_rent_charges_to_schedule(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_rent_charges_to_schedule(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_unpaid_rent_charges_to_schedule(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_unpaid_rent_charges_to_schedule(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.tenant_rent_claim_start(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.tenant_rent_claim_start(uuid) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.tenant_rent_summary_for_month(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.tenant_rent_summary_for_month(text) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.trg_journal_rent_links_on_status()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.trg_journal_rent_links_on_status() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.trg_rent_link_recalc_charge()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.trg_rent_link_recalc_charge() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.update_journal_entry(uuid,text,date,text,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.update_journal_entry(uuid,text,date,text,text,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.user_has_audit_access()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.user_has_audit_access() TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.year_close_source_id(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.year_close_source_id(integer) TO PUBLIC; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public._assert_inventory_pin_format(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public._assert_inventory_pin_format(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_cashbox_inventory(text,jsonb,text,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_cashbox_inventory(text,jsonb,text,date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_charge_allocations(uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_charge_allocations(uuid,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.apply_strict_rbac_policies(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.apply_strict_rbac_policies(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.assert_fiscal_period_open(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.assert_fiscal_period_open(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_cashbox_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_cashbox_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_contact_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_contact_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_journal_entry_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_journal_entry_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_lease_contract_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_lease_contract_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_tenant_charge_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_tenant_charge_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.audit_transaction_changes()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.audit_transaction_changes() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_can_manage_org()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_can_manage_org() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_is_viewer()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_is_viewer() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_may_manage_accounts()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_may_manage_accounts() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_may_manage_journals()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_may_manage_journals() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auth_role_may_write()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auth_role_may_write() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.auto_allocate_tenant_rent_payment()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.auto_allocate_tenant_rent_payment() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.backfill_existing_transactions_to_ledger()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.backfill_existing_transactions_to_ledger() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.cashbox_inventory_pin_is_set()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.cashbox_inventory_pin_is_set() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.check_fiscal_period_overlap()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.check_fiscal_period_overlap() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.check_lease_contract_overlap()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.check_lease_contract_overlap() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.close_fiscal_year(integer,boolean)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.close_fiscal_year(integer,boolean) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.close_fiscal_year(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.close_fiscal_year(integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.create_contact(jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.create_contact(jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.create_journal_entry(text,date,text,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.create_journal_entry(text,date,text,text,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.decide_voucher_approval(uuid,boolean,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.decide_voucher_approval(uuid,boolean,text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.dedupe_rent_charges_data()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.dedupe_rent_charges_data() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.delete_disbursement_voucher(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.delete_disbursement_voucher(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.duplicate_journal_entry(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.duplicate_journal_entry(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_lease_contract(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_lease_contract(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_portal_token(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_portal_token(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.ensure_tenant_rent_charges(uuid,text[])') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.ensure_tenant_rent_charges(uuid,text[]) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_cash_transfer_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_cash_transfer_reference(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_contact_code()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_contact_code() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_journal_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_journal_reference(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.generate_monthly_charges(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_audit_log_feed(integer,integer,text,date,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_audit_log_feed(integer,integer,text,date,date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_balance_sheet(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_balance_sheet(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cash_flow(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cash_flow(integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cashbox_balance(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cashbox_balance(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_cashbox_ledger(uuid,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_cashbox_ledger(uuid,integer,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_general_ledger_lines(uuid,date,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_general_ledger_lines(uuid,date,date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_filtered(text,uuid,uuid,text,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_filtered(text,uuid,uuid,text,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_for_period(date,date,text,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date,date,text,integer,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_entries_for_period(date,date,text,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date,date,text,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_lines_for_period(date,date,text,uuid,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date,date,text,uuid,integer,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_journal_lines_for_period(date,date,text,uuid,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date,date,text,uuid,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_my_role()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_profit_loss(integer,text,integer,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_profit_loss(integer,text,integer,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_ar_aging(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_ar_aging(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_rent_calendar(uuid,integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_rent_calendar(uuid,integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_tenant_rent_status(uuid,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_tenant_rent_status(uuid,date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_treasury_balance_total()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_treasury_balance_total() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.get_trial_balance(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.get_trial_balance(integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.is_tenant_rent_month_exempt(uuid,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.is_tenant_rent_month_exempt(uuid,text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.mark_tenant_rent_months_paid(uuid,text[])') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.mark_tenant_rent_months_paid(uuid,text[]) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.peek_next_journal_reference(date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.peek_next_journal_reference(date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.post_journal_entry(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.post_journal_entry(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.post_to_ledger(text,uuid,date,text,text,uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.post_to_ledger(text,uuid,date,text,text,uuid,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.prevent_role_self_escalation()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.prevent_role_self_escalation() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.preview_fiscal_year_close(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.preview_fiscal_year_close(integer) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_disbursement_voucher_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_disbursement_voucher_posting() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_tenant_charge_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_tenant_charge_posting() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.process_transaction_posting()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.process_transaction_posting() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.purge_rent_links_for_journal(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.purge_rent_links_for_journal(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.recalc_tenant_charge_rent_paid(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.recalc_tenant_charge_rent_paid(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.record_cashbox_transfer(uuid,uuid,numeric,date,text,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.record_cashbox_transfer(uuid,uuid,numeric,date,text,text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.record_rent_payment(uuid,numeric,date,uuid,text,text[],text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid,numeric,date,uuid,text,text[],text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.refresh_contacts_api_grants()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.refresh_contacts_api_grants() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.resolve_tenant_rent_amount(uuid,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.resolve_tenant_rent_amount(uuid,text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.reverse_journal_entry(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.reverse_ledger_entry(text,uuid,uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry(text,uuid,uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_cashbox_inventory_pin(text,text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_cashbox_inventory_pin(text,text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_ledger_event_reconciled(text,uuid,boolean)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_ledger_event_reconciled(text,uuid,boolean) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_exempt_months(uuid,text[],boolean,date)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_exempt_months(uuid,text[],boolean,date) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_month_status(uuid,text[],boolean,uuid,numeric)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid,text[],boolean,uuid,numeric) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_tenant_rent_price_bands(uuid,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_tenant_rent_price_bands(uuid,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_transaction_posted()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_transaction_posted() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.submit_voucher_for_approval(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.submit_voucher_for_approval(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_overdue_charge_notifications()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_overdue_charge_notifications() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_rent_charges_to_schedule(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_rent_charges_to_schedule(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.sync_unpaid_rent_charges_to_schedule(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.sync_unpaid_rent_charges_to_schedule(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.tenant_rent_claim_start(uuid)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.tenant_rent_claim_start(uuid) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.tenant_rent_summary_for_month(text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.tenant_rent_summary_for_month(text) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.trg_journal_rent_links_on_status()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.trg_journal_rent_links_on_status() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.trg_rent_link_recalc_charge()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.trg_rent_link_recalc_charge() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.update_journal_entry(uuid,text,date,text,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.update_journal_entry(uuid,text,date,text,text,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.user_has_audit_access()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.user_has_audit_access() TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.write_audit_log(text,text,uuid,text,text,date,numeric,uuid,text,jsonb) TO anon; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.year_close_source_id(integer)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.year_close_source_id(integer) TO anon; END IF; END $$;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_mappings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.app_notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.branches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.budgets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cash_transfers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cashbox_balances TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cashbox_inventory_lines TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cashbox_inventory_runs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cashboxes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.categories TO anon;
GRANT DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.contacts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.correspondence_letters TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.disbursement_voucher_lines TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.disbursement_vouchers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.employee_summary TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fiscal_periods TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_entries_with_totals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_form_drafts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_lines TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_lines_with_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_reference_sequences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.journal_summary TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lease_contracts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.mall_units TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.monthly_summary TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipt_voucher_lines TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipt_vouchers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_charge_allocations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_charges TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_rent_exempt_months TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_rent_journal_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_rent_price_bands TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenant_rent_summary TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tenants_rent_status TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.top_expense_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transaction_form_drafts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions TO anon;
SELECT public.refresh_contacts_api_grants();
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
