-- ============================================================
-- Migration 065: تقوية مزامنة أسعار الإيجار
-- 1) صلاحية كتابة على دوال التعديل
-- 2) لا تزييف مدفوع عند رفع السعر — تجميد المطالبة المسدّدة
-- 3) مزامنة نطاقات الجدول فقط (أو غير المدفوعة عند إزالة الجدول)
-- 4) احتساب السداد من قيود POSTED فقط
-- 5) عرض التقويم = مبلغ المطالبة الفعلي + scheduled_amount منفصل
-- 6) عدم إنشاء مطالبة بمبلغ 1 عند انعدام السعر
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_rent_charges_to_schedule(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_new numeric;
  v_link_paid numeric;
  v_effective_paid numeric;
  v_stored_paid numeric;
  v_apply_amount numeric;
  v_new_status text;
  v_desc text;
  v_amount_changed int := 0;
  v_marked_paid int := 0;
  v_marked_partial int := 0;
  v_marked_unpaid int := 0;
  v_frozen int := 0;
  v_touched int := 0;
  v_had_posted_links boolean;
  v_was_settled boolean;
  v_has_bands boolean;
  v_in_band boolean;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant required');
  END IF;

  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_rent_price_bands b
    WHERE b.tenant_id = p_tenant_id
  ) INTO v_has_bands;

  FOR r IN
    SELECT
      tc.id,
      tc.amount,
      tc.total_paid,
      tc.status,
      tc.due_date,
      to_char(tc.due_date, 'YYYY-MM') AS month_key
    FROM public.tenant_charges tc
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = p_tenant_id
      AND tc.type = 'RENT'
  LOOP
    IF public.is_tenant_rent_month_exempt(p_tenant_id, r.month_key) THEN
      CONTINUE;
    END IF;

    -- نطاق المزامنة: داخل الجدول فقط؛ عند غياب الجدول → غير المدفوعة فقط
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_rent_price_bands b
      WHERE b.tenant_id = p_tenant_id
        AND r.month_key >= b.from_month
        AND r.month_key <= b.to_month
    ) INTO v_in_band;

    IF v_has_bands AND NOT v_in_band THEN
      CONTINUE;
    END IF;

    IF NOT v_has_bands AND r.status = 'PAID' THEN
      CONTINUE;
    END IF;

    v_new := public.resolve_tenant_rent_amount(p_tenant_id, r.month_key);
    IF v_new IS NULL OR v_new <= 0 THEN
      CONTINUE;
    END IF;

    -- السداد الحقيقي من قيود مرحلة فقط
    SELECT COALESCE(SUM(trjl.amount), 0)
    INTO v_link_paid
    FROM public.tenant_rent_journal_links trjl
    INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
    WHERE trjl.charge_id = r.id
      AND je.status = 'POSTED';

    v_had_posted_links := v_link_paid > 0;
    IF v_had_posted_links THEN
      v_effective_paid := v_link_paid;
    ELSE
      v_effective_paid := GREATEST(COALESCE(r.total_paid, 0), 0);
    END IF;

    v_was_settled := (
      r.status = 'PAID'
      OR (
        COALESCE(r.amount, 0) > 0
        AND v_effective_paid >= COALESCE(r.amount, 0)
      )
    );

    -- رفع السعر بعد تسوية كاملة → جمّد المطالبة (لا تزييف نقد ولا إعادة فتح)
    IF v_was_settled AND v_new > COALESCE(r.amount, 0) THEN
      v_frozen := v_frozen + 1;
      CONTINUE;
    END IF;

    v_apply_amount := v_new;

    IF v_effective_paid >= v_apply_amount THEN
      v_new_status := 'PAID';
      -- لا نخترع مدفوعاً فوق التحصيل الفعلي
      v_stored_paid := LEAST(v_effective_paid, v_apply_amount);
      v_desc := 'إيجار شهر ' || r.month_key;
    ELSIF v_effective_paid > 0 THEN
      v_new_status := 'PARTIAL';
      v_stored_paid := v_effective_paid;
      v_desc := 'إيجار شهر ' || r.month_key
        || ' · جزئي ' || trim(to_char(v_effective_paid, '999999999990.999'))
        || '/' || trim(to_char(v_apply_amount, '999999999990.999'));
    ELSE
      v_new_status := 'UNPAID';
      v_stored_paid := 0;
      v_desc := 'إيجار شهر ' || r.month_key;
    END IF;

    IF r.amount IS DISTINCT FROM v_apply_amount
       OR r.status IS DISTINCT FROM v_new_status
       OR COALESCE(r.total_paid, 0) IS DISTINCT FROM v_stored_paid THEN

      PERFORM set_config('fluxen.skip_charge_posting', '1', true);

      UPDATE public.tenant_charges
      SET
        amount = v_apply_amount,
        total_paid = v_stored_paid,
        status = v_new_status,
        description = v_desc,
        updated_at = now()
      WHERE id = r.id;

      PERFORM set_config('fluxen.skip_charge_posting', '0', true);

      v_touched := v_touched + 1;
      IF r.amount IS DISTINCT FROM v_apply_amount THEN
        v_amount_changed := v_amount_changed + 1;
      END IF;
      IF v_new_status = 'PAID' AND r.status IS DISTINCT FROM 'PAID' THEN
        v_marked_paid := v_marked_paid + 1;
      ELSIF v_new_status = 'PAID' AND r.status = 'PAID' AND r.amount IS DISTINCT FROM v_apply_amount THEN
        v_marked_paid := v_marked_paid + 1;
      ELSIF v_new_status = 'PARTIAL' AND r.status IS DISTINCT FROM 'PARTIAL' THEN
        v_marked_partial := v_marked_partial + 1;
      ELSIF v_new_status = 'UNPAID' AND r.status IS DISTINCT FROM 'UNPAID' THEN
        v_marked_unpaid := v_marked_unpaid + 1;
      END IF;
    END IF;

    -- أعد الحساب من الروابط المرحلة فقط بعد تحديث المبلغ
    IF v_had_posted_links
       AND to_regprocedure('public.recalc_tenant_charge_rent_paid(uuid)') IS NOT NULL THEN
      PERFORM public.recalc_tenant_charge_rent_paid(r.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'touched', v_touched,
    'amount_changed', v_amount_changed,
    'marked_paid', v_marked_paid,
    'marked_partial', v_marked_partial,
    'marked_unpaid', v_marked_unpaid,
    'frozen_settled', v_frozen
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_rent_charges_to_schedule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_tenant_rent_price_bands(
  p_tenant_id uuid,
  p_bands jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_band jsonb;
  v_from text;
  v_to text;
  v_amount numeric;
  v_notes text;
  v_sorted jsonb;
  v_prev_to text := NULL;
  v_i int;
  v_sync jsonb;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'معرّف المستأجر مطلوب';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_tenant_id AND c.kind = 'TENANT'
  ) THEN
    RAISE EXCEPTION 'المستأجر غير موجود';
  END IF;

  IF p_bands IS NULL THEN
    p_bands := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_bands) <> 'array' THEN
    RAISE EXCEPTION 'صيغة الجدول غير صحيحة';
  END IF;

  SELECT COALESCE(jsonb_agg(elem ORDER BY elem->>'from_month'), '[]'::jsonb)
  INTO v_sorted
  FROM jsonb_array_elements(p_bands) elem;

  FOR v_i IN 0 .. GREATEST(jsonb_array_length(v_sorted) - 1, -1) LOOP
    v_band := v_sorted -> v_i;
    v_from := NULLIF(trim(v_band->>'from_month'), '');
    v_to := NULLIF(trim(COALESCE(v_band->>'to_month', v_band->>'from_month')), '');
    v_amount := NULLIF(v_band->>'amount', '')::numeric;

    IF v_from IS NULL OR v_from !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'شهر البداية غير صالح: %', v_from;
    END IF;
    IF v_to IS NULL OR v_to !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'شهر النهاية غير صالح: %', v_to;
    END IF;
    IF v_from > v_to THEN
      RAISE EXCEPTION 'شهر البداية بعد النهاية: % → %', v_from, v_to;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
    END IF;
    IF v_prev_to IS NOT NULL AND v_from <= v_prev_to THEN
      RAISE EXCEPTION 'تداخل في الشهور بين النطاقات (% ≤ %)', v_from, v_prev_to;
    END IF;
    v_prev_to := v_to;
  END LOOP;

  DELETE FROM public.tenant_rent_price_bands WHERE tenant_id = p_tenant_id;

  FOR v_i IN 0 .. GREATEST(jsonb_array_length(v_sorted) - 1, -1) LOOP
    v_band := v_sorted -> v_i;
    v_from := trim(v_band->>'from_month');
    v_to := trim(COALESCE(v_band->>'to_month', v_band->>'from_month'));
    v_amount := (v_band->>'amount')::numeric;
    v_notes := NULLIF(trim(v_band->>'notes'), '');

    INSERT INTO public.tenant_rent_price_bands (
      tenant_id, from_month, to_month, amount, notes, created_by
    ) VALUES (
      p_tenant_id, v_from, v_to, v_amount, v_notes, auth.uid()
    );
  END LOOP;

  v_sync := public.sync_rent_charges_to_schedule(p_tenant_id);

  RETURN jsonb_build_object(
    'ok', true,
    'bands_count', jsonb_array_length(v_sorted),
    'unpaid_charges_updated', COALESCE((v_sync->>'amount_changed')::int, 0),
    'sync', v_sync,
    'bands', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'from_month', b.from_month,
        'to_month', b.to_month,
        'amount', b.amount,
        'notes', b.notes
      ) ORDER BY b.from_month), '[]'::jsonb)
      FROM public.tenant_rent_price_bands b
      WHERE b.tenant_id = p_tenant_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_price_bands(uuid, jsonb) TO authenticated;

