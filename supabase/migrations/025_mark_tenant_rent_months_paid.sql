-- تحديد شهر/شهور إيجار كمدفوعة يدوياً (تسوية بيانات قديمة دون معاملة جديدة)

CREATE OR REPLACE FUNCTION public.mark_tenant_rent_months_paid(
  p_tenant_id uuid,
  p_months text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_due date;
  v_updated int := 0;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_months IS NULL OR cardinality(p_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهراً واحداً على الأقل';
  END IF;

  PERFORM public.ensure_tenant_rent_charges(p_tenant_id, p_months);

  FOREACH v_month IN ARRAY p_months LOOP
    IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'صيغة شهر غير صالحة: %', v_month;
    END IF;

    v_due := (v_month || '-01')::date;

    UPDATE public.tenant_charges tc
    SET
      status = 'PAID',
      total_paid = tc.amount,
      description = CASE
        WHEN tc.description LIKE '%[مسدّد يدوياً]%' THEN tc.description
        ELSE COALESCE(NULLIF(btrim(tc.description), ''), 'إيجار شهر ' || v_month)
          || ' [مسدّد يدوياً]'
      END,
      updated_at = now()
    FROM public.lease_contracts lc
    WHERE tc.contract_id = lc.id
      AND lc.tenant_id = p_tenant_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'months', to_jsonb(p_months),
    'updated_count', v_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_tenant_rent_months_paid(uuid, text[]) TO authenticated;
