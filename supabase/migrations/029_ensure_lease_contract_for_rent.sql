-- عقد إيجار تلقائي للمستأجر (تقويم الإيجار بدون إنشاء عقد يدوياً)

CREATE OR REPLACE FUNCTION public.ensure_tenant_lease_contract(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_rent numeric;
  v_shop text;
  v_floor text;
  v_unit_id uuid;
  v_start date;
  v_end date;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  SELECT lc.id INTO v_contract_id
  FROM public.lease_contracts lc
  WHERE lc.tenant_id = p_tenant_id
  ORDER BY
    CASE lc.status WHEN 'ACTIVE' THEN 0 WHEN 'EXPIRED' THEN 1 ELSE 2 END,
    lc.start_date DESC
  LIMIT 1;

  IF v_contract_id IS NOT NULL THEN
    RETURN v_contract_id;
  END IF;

  SELECT
    COALESCE(NULLIF(c.monthly_rent, 0), 1),
    NULLIF(btrim(c.shop_number), ''),
    NULLIF(btrim(c.floor), '')
  INTO v_rent, v_shop, v_floor
  FROM public.contacts c
  WHERE c.id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستأجر غير موجود';
  END IF;

  IF v_shop IS NOT NULL THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    WHERE mu.unit_number = v_shop
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    ORDER BY
      CASE mu.status WHEN 'AVAILABLE' THEN 0 WHEN 'OCCUPIED' THEN 1 ELSE 2 END,
      mu.unit_number
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    INSERT INTO public.mall_units (unit_number, floor, area_sqm, status, notes)
    VALUES (
      COALESCE(v_shop, 'محل-' || left(replace(p_tenant_id::text, '-', ''), 8)),
      COALESCE(v_floor, '—'),
      0,
      'OCCUPIED',
      'أُنشئ تلقائياً لتقويم الإيجار'
    )
    RETURNING id INTO v_unit_id;
  ELSE
    UPDATE public.mall_units SET status = 'OCCUPIED' WHERE id = v_unit_id;
  END IF;

  v_start := date_trunc('year', CURRENT_DATE)::date;
  v_end := (v_start + interval '10 years')::date;

  INSERT INTO public.lease_contracts (
    tenant_id,
    unit_id,
    start_date,
    end_date,
    monthly_rent,
    services_amount,
    deposit_amount,
    status
  ) VALUES (
    p_tenant_id,
    v_unit_id,
    v_start,
    v_end,
    v_rent,
    0,
    0,
    'ACTIVE'
  )
  RETURNING id INTO v_contract_id;

  UPDATE public.contacts
  SET
    monthly_rent = CASE WHEN COALESCE(monthly_rent, 0) <= 0 THEN v_rent ELSE monthly_rent END,
    shop_number = COALESCE(shop_number, v_shop),
    floor = COALESCE(floor, v_floor),
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN v_contract_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_tenant_rent_charges(
  p_tenant_id uuid,
  p_months text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_month text;
  v_due date;
  v_charge_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_existing uuid;
  v_rent_amount numeric;
BEGIN
  v_contract_id := public.ensure_tenant_lease_contract(p_tenant_id);

  SELECT COALESCE(NULLIF(lc.monthly_rent, 0), NULLIF(c.monthly_rent, 0), 1)
  INTO v_rent_amount
  FROM public.lease_contracts lc
  JOIN public.contacts c ON c.id = lc.tenant_id
  WHERE lc.id = v_contract_id;

  FOREACH v_month IN ARRAY p_months LOOP
    v_due := (v_month || '-01')::date;

    SELECT tc.id INTO v_existing
    FROM public.tenant_charges tc
    WHERE tc.contract_id = v_contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_charge_id := v_existing;
    ELSE
      INSERT INTO public.tenant_charges (
        contract_id, amount, due_date, type, description, status, total_paid
      ) VALUES (
        v_contract_id,
        v_rent_amount,
        v_due,
        'RENT',
        'إيجار شهر ' || v_month,
        'UNPAID',
        0
      )
      RETURNING id INTO v_charge_id;
    END IF;

    v_created := v_created || jsonb_build_array(
      jsonb_build_object('month', v_month, 'charge_id', v_charge_id)
    );
  END LOOP;

  RETURN jsonb_build_object('charges', v_created, 'contract_id', v_contract_id);
END;
$$;

-- إعادة نشر set_tenant_rent_month_status مع ensure عقد تلقائي
DROP FUNCTION IF EXISTS public.set_tenant_rent_month_status(uuid, text[], boolean, uuid);

CREATE OR REPLACE FUNCTION public.set_tenant_rent_month_status(
  p_tenant_id uuid,
  p_months text[],
  p_paid boolean DEFAULT true,
  p_journal_entry_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_due date;
  v_je_number int;
  v_je_desc text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_months IS NULL OR cardinality(p_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهراً واحداً على الأقل';
  END IF;

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

  PERFORM public.ensure_tenant_rent_charges(p_tenant_id, p_months);

  FOREACH v_month IN ARRAY p_months LOOP
    IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'صيغة شهر غير صالحة: %', v_month;
    END IF;

    v_due := (v_month || '-01')::date;

    IF p_paid THEN
      UPDATE public.tenant_charges tc
      SET
        status = 'PAID',
        total_paid = tc.amount,
        journal_entry_id = p_journal_entry_id,
        description = 'إيجار شهر ' || v_month
          || ' · قيد #' || v_je_number::text
          || COALESCE(' — ' || NULLIF(btrim(v_je_desc), ''), ''),
        updated_at = now()
      FROM public.lease_contracts lc
      WHERE tc.contract_id = lc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due;
    ELSE
      UPDATE public.tenant_charges tc
      SET
        status = 'UNPAID',
        total_paid = 0,
        journal_entry_id = NULL,
        description = 'إيجار شهر ' || v_month,
        updated_at = now()
      FROM public.lease_contracts lc
      WHERE tc.contract_id = lc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'months', to_jsonb(p_months),
    'paid', p_paid,
    'journal_entry_id', p_journal_entry_id
  );
END;
$$;

-- إصلاح get_cash_flow عند غياب view الأرصدة
CREATE OR REPLACE FUNCTION public.get_cash_flow(p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date := make_date(p_year, 1, 1);
  end_date date := make_date(p_year + 1, 1, 1);
  result jsonb;
  v_opening_balance numeric := 0;
  v_closing_balance numeric := 0;
  v_operating_in numeric;
  v_operating_out numeric;
  v_investing_in numeric;
  v_investing_out numeric;
  v_financing_in numeric;
  v_financing_out numeric;
BEGIN
  SELECT
    COALESCE(SUM(opening_balance), 0),
    COALESCE(SUM(balance), 0)
  INTO v_opening_balance, v_closing_balance
  FROM public.cashbox_balances;

  SELECT
    COALESCE(SUM(CASE WHEN kind = 'REVENUE' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN kind = 'EXPENSE' THEN amount ELSE 0 END), 0)
  INTO v_operating_in, v_operating_out
  FROM public.transactions
  WHERE status = 'POSTED'
    AND tx_date >= start_date
    AND tx_date < end_date
    AND kind IN ('REVENUE', 'EXPENSE');

  SELECT
    COALESCE(SUM(CASE WHEN jl.debit > jl.credit THEN jl.debit - jl.credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jl.credit > jl.debit THEN jl.credit - jl.debit ELSE 0 END), 0)
  INTO v_investing_out, v_investing_in
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= start_date
    AND je.entry_date < end_date
    AND c.type = 'ASSET';

  SELECT
    COALESCE(SUM(CASE WHEN jl.credit > jl.debit THEN jl.credit - jl.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jl.debit > jl.credit THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_financing_in, v_financing_out
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= start_date
    AND je.entry_date < end_date
    AND c.type IN ('EQUITY', 'LIABILITY');

  SELECT jsonb_build_object(
    'operating', jsonb_build_array(
      jsonb_build_object('category', 'الإيرادات', 'description', 'إيرادات النشاط التشغيلي', 'amount', v_operating_in::text, 'is_positive', true),
      jsonb_build_object('category', 'المصروفات', 'description', 'مصروفات النشاط التشغيلي', 'amount', v_operating_out::text, 'is_positive', false)
    ),
    'investing', jsonb_build_array(
      jsonb_build_object('category', 'تصريف أصول', 'description', 'شراء أو بيع أصول ثابتة', 'amount', v_investing_out::text, 'is_positive', false),
      jsonb_build_object('category', 'إيراد أصول', 'description', 'بيع أصول ثابتة', 'amount', v_investing_in::text, 'is_positive', true)
    ),
    'financing', jsonb_build_array(
      jsonb_build_object('category', 'تمويل داخل', 'description', 'قروض واستثمارات', 'amount', v_financing_in::text, 'is_positive', true),
      jsonb_build_object('category', 'تمويل خارج', 'description', 'سداد قروض', 'amount', v_financing_out::text, 'is_positive', false)
    ),
    'summary', jsonb_build_object(
      'opening_balance', v_opening_balance::text,
      'operating_inflow', v_operating_in::text,
      'operating_outflow', v_operating_out::text,
      'net_operating', (v_operating_in - v_operating_out)::text,
      'investing_inflow', v_investing_in::text,
      'investing_outflow', v_investing_out::text,
      'net_investing', (v_investing_in - v_investing_out)::text,
      'financing_inflow', v_financing_in::text,
      'financing_outflow', v_financing_out::text,
      'net_financing', (v_financing_in - v_financing_out)::text,
      'net_change', (v_closing_balance - v_opening_balance)::text,
      'closing_balance', v_closing_balance::text
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_lease_contract(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid, text[], boolean, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
