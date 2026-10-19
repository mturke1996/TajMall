-- ROLLBACK for 087 — restores ensure_tenant_rent_charges, sync_rent_charges_to_schedule and generate_monthly_charges
-- as production has them today (repository migrations 022–075, unchanged by 078–082). No data is touched; charges and
-- accruals that 087 corrected stay corrected.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_rent_charges_to_schedule(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ensure_tenant_rent_charges(p_tenant_id uuid, p_months text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_monthly_charges(p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_due date;
  v_rent_before int;
  v_rent_after int;
  v_rent int := 0;
  v_svc int := 0;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'صيغة شهر غير صالحة';
  END IF;

  v_due := (p_month || '-01')::date;

  FOR r IN
    SELECT lc.id AS contract_id, lc.tenant_id, lc.services_amount
    FROM public.lease_contracts lc
    WHERE lc.status = 'ACTIVE'
  LOOP
    SELECT COUNT(*)::int INTO v_rent_before
    FROM public.tenant_charges tc
    WHERE tc.contract_id = r.contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due;

    PERFORM public.ensure_tenant_rent_charges(r.tenant_id, ARRAY[p_month]);

    SELECT COUNT(*)::int INTO v_rent_after
    FROM public.tenant_charges tc
    WHERE tc.contract_id = r.contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due;

    IF v_rent_before = 0 AND v_rent_after > 0 THEN
      v_rent := v_rent + 1;
    END IF;

    IF COALESCE(r.services_amount, 0) > 0 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_charges tc
        WHERE tc.contract_id = r.contract_id
          AND tc.type = 'SERVICE'
          AND tc.due_date = v_due
      ) THEN
        INSERT INTO public.tenant_charges (
          contract_id, amount, due_date, type, description, status, total_paid
        ) VALUES (
          r.contract_id,
          r.services_amount,
          v_due,
          'SERVICE',
          'رسوم خدمات وصيانة شهر ' || p_month,
          'UNPAID',
          0
        );
        v_svc := v_svc + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'month', p_month,
    'rent_created', v_rent,
    'service_created', v_svc,
    'created', v_rent + v_svc
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
