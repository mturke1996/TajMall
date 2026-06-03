-- إذا كان رقم المحل مربوطاً بعقد نشط لمستأجر آخر، ننشئ وحدة تقويم مخصصة لهذا المستأجر

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
  v_dedicated_unit text;
  v_start date;
  v_end date;
  v_unit_busy boolean;
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

  v_start := date_trunc('year', CURRENT_DATE)::date;
  v_end := (v_start + interval '10 years')::date;
  v_dedicated_unit := 'تقويم-' || left(replace(p_tenant_id::text, '-', ''), 12);

  IF v_shop IS NOT NULL THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    WHERE mu.unit_number = v_shop
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    WHERE mu.unit_number = v_dedicated_unit
    LIMIT 1;
  END IF;

  IF v_unit_id IS NULL THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.lease_contracts lc
      WHERE lc.unit_id = mu.id
        AND lc.status = 'ACTIVE'
        AND lc.tenant_id IS DISTINCT FROM p_tenant_id
        AND lc.start_date <= v_end
        AND lc.end_date >= v_start
    )
    ORDER BY
      CASE mu.status WHEN 'AVAILABLE' THEN 0 WHEN 'OCCUPIED' THEN 1 ELSE 2 END,
      mu.unit_number
    LIMIT 1;
  END IF;

  IF v_unit_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.lease_contracts lc
      WHERE lc.unit_id = v_unit_id
        AND lc.status = 'ACTIVE'
        AND lc.tenant_id IS DISTINCT FROM p_tenant_id
        AND lc.start_date <= v_end
        AND lc.end_date >= v_start
    ) INTO v_unit_busy;
  ELSE
    v_unit_busy := false;
  END IF;

  IF v_unit_id IS NULL OR v_unit_busy THEN
    SELECT mu.id INTO v_unit_id
    FROM public.mall_units mu
    WHERE mu.unit_number = v_dedicated_unit
    LIMIT 1;

    IF v_unit_id IS NULL THEN
      INSERT INTO public.mall_units (unit_number, floor, area_sqm, status, notes)
      VALUES (
        v_dedicated_unit,
        COALESCE(v_floor, '—'),
        0,
        'OCCUPIED',
        'وحدة تقويم إيجار — ' || COALESCE(v_shop, 'بدون رقم محل')
      )
      RETURNING id INTO v_unit_id;
    ELSE
      UPDATE public.mall_units SET status = 'OCCUPIED' WHERE id = v_unit_id;
    END IF;
  ELSE
    UPDATE public.mall_units SET status = 'OCCUPIED' WHERE id = v_unit_id;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.ensure_tenant_lease_contract(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
