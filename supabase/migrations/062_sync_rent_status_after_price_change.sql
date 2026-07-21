-- ============================================================
-- Migration 062: بعد تغيير جدول أسعار الإيجار
-- إعادة تقييم حالة الشهور: إن كان المدفوع ≥ السعر الجديد → مدفوع
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
  v_new_status text;
  v_desc text;
  v_amount_changed int := 0;
  v_marked_paid int := 0;
  v_marked_partial int := 0;
  v_marked_unpaid int := 0;
  v_touched int := 0;
  v_had_links boolean;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant required');
  END IF;

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

    v_new := public.resolve_tenant_rent_amount(p_tenant_id, r.month_key);
    IF v_new IS NULL OR v_new <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(trjl.amount), 0)
    INTO v_link_paid
    FROM public.tenant_rent_journal_links trjl
    INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
    WHERE trjl.charge_id = r.id
      AND je.status IN ('POSTED', 'DRAFT');

    v_had_links := v_link_paid > 0;
    IF v_had_links THEN
      v_effective_paid := v_link_paid;
    ELSE
      v_effective_paid := COALESCE(r.total_paid, 0);
    END IF;

    -- إذا المدفوع يغطي السعر الجديد → مدفوع
    IF v_effective_paid >= v_new THEN
      v_new_status := 'PAID';
      v_stored_paid := v_new;
      v_desc := 'إيجار شهر ' || r.month_key;
    ELSIF v_effective_paid > 0 THEN
      v_new_status := 'PARTIAL';
      v_stored_paid := v_effective_paid;
      v_desc := 'إيجار شهر ' || r.month_key
        || ' · جزئي ' || trim(to_char(v_effective_paid, '999999999990.999'))
        || '/' || trim(to_char(v_new, '999999999990.999'));
    ELSE
      v_new_status := 'UNPAID';
      v_stored_paid := 0;
      v_desc := 'إيجار شهر ' || r.month_key;
    END IF;

    IF r.amount IS DISTINCT FROM v_new
       OR r.status IS DISTINCT FROM v_new_status
       OR COALESCE(r.total_paid, 0) IS DISTINCT FROM v_stored_paid THEN

      PERFORM set_config('fluxen.skip_charge_posting', '1', true);

      UPDATE public.tenant_charges
      SET
        amount = v_new,
        total_paid = v_stored_paid,
        status = v_new_status,
        description = v_desc,
        updated_at = now()
      WHERE id = r.id;

      PERFORM set_config('fluxen.skip_charge_posting', '0', true);

      v_touched := v_touched + 1;
      IF r.amount IS DISTINCT FROM v_new THEN
        v_amount_changed := v_amount_changed + 1;
      END IF;
      IF v_new_status = 'PAID' AND r.status IS DISTINCT FROM 'PAID' THEN
        v_marked_paid := v_marked_paid + 1;
      ELSIF v_new_status = 'PAID' AND r.status = 'PAID' AND r.amount IS DISTINCT FROM v_new THEN
        -- بقي مدفوعاً بعد مطابقة السعر الجديد
        v_marked_paid := v_marked_paid + 1;
      ELSIF v_new_status = 'PARTIAL' AND r.status IS DISTINCT FROM 'PARTIAL' THEN
        v_marked_partial := v_marked_partial + 1;
      ELSIF v_new_status = 'UNPAID' AND r.status IS DISTINCT FROM 'UNPAID' THEN
        v_marked_unpaid := v_marked_unpaid + 1;
      END IF;
    END IF;

    -- إن وُجدت روابط قيود: أعد الحساب الرسمي من الروابط (بعد تحديث المبلغ)
    IF v_had_links AND to_regprocedure('public.recalc_tenant_charge_rent_paid(uuid)') IS NOT NULL THEN
      PERFORM public.recalc_tenant_charge_rent_paid(r.id);
      -- بعد recalc: إن كان مجموع الروابط ≥ السعر الجديد فالحالة مدفوع
      -- (recalc يستخدم LEAST(links, amount) فيعتبرها مدفوعة)
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'touched', v_touched,
    'amount_changed', v_amount_changed,
    'marked_paid', v_marked_paid,
    'marked_partial', v_marked_partial,
    'marked_unpaid', v_marked_unpaid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_rent_charges_to_schedule(uuid) TO authenticated;

-- توافق خلفي مع الاسم القديم
CREATE OR REPLACE FUNCTION public.sync_unpaid_rent_charges_to_schedule(
  p_tenant_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.sync_rent_charges_to_schedule(p_tenant_id);
  RETURN COALESCE((v_result->>'touched')::int, 0);
END;
$$;

-- حدّث حفظ الجدول ليعيد تفاصيل المزامنة
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

NOTIFY pgrst, 'reload schema';
