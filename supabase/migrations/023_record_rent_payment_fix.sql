-- ============================================================
-- Migration 023: إصلاح record_rent_payment + عقد احتياطي للمطالبات
-- شغّل بعد 022 (أو إذا فشل 022 جزئياً)
-- ============================================================

-- إزالة التعارض بين نسخة 005 و 022
DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, numeric, date, uuid, text);
DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, numeric, date, uuid, text, text[]);

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
    RAISE EXCEPTION 'لا يوجد عقد إيجار لهذا المستأجر — أنشئ عقداً أو ولّد المطالبات يدوياً';
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

GRANT EXECUTE ON FUNCTION public.ensure_tenant_rent_charges(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid, numeric, date, uuid, text, text[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
