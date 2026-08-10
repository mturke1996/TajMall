-- ============================================================
-- Migration 074: تثبيت إدراج contacts + payment_method (إعادة آمنة)
-- - record_rent_payment: cast صريح إلى payment_method
-- - refresh_contacts_api_grants: أعمدة + sequences (تكميل 014/066/073)
-- - create_contact RPC: إدراج آمن عبر SECURITY DEFINER
-- - handle_new_user: دور cashier افتراضي للمستخدم الجديد
-- ============================================================

-- ---- 1) record_rent_payment (نفس إصلاح 073 — idempotent) ------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'record_rent_payment'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.record_rent_payment(%s)',
      r.args
    );
  END LOOP;
END $$;

CREATE FUNCTION public.record_rent_payment(
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

-- ---- 2) refresh_contacts_api_grants + sequences (014) ----------------
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

  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated';
END;
$$;

SELECT public.refresh_contacts_api_grants();

GRANT EXECUTE ON FUNCTION public.refresh_contacts_api_grants() TO authenticated;

-- ---- 3) create_contact RPC -----------------------------------------
CREATE OR REPLACE FUNCTION public.create_contact(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.contacts;
  v_name text;
  v_kind public.contact_kind;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول لإضافة جهة تعامل'
      USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_viewer() THEN
    RAISE EXCEPTION 'دور المشاهد للقراءة فقط — اطلب من المدير ترقية دورك إلى محاسب أو أمين صندوق'
      USING ERRCODE = '42501';
  END IF;

  v_name := btrim(coalesce(p_payload->>'name', ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'الاسم مطلوب';
  END IF;

  BEGIN
    v_kind := coalesce((p_payload->>'kind')::public.contact_kind, 'CUSTOMER'::public.contact_kind);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'نوع جهة التعامل غير صالح';
  END;

  INSERT INTO public.contacts (
    kind,
    name,
    phone,
    phone2,
    email,
    address,
    shop_number,
    floor,
    area_sqm,
    monthly_rent,
    job_title,
    department,
    salary,
    notes,
    name_en,
    id_number,
    tax_number,
    contract_start,
    contract_end,
    hire_date,
    is_active
  ) VALUES (
    v_kind,
    v_name,
    nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
    nullif(btrim(coalesce(p_payload->>'phone2', '')), ''),
    nullif(btrim(coalesce(p_payload->>'email', '')), ''),
    nullif(btrim(coalesce(p_payload->>'address', '')), ''),
    nullif(btrim(coalesce(p_payload->>'shop_number', '')), ''),
    nullif(btrim(coalesce(p_payload->>'floor', '')), ''),
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'area_sqm', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'area_sqm'), '')::numeric
    END,
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'monthly_rent', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'monthly_rent'), '')::numeric
    END,
    nullif(btrim(coalesce(p_payload->>'job_title', '')), ''),
    nullif(btrim(coalesce(p_payload->>'department', '')), ''),
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'salary', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'salary'), '')::numeric
    END,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
    nullif(btrim(coalesce(p_payload->>'name_en', '')), ''),
    nullif(btrim(coalesce(p_payload->>'id_number', '')), ''),
    nullif(btrim(coalesce(p_payload->>'tax_number', '')), ''),
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'contract_start', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'contract_start'), '')::date
    END,
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'contract_end', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'contract_end'), '')::date
    END,
    CASE
      WHEN nullif(btrim(coalesce(p_payload->>'hire_date', '')), '') IS NULL THEN NULL
      ELSE nullif(btrim(p_payload->>'hire_date'), '')::date
    END,
    coalesce((p_payload->>'is_active')::boolean, true)
  )
  RETURNING * INTO v_row;

  RETURN (
    to_jsonb(v_row)
    - 'portal_token'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contact(jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_contact(jsonb) IS
  'إدراج جهة تعامل — يتجاوز قيود أعمدة portal_token ويتحقق من RBAC';

-- ---- 4) ملف المستخدم الجديد: cashier بدل viewer -------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, full_name_ar, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'full_name_ar',
    'cashier'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.auth_can_manage_org() THEN
    RETURN NEW;
  END IF;

  -- bootstrap من handle_new_user (auth.uid() فارغ أثناء إنشاء auth.users)
  IF TG_OP = 'INSERT' AND auth.uid() IS NULL AND NEW.role = 'cashier' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكنك تغيير دورك الخاص — يتطلب صلاحية owner أو admin.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'viewer' THEN
    NEW.role := 'viewer';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
