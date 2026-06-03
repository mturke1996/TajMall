-- ============================================================
-- Migration 022: تقويم إيجار بالمطالبات + ملخص مستأجر من charges
-- ============================================================

-- ── ملخص مستأجر: حالة الشهر الحالي من مطالبة RENT وليس من tx_date ──
-- يجب DROP لأن PostgreSQL لا يسمح بتغيير أسماء/ترتيب أعمدة الـ VIEW بـ CREATE OR REPLACE
DROP VIEW IF EXISTS public.tenant_rent_summary;

CREATE VIEW public.tenant_rent_summary AS
SELECT
  c.id,
  c.name,
  c.shop_number,
  c.floor,
  c.monthly_rent,
  c.phone,
  COALESCE(cur.paid, 0) AS current_month_paid,
  CASE
    WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
    WHEN cur.charge_status = 'PAID' THEN 'paid_full'
    WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
    WHEN COALESCE(cur.paid, 0) >= c.monthly_rent THEN 'paid_full'
    WHEN COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    ELSE 'unpaid'
  END AS current_month_status,
  COALESCE(
    (
      SELECT SUM(t.amount)
      FROM public.transactions t
      INNER JOIN public.categories cat ON cat.id = t.category_id
      WHERE t.contact_id = c.id
        AND t.kind = 'REVENUE'
        AND t.status = 'POSTED'
        AND cat.code LIKE 'REV-RNT%'
        AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
    ),
    0
  ) AS last_12_months_revenue,
  (
    COALESCE(
      (
        SELECT SUM(t.amount)
        FROM public.transactions t
        INNER JOIN public.categories cat ON cat.id = t.category_id
        WHERE t.contact_id = c.id
          AND t.kind = 'REVENUE'
          AND t.status = 'POSTED'
          AND cat.code LIKE 'REV-RNT%'
      ),
      0
    )
    - COALESCE(
      (
        SELECT SUM(tc.amount)
        FROM public.tenant_charges tc
        INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
        WHERE lc.tenant_id = c.id
          AND tc.type = 'RENT'
          AND tc.status = 'PAID'
      ),
      0
    )
  ) AS total_balance,
  COALESCE(open_ar.open_total, 0) AS open_charges_total,
  COALESCE(open_ar.open_count, 0)::int AS open_charges_count
FROM public.contacts c
LEFT JOIN LATERAL (
  SELECT
    tc.status AS charge_status,
    tc.total_paid AS paid
  FROM public.tenant_charges tc
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = c.id
    AND lc.status = 'ACTIVE'
    AND tc.type = 'RENT'
    AND tc.due_date >= DATE_TRUNC('month', CURRENT_DATE)::date
    AND tc.due_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
  ORDER BY tc.due_date DESC
  LIMIT 1
) cur ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(GREATEST(tc.amount - tc.total_paid, 0)) AS open_total,
    COUNT(*)::int AS open_count
  FROM public.tenant_charges tc
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = c.id
    AND tc.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    AND tc.amount > tc.total_paid
) open_ar ON TRUE
WHERE c.kind = 'TENANT' AND c.is_active = true;

-- ── تقويم شهور السنة لمستأجر (مدفوع / غير مدفوع / بلا مطالبة) ──
CREATE OR REPLACE FUNCTION public.get_tenant_rent_calendar(
  p_tenant_id uuid,
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly numeric;
  v_contract_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_m int;
  v_month_key text;
  v_due date;
  v_charge_id uuid;
  v_charge_status text;
  v_status text;
  v_paid numeric;
  v_amount numeric;
  v_desc text;
BEGIN
  SELECT c.monthly_rent INTO v_monthly
  FROM public.contacts c
  WHERE c.id = p_tenant_id AND c.kind = 'TENANT';

  SELECT lc.id INTO v_contract_id
  FROM public.lease_contracts lc
  WHERE lc.tenant_id = p_tenant_id AND lc.status = 'ACTIVE'
  ORDER BY lc.start_date DESC
  LIMIT 1;

  FOR v_m IN 1..12 LOOP
    v_month_key := p_year::text || '-' || LPAD(v_m::text, 2, '0');
    v_due := (v_month_key || '-01')::date;

    v_charge_id := NULL;
    v_desc := NULL;
    v_charge_status := NULL;

    SELECT tc.id, tc.status, tc.amount, tc.total_paid, tc.description
    INTO v_charge_id, v_charge_status, v_amount, v_paid, v_desc
    FROM public.tenant_charges tc
    WHERE v_contract_id IS NOT NULL
      AND tc.contract_id = v_contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_charge_id IS NOT NULL THEN
      IF v_charge_status = 'PAID' OR v_paid >= v_amount THEN
        v_status := 'paid';
      ELSIF v_paid > 0 OR v_charge_status = 'PARTIAL' THEN
        v_status := 'partial';
      ELSE
        v_status := 'unpaid';
      END IF;
    ELSIF v_monthly IS NOT NULL AND v_monthly > 0 AND v_contract_id IS NOT NULL THEN
      v_status := 'no_charge';
      v_amount := v_monthly;
      v_paid := 0;
      v_charge_id := NULL;
    ELSE
      v_status := 'na';
      v_amount := 0;
      v_paid := 0;
      v_charge_id := NULL;
    END IF;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'month', v_month_key,
        'status', v_status,
        'amount', COALESCE(v_amount, 0),
        'paid', COALESCE(v_paid, 0),
        'charge_id', v_charge_id,
        'description', v_desc
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'year', p_year,
    'tenant_id', p_tenant_id,
    'monthly_rent', COALESCE(v_monthly, 0),
    'contract_id', v_contract_id,
    'months', v_result
  );
