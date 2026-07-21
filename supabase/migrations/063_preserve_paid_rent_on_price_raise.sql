-- ============================================================
-- Migration 063: عند تغيير سعر الإيجار
-- 1) لا نُنقِص المدفوع المسجّل (كان يُقصّ إلى السعر الجديد فيُفقد السداد)
-- 2) شهر سُدِّد بالكامل على السعر القديم لا يُعاد فتحه كـ«جزئي» عند رفع السعر
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
  v_was_settled boolean;
  v_preserve_paid boolean;
  v_skip_recalc boolean;
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
    -- لا تتجاهل المدفوع المخزّن ولا تقصه؛ خذ الأعلى بين الروابط والمخزّن
    v_effective_paid := GREATEST(COALESCE(r.total_paid, 0), v_link_paid);

    -- كان مسدداً بالكامل على مبلغ المطالبة الحالي/السابق
    v_was_settled := (
      r.status = 'PAID'
      OR (
        COALESCE(r.amount, 0) > 0
        AND v_effective_paid >= COALESCE(r.amount, 0)
      )
    );

    -- رفع السعر بعد سداد كامل → أبقِه مدفوعاً (لا تُعد فتح الشهر)
    v_preserve_paid := (
      v_was_settled
      AND v_new > COALESCE(r.amount, 0)
    );

    v_skip_recalc := false;

    IF v_preserve_paid OR v_effective_paid >= v_new THEN
      v_new_status := 'PAID';
      -- لا نُنقص المدفوع تحت ما سُجّل فعلاً؛ وعند الحفاظ بعد الرفع نغطي المبلغ الجديد
      v_stored_paid := GREATEST(v_effective_paid, v_new);
      v_desc := 'إيجار شهر ' || r.month_key;
      IF v_preserve_paid THEN
        v_skip_recalc := true;
      END IF;
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
        v_marked_paid := v_marked_paid + 1;
      ELSIF v_new_status = 'PARTIAL' AND r.status IS DISTINCT FROM 'PARTIAL' THEN
        v_marked_partial := v_marked_partial + 1;
      ELSIF v_new_status = 'UNPAID' AND r.status IS DISTINCT FROM 'UNPAID' THEN
        v_marked_unpaid := v_marked_unpaid + 1;
      END IF;
    END IF;

    -- recalc يقصّ المدفوع إلى LEAST(روابط, مبلغ) فيُفسد حالة «مدفوع بعد رفع السعر»
    IF v_had_links
       AND NOT v_skip_recalc
       AND to_regprocedure('public.recalc_tenant_charge_rent_paid(uuid)') IS NOT NULL THEN
      PERFORM public.recalc_tenant_charge_rent_paid(r.id);

      -- بعد recalc: إن غطّت الروابط السعر الجديد تأكد من مدفوع
      IF v_link_paid >= v_new THEN
        PERFORM set_config('fluxen.skip_charge_posting', '1', true);
        UPDATE public.tenant_charges
        SET
          total_paid = GREATEST(COALESCE(total_paid, 0), v_new),
          status = 'PAID',
          description = 'إيجار شهر ' || r.month_key,
          updated_at = now()
        WHERE id = r.id
          AND (status IS DISTINCT FROM 'PAID' OR amount IS DISTINCT FROM v_new);
        PERFORM set_config('fluxen.skip_charge_posting', '0', true);
      END IF;
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

NOTIFY pgrst, 'reload schema';
