-- ============================================================
-- Migration 064: تقويم الإيجار يعرض سعر الجدول الحالي
-- (وليس مبلغ مطالبة/تحصيل قديم بعد تغيير الأسعار)
-- ============================================================

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
  v_display_amount numeric;
  v_display_paid numeric;
  v_desc text;
  v_resolved numeric;
BEGIN
  SELECT c.monthly_rent INTO v_monthly
  FROM public.contacts c
  WHERE c.id = p_tenant_id AND c.kind = 'TENANT';

  SELECT lc.id INTO v_contract_id
  FROM public.lease_contracts lc
  WHERE lc.tenant_id = p_tenant_id AND lc.status = 'ACTIVE'
  ORDER BY lc.start_date DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    SELECT lc.id INTO v_contract_id
    FROM public.lease_contracts lc
    WHERE lc.tenant_id = p_tenant_id
    ORDER BY lc.start_date DESC
    LIMIT 1;
  END IF;

  FOR v_m IN 1..12 LOOP
    v_month_key := p_year::text || '-' || LPAD(v_m::text, 2, '0');
    v_due := (v_month_key || '-01')::date;
    v_resolved := public.resolve_tenant_rent_amount(p_tenant_id, v_month_key);

    v_charge_id := NULL;
    v_desc := NULL;
    v_charge_status := NULL;
    v_amount := NULL;
    v_paid := NULL;
    v_display_amount := NULL;
    v_display_paid := NULL;

    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month_key) THEN
      v_status := 'exempt';
      v_display_amount := 0;
      v_display_paid := 0;
      v_charge_id := NULL;
    ELSE
      SELECT tc.id, tc.status, tc.amount, tc.total_paid, tc.description
      INTO v_charge_id, v_charge_status, v_amount, v_paid, v_desc
      FROM public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
      ORDER BY
        CASE
          WHEN tc.status = 'PAID' OR tc.total_paid >= tc.amount THEN 0
          WHEN tc.total_paid > 0 OR tc.status = 'PARTIAL' THEN 1
          ELSE 2
        END,
        tc.total_paid DESC
      LIMIT 1;

      -- مبلغ العرض = سعر الجدول الحالي أولاً
      v_display_amount := COALESCE(
        NULLIF(v_resolved, 0),
        NULLIF(v_amount, 0),
        0
      );

      IF v_charge_id IS NOT NULL THEN
        IF v_charge_status = 'PAID' OR v_paid >= v_amount THEN
          v_status := 'paid';
          -- شهر مدفوع: اعرض المدفوع بمبلغ السعر الحالي حتى لا يبقى الرقم القديم
          v_display_paid := v_display_amount;
        ELSIF v_paid > 0 OR v_charge_status = 'PARTIAL' THEN
          v_status := 'partial';
          v_display_paid := COALESCE(v_paid, 0);
        ELSE
          v_status := 'unpaid';
          v_display_paid := 0;
        END IF;
      ELSIF v_resolved > 0 AND v_contract_id IS NOT NULL THEN
        v_status := 'no_charge';
        v_display_amount := v_resolved;
        v_display_paid := 0;
        v_charge_id := NULL;
      ELSE
        v_status := 'na';
        v_display_amount := 0;
        v_display_paid := 0;
        v_charge_id := NULL;
      END IF;
    END IF;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'month', v_month_key,
        'status', v_status,
        'amount', COALESCE(v_display_amount, 0),
        'paid', COALESCE(v_display_paid, 0),
        'charge_id', v_charge_id,
        'description', v_desc,
        'scheduled_amount', v_resolved,
        'charge_amount', COALESCE(v_amount, 0)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'year', p_year,
    'tenant_id', p_tenant_id,
    'monthly_rent', COALESCE(v_monthly, 0),
    'contract_id', v_contract_id,
    'claim_start', public.tenant_rent_claim_start(p_tenant_id),
    'months', v_result
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
