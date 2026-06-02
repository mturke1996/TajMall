-- ============================================================
-- Migration 020: Audit log (owner/admin), voucher lifecycle, production
-- ============================================================

-- ── Treasury balance helper (matches cashbox_balances view logic) ──
CREATE OR REPLACE FUNCTION public.get_treasury_balance_total()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cb.balance), 0)
  FROM public.cashbox_balances cb;
$$;

CREATE OR REPLACE FUNCTION public.get_cashbox_balance(p_cashbox_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(cb.balance, 0)
  FROM public.cashbox_balances cb
  WHERE cb.id = p_cashbox_id;
$$;

-- ── Who can read the audit log ──
CREATE OR REPLACE FUNCTION public.user_has_audit_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(trim(coalesce(p.role, ''))) IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_treasury_balance_total() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashbox_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_audit_access() TO authenticated;

-- ── Audit log table ──
CREATE TABLE IF NOT EXISTS public.audit_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  actor_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name_ar           text,
  actor_role            text,
  action                text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_type           text NOT NULL,
  entity_id             uuid,
  entity_label_ar         text,
  summary_ar            text NOT NULL,
  business_date         date,
  amount_delta          numeric(18,3),
  currency              text NOT NULL DEFAULT 'LYD',
  balance_total_after   numeric(18,3),
  cashbox_id            uuid REFERENCES public.cashboxes(id) ON DELETE SET NULL,
  cashbox_balance_after numeric(18,3),
  severity              text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_business_date ON public.audit_log (business_date DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit log select privileged" ON public.audit_log;
CREATE POLICY "audit log select privileged"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.user_has_audit_access());

-- Inserts only via SECURITY DEFINER triggers (no client INSERT policy)

-- ── Core writer (called from triggers) ──
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_label_ar text,
  p_summary_ar text,
  p_business_date date DEFAULT NULL,
  p_amount_delta numeric DEFAULT NULL,
  p_cashbox_id uuid DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text := 'النظام';
  v_actor_role text;
  v_log_id uuid;
  v_balance numeric;
  v_cb_balance numeric;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    SELECT coalesce(p.full_name_ar, p.full_name, 'مستخدم'), p.role
    INTO v_actor_name, v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;

  v_balance := public.get_treasury_balance_total();

  IF p_cashbox_id IS NOT NULL THEN
    v_cb_balance := public.get_cashbox_balance(p_cashbox_id);
  END IF;

  INSERT INTO public.audit_log (
    actor_id,
    actor_name_ar,
    actor_role,
    action,
    entity_type,
    entity_id,
    entity_label_ar,
    summary_ar,
    business_date,
    amount_delta,
    cashbox_id,
    cashbox_balance_after,
    balance_total_after,
    severity,
    metadata
  ) VALUES (
    v_actor_id,
    v_actor_name,
    v_actor_role,
    p_action,
    p_entity_type,
    p_entity_id,
    p_entity_label_ar,
    p_summary_ar,
    p_business_date,
    p_amount_delta,
    p_cashbox_id,
    v_cb_balance,
    v_balance,
    p_severity,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ── Transaction audit trigger ──
CREATE OR REPLACE FUNCTION public.audit_transaction_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_action text;
  v_delta numeric;
  v_label text;
  v_summary text;
  v_severity text := 'info';
  v_meta jsonb;
  v_cat_name text;
  v_box_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_action := 'DELETE';
    v_severity := 'danger';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW;
    v_action := 'INSERT';
  ELSE
    v_row := NEW;
    v_action := 'UPDATE';
    IF OLD.status = 'POSTED' AND NEW.status IS DISTINCT FROM OLD.status THEN
      v_severity := 'warning';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND v_row.status IS DISTINCT FROM 'POSTED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM 'POSTED' AND OLD.status IS DISTINCT FROM 'POSTED' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status IS DISTINCT FROM 'POSTED' THEN
    RETURN OLD;
  END IF;

  SELECT name_ar INTO v_cat_name FROM public.categories WHERE id = v_row.category_id;
  SELECT name_ar INTO v_box_name FROM public.cashboxes WHERE id = v_row.cashbox_id;

  IF v_row.kind = 'REVENUE' THEN
    v_delta := v_row.amount;
  ELSIF v_row.kind = 'EXPENSE' THEN
    v_delta := -v_row.amount;
  ELSE
    v_delta := 0;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_delta := CASE WHEN OLD.kind = 'REVENUE' THEN -OLD.amount WHEN OLD.kind = 'EXPENSE' THEN OLD.amount ELSE 0 END;
  END IF;

  v_label := coalesce(v_row.description, v_cat_name, 'معاملة #' || v_row.number::text);

  v_summary := CASE TG_OP
    WHEN 'DELETE' THEN
      CASE v_row.kind
        WHEN 'REVENUE' THEN 'حذف إيراد: ' || v_label || ' — ' || v_row.amount::text || ' د.ل'
        WHEN 'EXPENSE' THEN 'حذف مصروف: ' || v_label || ' — ' || v_row.amount::text || ' د.ل'
        ELSE 'حذف حركة مالية: ' || v_label
      END
    WHEN 'INSERT' THEN
      CASE v_row.kind
        WHEN 'REVENUE' THEN 'إيراد جديد: ' || v_label || ' — +' || v_row.amount::text || ' د.ل'
        WHEN 'EXPENSE' THEN 'مصروف جديد: ' || v_label || ' — −' || v_row.amount::text || ' د.ل'
        ELSE 'حركة مالية: ' || v_label
      END
    ELSE
      'تعديل معاملة: ' || v_label
  END;

  v_meta := jsonb_build_object(
    'kind', v_row.kind,
    'status', v_row.status,
    'method', v_row.method,
    'amount', v_row.amount,
    'tx_date', v_row.tx_date,
    'category', v_cat_name,
    'cashbox', v_box_name,
    'number', v_row.number,
    'reference', v_row.reference
  );

  IF TG_OP = 'UPDATE' THEN
    v_meta := v_meta || jsonb_build_object(
      'previous', jsonb_build_object(
        'amount', OLD.amount,
        'tx_date', OLD.tx_date,
        'status', OLD.status,
        'description', OLD.description
      )
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_meta := v_meta || jsonb_build_object('deleted_record', row_to_json(OLD));
  END IF;

  PERFORM public.write_audit_log(
    v_action,
    'transaction',
    v_row.id,
    v_label,
    v_summary,
    v_row.tx_date,
    v_delta,
    v_row.cashbox_id,
    v_severity,
    v_meta
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

-- Runs after trg_process_transaction_posting (name sort: zz last)
DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
DROP TRIGGER IF EXISTS trg_zz_audit_transactions ON public.transactions;
CREATE TRIGGER trg_zz_audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_transaction_changes();

-- ── Cashbox audit ──
CREATE OR REPLACE FUNCTION public.audit_cashbox_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_action text;
  v_summary text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_action := 'DELETE';
    v_summary := 'حذف خزينة: ' || OLD.name_ar || ' (' || OLD.code || ')';
    PERFORM public.write_audit_log(
      v_action, 'cashbox', OLD.id, OLD.name_ar, v_summary,
      CURRENT_DATE, NULL, OLD.id, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  v_row := NEW;
  v_action := TG_OP;
  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'إضافة خزينة: ' || NEW.name_ar
    ELSE 'تعديل خزينة: ' || NEW.name_ar
  END;

  PERFORM public.write_audit_log(
    v_action, 'cashbox', NEW.id, NEW.name_ar, v_summary,
    CURRENT_DATE, NULL, NEW.id,
    CASE TG_OP WHEN 'INSERT' THEN 'success' ELSE 'info' END,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('previous', row_to_json(OLD)) ELSE '{}'::jsonb END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_cashboxes ON public.cashboxes;
CREATE TRIGGER trg_audit_cashboxes
  AFTER INSERT OR UPDATE OR DELETE ON public.cashboxes
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_cashbox_changes();

-- ── Journal entry audit (posted entries only) ──
CREATE OR REPLACE FUNCTION public.audit_journal_entry_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_summary text;
  v_delta numeric := 0;
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

  IF NEW.status IS DISTINCT FROM 'POSTED' THEN
    RETURN NEW;
  END IF;

  v_label := coalesce(NEW.reference, 'قيد #' || NEW.number::text);
  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'ترحيل قيد يومية: ' || v_label
    ELSE 'تعديل قيد يومية: ' || v_label
  END;

  PERFORM public.write_audit_log(
    TG_OP, 'journal_entry', NEW.id, v_label, v_summary,
    NEW.entry_date, v_delta, NULL,
    CASE TG_OP WHEN 'INSERT' THEN 'success' ELSE 'warning' END,
    '{}'::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_journal_entries ON public.journal_entries;
CREATE TRIGGER trg_audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_journal_entry_changes();

-- ── Tenant charge audit ──
CREATE OR REPLACE FUNCTION public.audit_tenant_charge_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name text;
BEGIN
  SELECT c.name INTO v_tenant_name
  FROM public.lease_contracts lc
  JOIN public.contacts c ON c.id = lc.tenant_id
  WHERE lc.id = coalesce(NEW.contract_id, OLD.contract_id);

  IF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit_log(
      'DELETE', 'tenant_charge', OLD.id, OLD.description,
      'حذف مطالبة: ' || OLD.description || ' — ' || OLD.amount::text || ' د.ل',
      OLD.due_date, -OLD.amount, NULL, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD), 'tenant', v_tenant_name)
    );
    RETURN OLD;
  END IF;

  PERFORM public.write_audit_log(
    TG_OP, 'tenant_charge', NEW.id, NEW.description,
    CASE TG_OP
      WHEN 'INSERT' THEN 'مطالبة جديدة: ' || NEW.description || ' — ' || NEW.amount::text || ' د.ل'
      ELSE 'تعديل مطالبة: ' || NEW.description
    END,
    NEW.due_date,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.amount ELSE 0 END,
    NULL, 'info',
    jsonb_build_object('type', NEW.type, 'status', NEW.status, 'tenant', v_tenant_name)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_charges ON public.tenant_charges;
CREATE TRIGGER trg_audit_tenant_charges
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_tenant_charge_changes();

-- ── Disbursement voucher: full lifecycle (fix INSERT-only gap) ──
CREATE OR REPLACE FUNCTION public.process_disbursement_voucher_posting()
RETURNS TRIGGER AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_exp_cat_id uuid;
  v_desc text;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    PERFORM public.reverse_ledger_entry('VOUCHER', OLD.id, OLD.created_by);
  END IF;

  IF TG_OP = 'DELETE' THEN
  PERFORM public.write_audit_log(
      'DELETE', 'disbursement_voucher', OLD.id,
      'إذن صرف #' || OLD.voucher_number,
      'حذف إذن صرف #' || OLD.voucher_number || ' — ' || OLD.total_amount::text || ' د.ل',
      OLD.voucher_date, OLD.total_amount, OLD.cashbox_id, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  v_exp_cat_id := COALESCE(
    NEW.category_id,
    (SELECT id FROM public.categories WHERE type = 'EXPENSE' AND active = true ORDER BY sort_order LIMIT 1)
  );

  IF v_cash_cat_id IS NULL OR v_exp_cat_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_desc := 'إذن صرف #' || NEW.voucher_number || ' — ' || NEW.payee;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_exp_cat_id,
    'debit', NEW.total_amount,
    'credit', 0,
    'description', v_desc
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_cash_cat_id,
    'debit', 0,
    'credit', NEW.total_amount,
    'description', v_desc,
    'cashbox_id', NEW.cashbox_id
  );

  PERFORM public.post_to_ledger(
    'VOUCHER',
    NEW.id,
    NEW.voucher_date,
    v_desc,
    NEW.notes,
    NEW.created_by,
    v_lines
  );

  PERFORM public.write_audit_log(
    'INSERT', 'disbursement_voucher', NEW.id,
    'إذن #' || NEW.voucher_number,
    'إذن صرف جديد #' || NEW.voucher_number || ' — ' || NEW.payee || ' — −' || NEW.total_amount::text || ' د.ل',
    NEW.voucher_date, -NEW.total_amount, NEW.cashbox_id, 'warning',
    jsonb_build_object('payee', NEW.payee, 'amount', NEW.total_amount)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_disbursement_voucher_posting ON public.disbursement_vouchers;
CREATE TRIGGER trg_process_disbursement_voucher_posting
  AFTER INSERT OR UPDATE OR DELETE ON public.disbursement_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.process_disbursement_voucher_posting();

-- ── RPC: paginated audit feed for UI ──
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
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) al;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log_feed(int, int, text, date, date) TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

NOTIFY pgrst, 'reload schema';
