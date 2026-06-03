-- ربط شهر الإيجار بقيد يومية محدد (تسوية بيانات قديمة)

DROP FUNCTION IF EXISTS public.set_tenant_rent_month_status(uuid, text[], boolean);
DROP FUNCTION IF EXISTS public.mark_tenant_rent_months_paid(uuid, text[]);

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

  IF p_paid AND p_journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'اختر قيد اليومية الذي دُفع به هذا الشهر';
  END IF;

  IF p_journal_entry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.id = p_journal_entry_id
        AND je.status IN ('POSTED', 'DRAFT')
    ) THEN
      RAISE EXCEPTION 'القيد غير موجود أو غير صالح للربط';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.journal_lines jl
      WHERE jl.journal_id = p_journal_entry_id
        AND jl.contact_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'هذا القيد لا يرتبط بهذا المستأجر في بنود اليومية';
    END IF;

    SELECT je.number, je.description
    INTO v_je_number, v_je_desc
    FROM public.journal_entries je
    WHERE je.id = p_journal_entry_id;
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

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid, text[], boolean, uuid) TO authenticated;
