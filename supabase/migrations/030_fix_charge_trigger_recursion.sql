-- إصلاح: stack depth limit exceeded عند ربط شهر الإيجار بقيد
-- السبب: محفّز process_tenant_charge_posting يعيد UPDATE على نفس الصف فيحلّق لا نهائياً

CREATE OR REPLACE FUNCTION public.process_tenant_charge_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_rec_cat_id uuid;
  v_rev_cat_id uuid;
  v_tenant_id uuid;
  v_journal_id uuid;
BEGIN
  IF current_setting('fluxen.skip_charge_posting', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;

  IF NEW.type = 'SERVICE' THEN
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;
  ELSE
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.lease_contracts
  WHERE id = NEW.contract_id;

  -- تسوية يدوية: شهر مدفوع + ربط بقيد دفع موجود (تقويم الإيجار)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'PAID'
      AND NEW.journal_entry_id IS NOT NULL
      AND OLD.amount IS NOT DISTINCT FROM NEW.amount
      AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date
      AND OLD.contract_id IS NOT DISTINCT FROM NEW.contract_id
    THEN
      RETURN NEW;
    END IF;

    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    RETURN OLD;
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rec_cat_id,
    'debit', NEW.amount,
    'credit', 0,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rev_cat_id,
    'debit', 0,
    'credit', NEW.amount,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_journal_id := public.post_to_ledger(
    'CHARGE',
    NEW.id,
    NEW.due_date,
    NEW.description,
    NULL,
    NULL,
    v_lines
  );

  IF NEW.journal_entry_id IS DISTINCT FROM v_journal_id THEN
    PERFORM set_config('fluxen.skip_charge_posting', '1', true);
    UPDATE public.tenant_charges
    SET journal_entry_id = v_journal_id
    WHERE id = NEW.id;
    PERFORM set_config('fluxen.skip_charge_posting', '0', true);
  END IF;

  RETURN NEW;
END;
$$;

-- تحديث ربط الشهر: تعطيل المحفّز أثناء التحديث اليدوي
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

  IF p_journal_entry_id IS NOT NULL THEN
    SELECT je.number, je.description
    INTO v_je_number, v_je_desc
    FROM public.journal_entries je
    WHERE je.id = p_journal_entry_id
      AND je.status IN ('POSTED', 'DRAFT');

    IF v_je_number IS NULL THEN
      RAISE EXCEPTION 'القيد غير موجود أو غير صالح للربط';
    END IF;
  ELSIF p_paid THEN
    RAISE EXCEPTION 'اختر قيد اليومية الذي دُفع به هذا الشهر';
  END IF;

  BEGIN
    PERFORM set_config('fluxen.skip_charge_posting', '1', true);

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

    PERFORM set_config('fluxen.skip_charge_posting', '0', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
      RAISE;
  END;

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

NOTIFY pgrst, 'reload schema';
