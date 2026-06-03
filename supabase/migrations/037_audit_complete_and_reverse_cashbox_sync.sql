-- سجل الرقابة: تسجيل عكس القيود وجهات التعامل والعقود
-- عكس القيد المرتبط بمعاملة: حذف المعاملة لتحديث رصيد الخزينة (المصدر الحقيقي للنقد)

-- ── قيد يومية: تسجيل الترحيل والعكس ──
CREATE OR REPLACE FUNCTION public.audit_journal_entry_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_summary text;
  v_meta jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'POSTED' THEN
      v_label := coalesce(OLD.reference, 'قيد #' || OLD.number::text);
      PERFORM public.write_audit_log(
        'DELETE', 'journal_entry', OLD.id, v_label,
        'حذف قيد يومية: ' || v_label,
        OLD.entry_date, NULL, NULL, 'danger',
        jsonb_build_object('deleted_record', row_to_json(OLD))
      );
    END IF;
    RETURN OLD;
  END IF;

  v_label := coalesce(NEW.reference, 'قيد #' || NEW.number::text);

  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' AND NEW.status = 'REVERSED' THEN
    PERFORM public.write_audit_log(
      'UPDATE', 'journal_entry', NEW.id, v_label,
      'عكس قيد يومية: ' || v_label || ' — أُلغي الترحيل',
      NEW.entry_date, NULL, NULL, 'warning',
      jsonb_build_object(
        'previous_status', OLD.status,
        'source_type', NEW.source_type,
        'source_id', NEW.source_id
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'POSTED' THEN
    RETURN NEW;
  END IF;

  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'ترحيل قيد يومية: ' || v_label
    ELSE 'تعديل قيد يومية: ' || v_label
  END;

  v_meta := jsonb_build_object(
    'status', NEW.status,
    'source_type', NEW.source_type,
    'source_id', NEW.source_id
  );

  IF TG_OP = 'UPDATE' THEN
    v_meta := v_meta || jsonb_build_object(
      'previous', jsonb_build_object(
        'description', OLD.description,
        'entry_date', OLD.entry_date,
        'status', OLD.status
      )
    );
  END IF;

  PERFORM public.write_audit_log(
    TG_OP, 'journal_entry', NEW.id, v_label, v_summary,
    NEW.entry_date, NULL, NULL,
    CASE TG_OP WHEN 'INSERT' THEN 'success' ELSE 'info' END,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- ── جهات التعامل ──
CREATE OR REPLACE FUNCTION public.audit_contact_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_action text;
  v_label text;
  v_summary text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_action := 'DELETE';
    v_label := OLD.name;
    v_summary := 'حذف جهة: ' || OLD.name;
    PERFORM public.write_audit_log(
      v_action, 'contact', OLD.id, v_label, v_summary,
      CURRENT_DATE, NULL, NULL, 'danger',
      jsonb_build_object('kind', OLD.kind, 'deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  v_row := NEW;
  v_action := TG_OP;
  v_label := NEW.name;
  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'جهة جديدة: ' || NEW.name || ' (' || NEW.kind || ')'
    ELSE 'تعديل جهة: ' || NEW.name
  END;

  PERFORM public.write_audit_log(
    v_action, 'contact', NEW.id, v_label, v_summary,
    CURRENT_DATE, NULL, NULL,
    CASE TG_OP WHEN 'INSERT' THEN 'success' ELSE 'info' END,
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('kind', NEW.kind, 'previous', row_to_json(OLD))
      ELSE jsonb_build_object('kind', NEW.kind)
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_contacts ON public.contacts;
CREATE TRIGGER trg_audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_contact_changes();

-- ── عقود الإيجار ──
CREATE OR REPLACE FUNCTION public.audit_lease_contract_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name text;
  v_unit text;
  v_label text;
  v_summary text;
BEGIN
  SELECT c.name, u.unit_number
  INTO v_tenant_name, v_unit
  FROM public.contacts c
  LEFT JOIN public.mall_units u ON u.id = coalesce(NEW.unit_id, OLD.unit_id)
  WHERE c.id = coalesce(NEW.tenant_id, OLD.tenant_id);

  IF TG_OP = 'DELETE' THEN
    v_label := coalesce(v_tenant_name, 'عقد') || ' — محل ' || coalesce(v_unit, '؟');
    PERFORM public.write_audit_log(
      'DELETE', 'lease_contract', OLD.id, v_label,
      'حذف عقد إيجار: ' || v_label,
      OLD.start_date, NULL, NULL, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  v_label := coalesce(v_tenant_name, 'مستأجر') || ' — محل ' || coalesce(v_unit, '؟');
  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'عقد إيجار جديد: ' || v_label
    ELSE 'تعديل عقد إيجار: ' || v_label
  END;

  PERFORM public.write_audit_log(
    TG_OP, 'lease_contract', NEW.id, v_label, v_summary,
    NEW.start_date,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.monthly_rent ELSE NULL END,
    NULL,
    CASE TG_OP WHEN 'INSERT' THEN 'success' ELSE 'info' END,
    jsonb_build_object(
      'tenant', v_tenant_name,
      'unit', v_unit,
      'status', NEW.status,
      'monthly_rent', NEW.monthly_rent
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_lease_contracts ON public.lease_contracts;
CREATE TRIGGER trg_audit_lease_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.lease_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_lease_contract_changes();

-- ── عكس القيد: إن كان من معاملة مالية، احذف المعاملة لتحديث الخزينة ──
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original record;
  new_journal_id uuid;
  v_reversal_id uuid;
BEGIN
  SELECT * INTO original
  FROM public.journal_entries
  WHERE id = p_journal_id::uuid AND status = 'POSTED';

  IF original IS NULL THEN
    RAISE EXCEPTION 'Posted journal entry not found';
  END IF;

  -- معاملة مالية = مصدر رصيد الخزينة؛ حذفها يعكس القيد ويحدّث الرصيد تلقائياً
  IF original.source_type = 'TRANSACTION' AND original.source_id IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE id = original.source_id AND status = 'POSTED';

    IF FOUND THEN
      -- عكس المعاملة يُحدّث القيد عبر reverse_ledger_entry؛ نضمن إزالة روابط الإيجار
      PERFORM public.purge_rent_links_for_journal(original.id);

      SELECT je.id INTO v_reversal_id
      FROM public.journal_entries je
      WHERE je.reversal_of_entry_id = original.id
        AND je.status = 'POSTED'
      ORDER BY je.created_at DESC
      LIMIT 1;

      IF v_reversal_id IS NULL THEN
        SELECT id INTO v_reversal_id
        FROM public.journal_entries
        WHERE id = original.id AND status = 'REVERSED';
      END IF;

      RETURN COALESCE(v_reversal_id::text, original.id::text);
    END IF;
  END IF;

  PERFORM public.purge_rent_links_for_journal(original.id);

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = p_journal_id::uuid;

  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    COALESCE(original.reference, '') || ' (Reversal)',
    CURRENT_DATE,
    'Reversal of entry #' || original.number || ': ' || COALESCE(original.description, ''),
    'Auto-generated reversal',
    'POSTED'
  )
  RETURNING id INTO new_journal_id;

  INSERT INTO public.journal_lines (
    journal_id,
    category_id,
    debit,
    credit,
    description,
    sort_order,
    contact_id,
    cashbox_id
  )
  SELECT
    new_journal_id,
    category_id,
    credit AS debit,
    debit AS credit,
    'Reversal: ' || COALESCE(description, ''),
    sort_order,
    contact_id,
    cashbox_id
  FROM public.journal_lines
  WHERE journal_id = p_journal_id::uuid;

  UPDATE public.journal_entries
  SET posted_at = now()
  WHERE id = new_journal_id;

  RETURN new_journal_id::text;
END;
$$;

-- ── تغذية السجل: حد أعلى وبحث أوسع ──
CREATE OR REPLACE FUNCTION public.get_audit_log_feed(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_entity_type text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF NOT public.user_has_audit_access() THEN
    RAISE EXCEPTION 'لا توجد صلاحية لعرض سجل الرقابة';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.audit_log al
  WHERE (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_from_date IS NULL OR coalesce(al.business_date, al.created_at::date) >= p_from_date)
    AND (p_to_date IS NULL OR coalesce(al.business_date, al.created_at::date) <= p_to_date);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', al.id,
      'created_at', al.created_at,
      'actor_name_ar', al.actor_name_ar,
      'actor_role', al.actor_role,
      'action', al.action,
      'entity_type', al.entity_type,
      'entity_id', al.entity_id,
      'entity_label_ar', al.entity_label_ar,
      'summary_ar', al.summary_ar,
      'business_date', al.business_date,
      'amount_delta', al.amount_delta,
      'currency', al.currency,
      'balance_total_after', al.balance_total_after,
      'cashbox_balance_after', al.cashbox_balance_after,
      'severity', al.severity,
      'metadata', al.metadata
    ) ORDER BY al.created_at DESC, al.id DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM public.audit_log al
    WHERE (p_entity_type IS NULL OR al.entity_type = p_entity_type)
      AND (p_from_date IS NULL OR coalesce(al.business_date, al.created_at::date) >= p_from_date)
      AND (p_to_date IS NULL OR coalesce(al.business_date, al.created_at::date) <= p_to_date)
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) al;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