-- تقويم: مبلغ المطالبة الفعلي للعرض؛ scheduled_amount = سعر الجدول
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

      IF v_charge_id IS NOT NULL THEN
        -- العرض = المطالبة الفعلية (قد تكون مجمّدة بعد رفع الجدول)
        v_display_amount := COALESCE(v_amount, 0);
        v_display_paid := LEAST(GREATEST(COALESCE(v_paid, 0), 0), COALESCE(v_amount, 0));

        IF v_charge_status = 'PAID' OR COALESCE(v_paid, 0) >= COALESCE(v_amount, 0) THEN
          v_status := 'paid';
        ELSIF COALESCE(v_paid, 0) > 0 OR v_charge_status = 'PARTIAL' THEN
          v_status := 'partial';
        ELSE
          v_status := 'unpaid';
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

-- لا تنشئ مطالبة بمبلغ وهمي = 1
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
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  v_contract_id := public.ensure_tenant_lease_contract(p_tenant_id);

  FOREACH v_month IN ARRAY p_months LOOP
    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month) THEN
      CONTINUE;
    END IF;

    v_due := (v_month || '-01')::date;
    v_rent_amount := public.resolve_tenant_rent_amount(p_tenant_id, v_month);
    IF v_rent_amount IS NULL OR v_rent_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT tc.id INTO v_existing
    FROM public.tenant_charges tc
    WHERE tc.contract_id = v_contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_charge_id := v_existing;
      UPDATE public.tenant_charges
      SET amount = v_rent_amount,
          description = 'إيجار شهر ' || v_month
      WHERE id = v_existing
        AND status = 'UNPAID'
        AND COALESCE(total_paid, 0) = 0
        AND amount IS DISTINCT FROM v_rent_amount;
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
      jsonb_build_object(
        'month', v_month,
        'charge_id', v_charge_id,
        'amount', v_rent_amount
      )
    );
  END LOOP;

  RETURN jsonb_build_object('charges', v_created, 'contract_id', v_contract_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