END;
$$;

-- ── إنشاء مطالبات RENT لشهور محددة لمستأجر واحد ──
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
  v_contract public.lease_contracts%ROWTYPE;
  v_month text;
  v_due date;
  v_charge_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_existing uuid;
  v_rent_amount numeric;
BEGIN
  SELECT * INTO v_contract
  FROM public.lease_contracts lc
  WHERE lc.tenant_id = p_tenant_id AND lc.status = 'ACTIVE'
  ORDER BY lc.start_date DESC
  LIMIT 1;

  IF v_contract.id IS NULL THEN
    SELECT * INTO v_contract
    FROM public.lease_contracts lc
    WHERE lc.tenant_id = p_tenant_id
    ORDER BY lc.start_date DESC
    LIMIT 1;
  END IF;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد عقد إيجار لهذا المستأجر';
  END IF;

  SELECT COALESCE(NULLIF(v_contract.monthly_rent, 0), c.monthly_rent, 0)
  INTO v_rent_amount
  FROM public.contacts c
  WHERE c.id = p_tenant_id;

  IF v_rent_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الإيجار الشهري غير محدد في العقد أو ملف المستأجر';
  END IF;

  FOREACH v_month IN ARRAY p_months LOOP
    v_due := (v_month || '-01')::date;

    SELECT tc.id INTO v_existing
    FROM public.tenant_charges tc
    WHERE tc.contract_id = v_contract.id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_charge_id := v_existing;
    ELSE
      INSERT INTO public.tenant_charges (
        contract_id, amount, due_date, type, description, status, total_paid
      ) VALUES (
        v_contract.id,
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

  RETURN jsonb_build_object('charges', v_created);
END;
$$;

-- ── تسجيل دفع إيجار (إزالة نسخة 005 المتعارضة) ──
DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, numeric, date, uuid, text);

-- ── تسجيل دفع إيجار مع شهور + نوع الدفع ──
DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, numeric, date, uuid, text, text[]);

CREATE OR REPLACE FUNCTION public.record_rent_payment(
  tenant_id uuid,
  amount numeric,
  payment_date date DEFAULT CURRENT_DATE,
  cashbox_id uuid DEFAULT NULL,
  description text DEFAULT NULL,
  rent_months text[] DEFAULT NULL,
  payment_method text DEFAULT 'CASH'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tx_id uuid;
  effective_cashbox_id uuid;
  rent_category_id uuid;
  v_allocations jsonb := '[]'::jsonb;
  v_month text;
  v_due date;
  v_charge_id uuid;
  v_remaining numeric;
  v_apply numeric;
  v_charge_remaining numeric;
  v_desc text;
  v_method text;
BEGIN
  v_method := upper(trim(coalesce(payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'CHEQUE', 'TRANSFER', 'CARD') THEN
    v_method := 'CASH';
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

  IF rent_months IS NOT NULL AND array_length(rent_months, 1) > 0 THEN
    PERFORM public.ensure_tenant_rent_charges(tenant_id, rent_months);
    v_desc := COALESCE(description, 'تحصيل إيجار: ' || array_to_string(rent_months, '، '));
  ELSE
    v_desc := COALESCE(description, 'إيجار');
  END IF;

  INSERT INTO public.transactions (
    kind, status, method, amount, currency, tx_date, description,
    category_id, cashbox_id, contact_id, contact_type, posted_at,
    auto_allocate_charges
  ) VALUES (
    'REVENUE', 'POSTED', v_method, amount, 'LYD', payment_date, v_desc,
    rent_category_id, effective_cashbox_id, tenant_id, 'PAYER', now(),
    CASE WHEN rent_months IS NOT NULL AND array_length(rent_months, 1) > 0 THEN false ELSE true END
  )
  RETURNING id INTO new_tx_id;

  IF rent_months IS NOT NULL AND array_length(rent_months, 1) > 0 THEN
    v_remaining := amount;
    FOREACH v_month IN ARRAY rent_months LOOP
      EXIT WHEN v_remaining <= 0;
      v_due := (v_month || '-01')::date;

      SELECT tc.id, GREATEST(tc.amount - tc.total_paid, 0)
      INTO v_charge_id, v_charge_remaining
      FROM public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE lc.tenant_id = tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
      LIMIT 1;

      IF v_charge_id IS NOT NULL AND v_charge_remaining > 0 THEN
        v_apply := LEAST(v_remaining, v_charge_remaining);
        v_allocations := v_allocations || jsonb_build_array(
          jsonb_build_object('charge_id', v_charge_id, 'amount', v_apply)
        );
        v_remaining := v_remaining - v_apply;
      END IF;
    END LOOP;

    IF jsonb_array_length(v_allocations) > 0 THEN
      PERFORM public.apply_charge_allocations(new_tx_id, v_allocations);
    END IF;
  END IF;

  RETURN new_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_rent_calendar(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_tenant_rent_charges(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid, numeric, date, uuid, text, text[], text) TO authenticated;
GRANT SELECT ON public.tenant_rent_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
