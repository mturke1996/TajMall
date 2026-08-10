-- ============================================================
-- Migration 073: إصلاح payment_method في record_rent_payment
-- + إعادة تطبيق صلاحيات contacts (INSERT/SELECT بدون portal_token)
-- ============================================================

-- ---- 1) record_rent_payment: text → payment_method ----------------
CREATE OR REPLACE FUNCTION public.record_rent_payment(
  tenant_id uuid,
  amount numeric,
  payment_date date DEFAULT CURRENT_DATE,
  cashbox_id uuid DEFAULT NULL,
  description text DEFAULT NULL,
  rent_months text[] DEFAULT NULL,
  payment_method text DEFAULT 'CASH'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid, numeric, date, uuid, text, text[], text)
  TO authenticated;

COMMENT ON FUNCTION public.record_rent_payment(uuid, numeric, date, uuid, text, text[], text) IS
  'تحصيل إيجار: معاملة + قيد + ربط أشهر — method من نوع payment_method';

-- ---- 2) إعادة صلاحيات contacts (آمن للإعادة) --------------------
CREATE OR REPLACE FUNCTION public.refresh_contacts_api_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cols text;
BEGIN
  IF to_regclass('public.contacts') IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name <> 'portal_token';

  IF cols IS NULL OR length(cols) < 3 THEN
    RAISE EXCEPTION 'contacts columns not found for API grants';
  END IF;

  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM authenticated';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM authenticated';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM authenticated';

  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.contacts TO anon, authenticated',
    cols
  );
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.contacts TO authenticated',
    cols
  );
  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.contacts TO authenticated',
    cols
  );
  EXECUTE 'GRANT DELETE ON TABLE public.contacts TO authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.contacts TO service_role';
  EXECUTE 'GRANT ALL ON TABLE public.contacts TO postgres';
END;
$$;

SELECT public.refresh_contacts_api_grants();

GRANT EXECUTE ON FUNCTION public.refresh_contacts_api_grants() TO authenticated;

NOTIFY pgrst, 'reload schema';
