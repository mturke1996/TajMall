-- ============================================================================
-- 080 (PROPOSED — NOT APPLIED) — employees payroll: salary history, bonuses, deductions,
-- absence, advances with instalments, monthly payroll run, payments, full history.
-- Requires 078. Validated on the isolated replica: node scripts/test-payroll-scenarios.mjs
--
-- Accounting:
--   payroll run   Dr EXP-SAL (salary+allowances+overtime−absence) + Dr EXP-BON (bonuses)
--                 Cr LIA-SAL (net) + Cr AST-ADV (advance instalments) + Cr REV-OTH (penalties)
--   salary paid   Dr LIA-SAL / Cr cashbox        (a POSTED transaction, so every cash report sees it)
--   advance paid  Dr AST-ADV / Cr cashbox        (a POSTED transaction)
-- Accounts are resolved through account_mappings so they can be re-pointed without code changes.
-- Every write goes through a SECURITY DEFINER function with a role check; tables have no write
-- policies. Salary breakdowns are visible to owner/admin/accountant only; cashiers see each line's
-- net, paid and outstanding (to pay it) through payroll_run_lines_status; viewers see nothing.
-- ============================================================================
BEGIN;

-- ── Accounts ────────────────────────────────────────────────────────────────
INSERT INTO public.categories (code, name, name_ar, kind, type, sort_order, active)
VALUES
  ('LIA-SAL', 'Salaries payable', 'رواتب مستحقة الدفع', 'ADJUSTMENT', 'LIABILITY', 920, true),
  ('AST-ADV', 'Employee advances', 'سلف الموظفين', 'ADJUSTMENT', 'ASSET', 921, true),
  ('EXP-BON', 'Bonuses and incentives', 'م.مكافآت وحوافز', 'EXPENSE', 'EXPENSE', 922, true)
ON CONFLICT (code) DO NOTHING;

-- The mapping table whitelists its source types; add the payroll ones (existing values unchanged).
ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_source_type_check;
ALTER TABLE public.account_mappings ADD CONSTRAINT account_mappings_source_type_check CHECK (source_type = ANY (ARRAY[
  'RENT_REVENUE', 'SERVICE_REVENUE', 'DEPOSIT_LIABILITY', 'EXPENSE_CASH_ASSET', 'REVENUE_CASH_ASSET',
  'PAYROLL_SALARY_EXPENSE', 'PAYROLL_BONUS_EXPENSE', 'PAYROLL_PAYABLE', 'PAYROLL_ADVANCES', 'PAYROLL_PENALTY_INCOME']));

INSERT INTO public.account_mappings (source_type, category_id, description)
SELECT m.source_type, c.id, m.description
FROM (VALUES
  ('PAYROLL_SALARY_EXPENSE', 'EXP-SAL', 'مصروف الرواتب الأساسية والبدلات'),
  ('PAYROLL_BONUS_EXPENSE', 'EXP-BON', 'مصروف المكافآت والحوافز'),
  ('PAYROLL_PAYABLE', 'LIA-SAL', 'رواتب مستحقة الدفع'),
  ('PAYROLL_ADVANCES', 'AST-ADV', 'سلف الموظفين'),
  ('PAYROLL_PENALTY_INCOME', 'REV-OTH', 'جزاءات وخصومات الموظفين')
) AS m(source_type, code, description)
JOIN public.categories c ON c.code = m.code
WHERE NOT EXISTS (SELECT 1 FROM public.account_mappings a WHERE a.source_type = m.source_type);

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  base_salary numeric(14,3) NOT NULL CHECK (base_salary >= 0),
  housing_allowance numeric(14,3) NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0),
  transport_allowance numeric(14,3) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  other_allowance numeric(14,3) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL UNIQUE CHECK (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'POSTED')),
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  period_month text NOT NULL CHECK (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text NOT NULL CHECK (kind IN ('BONUS', 'OVERTIME', 'ABSENCE', 'PENALTY', 'OTHER_DEDUCTION')),
  amount numeric(14,3) NOT NULL CHECK (amount > 0),
  days numeric(6,2) CHECK (days IS NULL OR days > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'CANCELLED')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_adjustments_month_idx ON public.payroll_adjustments (period_month, employee_id);

CREATE TABLE IF NOT EXISTS public.payroll_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  issued_on date NOT NULL,
  amount numeric(14,3) NOT NULL CHECK (amount > 0),
  installments integer NOT NULL CHECK (installments BETWEEN 1 AND 60),
  installment_amount numeric(14,3) NOT NULL CHECK (installment_amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  cashbox_id uuid NOT NULL REFERENCES public.cashboxes(id) ON DELETE RESTRICT,
  -- The cash transaction cannot be deleted on its own; cancel the advance instead.
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'CANCELLED')),
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  structure_id uuid REFERENCES public.payroll_salary_structures(id) ON DELETE SET NULL,
  base_salary numeric(14,3) NOT NULL DEFAULT 0,
  allowances numeric(14,3) NOT NULL DEFAULT 0,
  bonuses numeric(14,3) NOT NULL DEFAULT 0,
  overtime numeric(14,3) NOT NULL DEFAULT 0,
  absence_deduction numeric(14,3) NOT NULL DEFAULT 0,
  penalties numeric(14,3) NOT NULL DEFAULT 0,
  other_deductions numeric(14,3) NOT NULL DEFAULT 0,
  advance_repayment numeric(14,3) NOT NULL DEFAULT 0,
  advance_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The approved adjustments this line counted; posting links exactly these to the run.
  adjustment_ids uuid[] NOT NULL DEFAULT '{}',
  gross numeric(14,3) GENERATED ALWAYS AS (base_salary + allowances + bonuses + overtime - absence_deduction) STORED,
  net numeric(14,3) GENERATED ALWAYS AS (
    base_salary + allowances + bonuses + overtime - absence_deduction - penalties - other_deductions - advance_repayment
  ) STORED,
  UNIQUE (run_id, employee_id),
  CHECK (absence_deduction <= base_salary + allowances + overtime),
  CHECK (base_salary + allowances + bonuses + overtime - absence_deduction - penalties - other_deductions - advance_repayment >= 0)
);

CREATE TABLE IF NOT EXISTS public.payroll_advance_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.payroll_advances(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  amount numeric(14,3) NOT NULL CHECK (amount > 0),
  UNIQUE (advance_id, run_id)
);

CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_line_id uuid NOT NULL REFERENCES public.payroll_run_lines(id) ON DELETE RESTRICT,
  -- Deleting the cash transaction removes the payment, so "paid" can never drift from the books.
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(14,3) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  cashbox_id uuid NOT NULL REFERENCES public.cashboxes(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Helpers (not callable through the API) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_require(p_level text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF p_level = 'approve' AND public.get_my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'غير مصرح: الاعتماد يتطلب المالك أو المدير' USING ERRCODE = '42501';
  ELSIF p_level = 'manage' AND NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: الرواتب تتطلب محاسباً أو مديراً' USING ERRCODE = '42501';
  ELSIF p_level = 'write' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_account(p_source text, p_fallback_code text)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    (SELECT category_id FROM public.account_mappings WHERE source_type = p_source LIMIT 1),
    (SELECT id FROM public.categories WHERE code = p_fallback_code LIMIT 1));
$function$;

CREATE OR REPLACE FUNCTION public.payroll_employee_name(p_employee_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_name text;
BEGIN
  SELECT name INTO v_name FROM public.contacts WHERE id = p_employee_id AND kind = 'EMPLOYEE';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'الموظف غير موجود أو ليس من نوع موظف' USING ERRCODE = '23503';
  END IF;
  RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_month_end(p_month text)
 RETURNS date LANGUAGE sql IMMUTABLE
AS $function$ SELECT ((p_month || '-01')::date + interval '1 month - 1 day')::date $function$;

CREATE OR REPLACE FUNCTION public.payroll_month_posted(p_month text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$ SELECT EXISTS (SELECT 1 FROM public.payroll_runs WHERE period_month = p_month AND status = 'POSTED') $function$;

CREATE OR REPLACE FUNCTION public.payroll_assert_month(p_month text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'صيغة الشهر غير صحيحة (YYYY-MM)';
  END IF;
  IF public.payroll_month_posted(p_month) THEN
    RAISE EXCEPTION 'رواتب شهر % مُرحَّلة — لا تعديل عليها. اعكس الترحيل أولاً أو سجّل في الشهر التالي.', p_month
      USING ERRCODE = '55000';
  END IF;
END;
$function$;

-- ── Salary structure (history) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_set_salary(
  p_employee_id uuid, p_effective_from date, p_base numeric,
  p_housing numeric DEFAULT 0, p_transport numeric DEFAULT 0, p_other numeric DEFAULT 0, p_notes text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_name text;
  v_prev public.payroll_salary_structures%ROWTYPE;
  v_id uuid;
  v_effective date := date_trunc('month', p_effective_from)::date;
BEGIN
  PERFORM public.payroll_require('manage');
  v_name := public.payroll_employee_name(p_employee_id);
  IF p_effective_from IS NULL OR p_base IS NULL OR p_base < 0
     OR COALESCE(p_housing, 0) < 0 OR COALESCE(p_transport, 0) < 0 OR COALESCE(p_other, 0) < 0 THEN
    RAISE EXCEPTION 'بيانات الراتب غير صحيحة';
  END IF;
  -- A posted month for this employee is final: raises start from the following month.
  IF EXISTS (
    SELECT 1 FROM public.payroll_runs r JOIN public.payroll_run_lines l ON l.run_id = r.id
    WHERE r.status = 'POSTED' AND l.employee_id = p_employee_id
      AND public.payroll_month_end(r.period_month) >= v_effective
  ) THEN
    RAISE EXCEPTION 'يوجد شهر رواتب مُرحَّل لهذا الموظف بعد %، ابدأ التعديل من الشهر التالي لآخر شهر مُرحَّل', v_effective
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_prev FROM public.payroll_salary_structures
  WHERE employee_id = p_employee_id ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO public.payroll_salary_structures
    (employee_id, effective_from, base_salary, housing_allowance, transport_allowance, other_allowance, notes, created_by)
  VALUES (p_employee_id, v_effective, p_base, COALESCE(p_housing, 0), COALESCE(p_transport, 0), COALESCE(p_other, 0),
          NULLIF(btrim(p_notes), ''), auth.uid())
  ON CONFLICT (employee_id, effective_from) DO UPDATE SET
    base_salary = EXCLUDED.base_salary, housing_allowance = EXCLUDED.housing_allowance,
    transport_allowance = EXCLUDED.transport_allowance, other_allowance = EXCLUDED.other_allowance,
    notes = EXCLUDED.notes, created_by = EXCLUDED.created_by, created_at = now()
  RETURNING id INTO v_id;

  -- Keep the contact card's salary (shown in the employees directory) equal to the latest structure.
  UPDATE public.contacts c
  SET salary = s.base_salary + s.housing_allowance + s.transport_allowance + s.other_allowance
  FROM (SELECT * FROM public.payroll_salary_structures WHERE employee_id = p_employee_id
        ORDER BY effective_from DESC LIMIT 1) s
  WHERE c.id = p_employee_id AND c.salary IS DISTINCT FROM s.base_salary + s.housing_allowance + s.transport_allowance + s.other_allowance;

  PERFORM public.write_audit_log(
    'UPDATE', 'employee', p_employee_id, v_name,
    format('هيكل الراتب اعتباراً من %s: أساسي %s، سكن %s، نقل %s، أخرى %s', v_effective, p_base,
           COALESCE(p_housing, 0), COALESCE(p_transport, 0), COALESCE(p_other, 0)),
    v_effective, NULL, NULL, 'info',
    jsonb_build_object('event', 'salary_structure', 'before', to_jsonb(v_prev), 'structure_id', v_id));
  RETURN v_id;
END;
$function$;

-- ── Bonuses, deductions, absence (draft → approved) ─────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_add_adjustment(
  p_employee_id uuid, p_month text, p_kind text, p_amount numeric, p_reason text, p_days numeric DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_name text; v_id uuid;
BEGIN
  PERFORM public.payroll_require('manage');
  v_name := public.payroll_employee_name(p_employee_id);
  PERFORM public.payroll_assert_month(p_month);
  IF p_kind NOT IN ('BONUS', 'OVERTIME', 'ABSENCE', 'PENALTY', 'OTHER_DEDUCTION') THEN
    RAISE EXCEPTION 'نوع الحركة غير معروف: %', p_kind;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'اكتب سبب الحركة'; END IF;

  INSERT INTO public.payroll_adjustments (employee_id, period_month, kind, amount, days, reason, created_by)
  VALUES (p_employee_id, p_month, p_kind, round(p_amount, 3), p_days, btrim(p_reason), auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    'INSERT', 'employee', p_employee_id, v_name,
    format('%s لشهر %s بمبلغ %s — %s (بانتظار الاعتماد)',
      CASE p_kind WHEN 'BONUS' THEN 'مكافأة' WHEN 'OVERTIME' THEN 'عمل إضافي' WHEN 'ABSENCE' THEN 'خصم غياب'
                  WHEN 'PENALTY' THEN 'جزاء' ELSE 'خصم آخر' END, p_month, p_amount, btrim(p_reason)),
    public.payroll_month_end(p_month), NULL, NULL, 'info',
    jsonb_build_object('event', 'adjustment_created', 'adjustment_id', v_id, 'kind', p_kind, 'days', p_days));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_decide_adjustment(p_adjustment_id uuid, p_approve boolean, p_note text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_adj public.payroll_adjustments%ROWTYPE;
BEGIN
  PERFORM public.payroll_require('approve');
  SELECT * INTO v_adj FROM public.payroll_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحركة غير موجودة'; END IF;
  IF v_adj.run_id IS NOT NULL THEN RAISE EXCEPTION 'الحركة دخلت كشف رواتب مُرحَّلاً ولا تُعدَّل'; END IF;
  IF v_adj.status = 'CANCELLED' THEN RAISE EXCEPTION 'الحركة ملغاة'; END IF;
  IF p_approve AND v_adj.status = 'APPROVED' THEN RAISE EXCEPTION 'الحركة معتمدة مسبقاً'; END IF;
  PERFORM public.payroll_assert_month(v_adj.period_month);

  UPDATE public.payroll_adjustments
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'CANCELLED' END,
      decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(p_note), '')
  WHERE id = p_adjustment_id;

  PERFORM public.write_audit_log(
    'UPDATE', 'employee', v_adj.employee_id, public.payroll_employee_name(v_adj.employee_id),
    format('%s حركة %s لشهر %s بمبلغ %s', CASE WHEN p_approve THEN 'اعتماد' ELSE 'إلغاء' END,
           v_adj.kind, v_adj.period_month, v_adj.amount),
    public.payroll_month_end(v_adj.period_month), NULL, NULL, CASE WHEN p_approve THEN 'success' ELSE 'warning' END,
    jsonb_build_object('event', 'adjustment_decided', 'adjustment_id', p_adjustment_id, 'approved', p_approve, 'note', p_note));
END;
$function$;

-- ── Advances ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_issue_advance(
  p_employee_id uuid, p_amount numeric, p_installments integer, p_cashbox_id uuid, p_issued_on date, p_reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_name text; v_tx uuid; v_id uuid;
BEGIN
  PERFORM public.payroll_require('manage');
  v_name := public.payroll_employee_name(p_employee_id);
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ السلفة يجب أن يكون أكبر من صفر'; END IF;
  IF p_installments IS NULL OR p_installments < 1 OR p_installments > 60 THEN RAISE EXCEPTION 'عدد الأقساط بين 1 و60'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'اكتب سبب السلفة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cashboxes WHERE id = p_cashbox_id AND active) THEN
    RAISE EXCEPTION 'اختر خزينة فعّالة';
  END IF;

  INSERT INTO public.transactions (kind, status, method, amount, currency, tx_date, description, category_id,
                                   cashbox_id, contact_id, contact_type, created_by, posted_at, auto_allocate_charges)
  VALUES ('EXPENSE', 'POSTED', 'CASH', round(p_amount, 3), 'LYD', COALESCE(p_issued_on, CURRENT_DATE),
          'سلفة موظف — ' || v_name, public.payroll_account('PAYROLL_ADVANCES', 'AST-ADV'),
          p_cashbox_id, p_employee_id, 'BENEFICIARY', auth.uid(), now(), false)
  RETURNING id INTO v_tx;

  INSERT INTO public.payroll_advances (employee_id, issued_on, amount, installments, installment_amount, reason,
                                       cashbox_id, transaction_id, created_by)
  VALUES (p_employee_id, COALESCE(p_issued_on, CURRENT_DATE), round(p_amount, 3), p_installments,
          round(p_amount / p_installments, 3), btrim(p_reason), p_cashbox_id, v_tx, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    'INSERT', 'employee', p_employee_id, v_name,
    format('سلفة %s على %s أقساط — %s', p_amount, p_installments, btrim(p_reason)),
    COALESCE(p_issued_on, CURRENT_DATE), -p_amount, p_cashbox_id, 'warning',
    jsonb_build_object('event', 'advance_issued', 'advance_id', v_id, 'transaction_id', v_tx));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_cancel_advance(p_advance_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_adv public.payroll_advances%ROWTYPE; v_tx uuid;
BEGIN
  PERFORM public.payroll_require('approve');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'اكتب سبب الإلغاء'; END IF;
  SELECT * INTO v_adv FROM public.payroll_advances WHERE id = p_advance_id FOR UPDATE;
  IF NOT FOUND OR v_adv.status <> 'OPEN' THEN RAISE EXCEPTION 'السلفة غير موجودة أو ليست مفتوحة'; END IF;
  IF EXISTS (SELECT 1 FROM public.payroll_advance_repayments WHERE advance_id = p_advance_id) THEN
    RAISE EXCEPTION 'خُصمت أقساط من هذه السلفة في كشوف مُرحَّلة — لا تُلغى';
  END IF;
  v_tx := v_adv.transaction_id;
  UPDATE public.payroll_advances SET status = 'CANCELLED', cancel_reason = btrim(p_reason), transaction_id = NULL
  WHERE id = p_advance_id;
  -- Removing the cash transaction reverses its journal and restores the cashbox balance.
  DELETE FROM public.transactions WHERE id = v_tx;
  PERFORM public.write_audit_log('UPDATE', 'employee', v_adv.employee_id, public.payroll_employee_name(v_adv.employee_id),
    format('إلغاء سلفة %s — %s', v_adv.amount, btrim(p_reason)), CURRENT_DATE, v_adv.amount, v_adv.cashbox_id, 'warning',
    jsonb_build_object('event', 'advance_cancelled', 'advance_id', p_advance_id, 'transaction_id', v_tx));
END;
$function$;

-- ── Monthly payroll run ─────────────────────────────────────────────────────
-- One computation, used to prepare a run and again before approving and posting it: a run is
-- approved and posted only while its stored lines still equal what the data says now. Any change
-- after preparing (an adjustment approved or cancelled, an advance issued or cancelled, a salary
-- change, an earlier month posted that repaid an advance) makes the run stale until it is prepared again.
CREATE OR REPLACE FUNCTION public.payroll_compute_run(p_month text)
 RETURNS TABLE (employee_id uuid, structure_id uuid, base_salary numeric, allowances numeric, bonuses numeric,
                overtime numeric, absence_deduction numeric, penalties numeric, other_deductions numeric,
                advance_repayment numeric, advance_plan jsonb, adjustment_ids uuid[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_end date := public.payroll_month_end(p_month);
  e record;
  a record;
  v_bonus numeric; v_overtime numeric; v_absence numeric; v_penalty numeric; v_other numeric; v_ids uuid[];
  v_available numeric; v_take numeric; v_repay numeric; v_plan jsonb;
BEGIN
  FOR e IN
    SELECT c.id AS emp_id, s.id AS struct_id, s.base_salary AS base,
           s.housing_allowance + s.transport_allowance + s.other_allowance AS allow
    FROM public.contacts c
    JOIN LATERAL (
      SELECT * FROM public.payroll_salary_structures ss
      WHERE ss.employee_id = c.id AND ss.effective_from <= v_end
      ORDER BY ss.effective_from DESC LIMIT 1
    ) s ON true
    WHERE c.kind = 'EMPLOYEE' AND c.is_active AND (c.hire_date IS NULL OR c.hire_date <= v_end)
    ORDER BY c.name, c.id
  LOOP
    SELECT COALESCE(sum(pa.amount) FILTER (WHERE pa.kind = 'BONUS'), 0),
           COALESCE(sum(pa.amount) FILTER (WHERE pa.kind = 'OVERTIME'), 0),
           COALESCE(sum(pa.amount) FILTER (WHERE pa.kind = 'ABSENCE'), 0),
           COALESCE(sum(pa.amount) FILTER (WHERE pa.kind = 'PENALTY'), 0),
           COALESCE(sum(pa.amount) FILTER (WHERE pa.kind = 'OTHER_DEDUCTION'), 0),
           COALESCE(array_agg(pa.id ORDER BY pa.id), '{}')
    INTO v_bonus, v_overtime, v_absence, v_penalty, v_other, v_ids
    FROM public.payroll_adjustments pa
    WHERE pa.employee_id = e.emp_id AND pa.period_month = p_month AND pa.status = 'APPROVED' AND pa.run_id IS NULL;

    IF v_absence > e.base + e.allow + v_overtime THEN
      RAISE EXCEPTION 'خصم الغياب (%) أكبر من راتب الموظف % لشهر %', v_absence,
        public.payroll_employee_name(e.emp_id), p_month;
    END IF;
    v_available := e.base + e.allow + v_bonus + v_overtime - v_absence - v_penalty - v_other;
    IF v_available < 0 THEN
      RAISE EXCEPTION 'الخصومات أكبر من مستحقات الموظف % لشهر %', public.payroll_employee_name(e.emp_id), p_month;
    END IF;

    -- Advance instalments, oldest first, never pushing the net below zero. Only posted runs count
    -- as repaid. When what is left is within rounding of one instalment, the instalment takes it
    -- all (100 over 3 → 33.333, 33.333, 33.334) so no tiny extra instalment follows.
    v_repay := 0;
    v_plan := '[]'::jsonb;
    FOR a IN
      SELECT pv.id, pv.installment_amount,
             pv.amount - COALESCE((SELECT sum(r.amount) FROM public.payroll_advance_repayments r WHERE r.advance_id = pv.id), 0) AS remaining
      FROM public.payroll_advances pv
      WHERE pv.employee_id = e.emp_id AND pv.status = 'OPEN' AND pv.issued_on <= v_end
      ORDER BY pv.issued_on, pv.created_at, pv.id
    LOOP
      v_take := CASE WHEN a.remaining - a.installment_amount < 0.05 THEN a.remaining ELSE a.installment_amount END;
      v_take := LEAST(v_take, v_available - v_repay);
      IF v_take > 0 THEN
        v_repay := v_repay + v_take;
        v_plan := v_plan || jsonb_build_object('advance_id', a.id, 'amount', v_take);
      END IF;
    END LOOP;

    employee_id := e.emp_id; structure_id := e.struct_id; base_salary := e.base; allowances := e.allow;
    bonuses := v_bonus; overtime := v_overtime; absence_deduction := v_absence; penalties := v_penalty;
    other_deductions := v_other; advance_repayment := v_repay; advance_plan := v_plan; adjustment_ids := v_ids;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- Number of employees whose stored line no longer matches the data (0 = the run is current).
CREATE OR REPLACE FUNCTION public.payroll_run_differences(p_run_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_month text; v_count integer;
BEGIN
  PERFORM public.payroll_require('manage');
  SELECT period_month INTO v_month FROM public.payroll_runs WHERE id = p_run_id;
  IF v_month IS NULL THEN RAISE EXCEPTION 'كشف الرواتب غير موجود'; END IF;
  SELECT count(*) INTO v_count
  FROM (SELECT * FROM public.payroll_run_lines WHERE run_id = p_run_id) s
  FULL JOIN public.payroll_compute_run(v_month) c ON c.employee_id = s.employee_id
  WHERE s.employee_id IS NULL OR c.employee_id IS NULL
     OR s.structure_id IS DISTINCT FROM c.structure_id
     OR s.base_salary <> c.base_salary OR s.allowances <> c.allowances
     OR s.bonuses <> c.bonuses OR s.overtime <> c.overtime OR s.absence_deduction <> c.absence_deduction
     OR s.penalties <> c.penalties OR s.other_deductions <> c.other_deductions
     OR s.advance_repayment <> c.advance_repayment OR s.advance_plan <> c.advance_plan
     OR s.adjustment_ids <> c.adjustment_ids;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_assert_run_current(p_run_id uuid)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_diff integer := public.payroll_run_differences(p_run_id);
BEGIN
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'تغيّرت بيانات % بعد إعداد الكشف (حركات أو سلف أو رواتب). أعد إعداد الكشف ثم اعتمده.',
      CASE WHEN v_diff = 1 THEN 'موظف واحد' ELSE v_diff || ' موظفين' END
      USING ERRCODE = '55000';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_prepare_run(p_month text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_run uuid;
  v_count int;
BEGIN
  PERFORM public.payroll_require('manage');
  PERFORM public.payroll_assert_month(p_month);

  INSERT INTO public.payroll_runs (period_month, status, prepared_by, prepared_at)
  VALUES (p_month, 'DRAFT', auth.uid(), now())
  ON CONFLICT (period_month) DO UPDATE
    SET status = 'DRAFT', prepared_by = auth.uid(), prepared_at = now(), approved_by = NULL, approved_at = NULL
  RETURNING id INTO v_run;
  DELETE FROM public.payroll_run_lines WHERE run_id = v_run;

  INSERT INTO public.payroll_run_lines (run_id, employee_id, structure_id, base_salary, allowances, bonuses, overtime,
                                        absence_deduction, penalties, other_deductions, advance_repayment, advance_plan,
                                        adjustment_ids)
  SELECT v_run, c.employee_id, c.structure_id, c.base_salary, c.allowances, c.bonuses, c.overtime,
         c.absence_deduction, c.penalties, c.other_deductions, c.advance_repayment, c.advance_plan, c.adjustment_ids
  FROM public.payroll_compute_run(p_month) c;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.write_audit_log('UPDATE', 'payroll_run', v_run, 'رواتب ' || p_month,
    format('إعداد كشف رواتب %s — %s موظف', p_month, v_count), public.payroll_month_end(p_month), NULL, NULL, 'info',
    jsonb_build_object('event', 'run_prepared', 'employees', v_count));

  RETURN (SELECT jsonb_build_object('run_id', v_run, 'month', p_month, 'employees', count(*),
            'gross', COALESCE(sum(gross), 0), 'net', COALESCE(sum(net), 0),
            'advance_repayment', COALESCE(sum(advance_repayment), 0))
          FROM public.payroll_run_lines WHERE run_id = v_run);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_approve_run(p_run_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_run public.payroll_runs%ROWTYPE;
BEGIN
  PERFORM public.payroll_require('approve');
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'كشف الرواتب غير موجود'; END IF;
  IF v_run.status <> 'DRAFT' THEN RAISE EXCEPTION 'الكشف ليس مسودة (الحالة: %)', v_run.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_run_lines WHERE run_id = p_run_id) THEN
    RAISE EXCEPTION 'الكشف فارغ — أعدّه أولاً';
  END IF;
  PERFORM public.payroll_assert_run_current(p_run_id);
  UPDATE public.payroll_runs SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now() WHERE id = p_run_id;
  PERFORM public.write_audit_log('UPDATE', 'payroll_run', p_run_id, 'رواتب ' || v_run.period_month,
    'اعتماد كشف رواتب ' || v_run.period_month, public.payroll_month_end(v_run.period_month), NULL, NULL, 'success',
    jsonb_build_object('event', 'run_approved'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_post_run(p_run_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_lines jsonb := '[]'::jsonb;
  v_desc text;
  v_journal uuid;
  v_line record;
  v_salary uuid := public.payroll_account('PAYROLL_SALARY_EXPENSE', 'EXP-SAL');
  v_bonus uuid := public.payroll_account('PAYROLL_BONUS_EXPENSE', 'EXP-BON');
  v_payable uuid := public.payroll_account('PAYROLL_PAYABLE', 'LIA-SAL');
  v_advances uuid := public.payroll_account('PAYROLL_ADVANCES', 'AST-ADV');
  v_penalty uuid := public.payroll_account('PAYROLL_PENALTY_INCOME', 'REV-OTH');
BEGIN
  PERFORM public.payroll_require('manage');
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'كشف الرواتب غير موجود'; END IF;
  IF v_run.status <> 'APPROVED' THEN RAISE EXCEPTION 'يُرحَّل الكشف بعد اعتماده فقط (الحالة: %)', v_run.status; END IF;
  PERFORM public.payroll_assert_run_current(p_run_id);
  v_desc := 'رواتب شهر ' || v_run.period_month;

  FOR v_line IN SELECT * FROM public.payroll_run_lines WHERE run_id = p_run_id ORDER BY employee_id LOOP
    v_lines := v_lines
      || jsonb_build_object('category_id', v_salary, 'debit', v_line.base_salary + v_line.allowances + v_line.overtime - v_line.absence_deduction,
                            'credit', 0, 'description', v_desc, 'contact_id', v_line.employee_id)
      || jsonb_build_object('category_id', v_bonus, 'debit', v_line.bonuses, 'credit', 0,
                            'description', 'مكافآت ' || v_desc, 'contact_id', v_line.employee_id)
      || jsonb_build_object('category_id', v_payable, 'debit', 0, 'credit', v_line.net,
                            'description', 'صافي ' || v_desc, 'contact_id', v_line.employee_id)
      || jsonb_build_object('category_id', v_advances, 'debit', 0, 'credit', v_line.advance_repayment,
                            'description', 'قسط سلفة — ' || v_desc, 'contact_id', v_line.employee_id)
      || jsonb_build_object('category_id', v_penalty, 'debit', 0, 'credit', v_line.penalties + v_line.other_deductions,
                            'description', 'جزاءات وخصومات — ' || v_desc, 'contact_id', v_line.employee_id);
  END LOOP;

  -- post_to_ledger checks balance, skips zero lines and refuses closed periods.
  v_journal := public.post_to_ledger('PAYROLL_RUN', p_run_id, public.payroll_month_end(v_run.period_month),
                                     v_desc, NULL, auth.uid(), v_lines);

  UPDATE public.payroll_adjustments a SET run_id = p_run_id
  FROM public.payroll_run_lines l
  WHERE l.run_id = p_run_id AND a.id = ANY (l.adjustment_ids);

  INSERT INTO public.payroll_advance_repayments (advance_id, run_id, amount)
  SELECT (p->>'advance_id')::uuid, p_run_id, (p->>'amount')::numeric
  FROM public.payroll_run_lines l, jsonb_array_elements(l.advance_plan) p
  WHERE l.run_id = p_run_id;

  UPDATE public.payroll_advances pa SET status = 'SETTLED'
  WHERE pa.status = 'OPEN'
    AND pa.amount <= (SELECT COALESCE(sum(r.amount), 0) FROM public.payroll_advance_repayments r WHERE r.advance_id = pa.id) + 0.0005;

  UPDATE public.payroll_runs SET status = 'POSTED', posted_by = auth.uid(), posted_at = now(), journal_entry_id = v_journal
  WHERE id = p_run_id;

  PERFORM public.write_audit_log('UPDATE', 'payroll_run', p_run_id, v_desc, 'ترحيل ' || v_desc,
    public.payroll_month_end(v_run.period_month),
    (SELECT -sum(net) FROM public.payroll_run_lines WHERE run_id = p_run_id), NULL, 'warning',
    jsonb_build_object('event', 'run_posted', 'journal_entry_id', v_journal));
  RETURN v_journal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_reverse_run(p_run_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_run public.payroll_runs%ROWTYPE;
BEGIN
  PERFORM public.payroll_require('approve');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'اكتب سبب عكس الترحيل'; END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'POSTED' THEN RAISE EXCEPTION 'الكشف غير مُرحَّل'; END IF;
  IF EXISTS (SELECT 1 FROM public.payroll_payments p JOIN public.payroll_run_lines l ON l.id = p.run_line_id
             WHERE l.run_id = p_run_id) THEN
    RAISE EXCEPTION 'صُرفت رواتب من هذا الكشف — احذف دفعات الصرف أولاً';
  END IF;

  PERFORM public.reverse_ledger_entry('PAYROLL_RUN', p_run_id, auth.uid());
  DELETE FROM public.payroll_advance_repayments WHERE run_id = p_run_id;
  UPDATE public.payroll_advances pa SET status = 'OPEN'
  WHERE pa.status = 'SETTLED'
    AND pa.amount > (SELECT COALESCE(sum(r.amount), 0) FROM public.payroll_advance_repayments r WHERE r.advance_id = pa.id) + 0.0005;
  UPDATE public.payroll_adjustments SET run_id = NULL WHERE run_id = p_run_id;
  UPDATE public.payroll_runs SET status = 'DRAFT', approved_by = NULL, approved_at = NULL, posted_by = NULL,
                                 posted_at = NULL, journal_entry_id = NULL
  WHERE id = p_run_id;

  PERFORM public.write_audit_log('UPDATE', 'payroll_run', p_run_id, 'رواتب ' || v_run.period_month,
    format('عكس ترحيل رواتب %s — %s', v_run.period_month, btrim(p_reason)),
    public.payroll_month_end(v_run.period_month), NULL, NULL, 'danger',
    jsonb_build_object('event', 'run_reversed', 'reason', p_reason));
END;
$function$;

-- ── Paying salaries ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_pay_line(
  p_line_id uuid, p_amount numeric, p_cashbox_id uuid, p_paid_on date DEFAULT CURRENT_DATE, p_method text DEFAULT 'CASH')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_line public.payroll_run_lines%ROWTYPE;
  v_run public.payroll_runs%ROWTYPE;
  v_paid numeric;
  v_name text;
  v_tx uuid;
  v_method public.payment_method;
BEGIN
  PERFORM public.payroll_require('write');
  SELECT * INTO v_line FROM public.payroll_run_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'سطر الراتب غير موجود'; END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = v_line.run_id;
  IF v_run.status <> 'POSTED' THEN RAISE EXCEPTION 'يُصرف الراتب بعد ترحيل الكشف فقط'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ الصرف يجب أن يكون أكبر من صفر'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.payroll_payments WHERE run_line_id = p_line_id;
  IF p_amount > v_line.net - v_paid + 0.0005 THEN
    RAISE EXCEPTION 'المبلغ أكبر من المتبقي للموظف (%)', trim(to_char(v_line.net - v_paid, '999999999990.999'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cashboxes WHERE id = p_cashbox_id AND active) THEN
    RAISE EXCEPTION 'اختر خزينة فعّالة';
  END IF;
  v_method := CASE WHEN upper(coalesce(p_method, 'CASH')) IN ('CASH', 'CHEQUE', 'TRANSFER', 'CARD')
                   THEN upper(p_method)::public.payment_method ELSE 'CASH'::public.payment_method END;
  v_name := public.payroll_employee_name(v_line.employee_id);

  INSERT INTO public.transactions (kind, status, method, amount, currency, tx_date, description, category_id,
                                   cashbox_id, contact_id, contact_type, created_by, posted_at, auto_allocate_charges)
  VALUES ('EXPENSE', 'POSTED', v_method, round(p_amount, 3), 'LYD', COALESCE(p_paid_on, CURRENT_DATE),
          format('صرف راتب شهر %s — %s', v_run.period_month, v_name),
          public.payroll_account('PAYROLL_PAYABLE', 'LIA-SAL'), p_cashbox_id, v_line.employee_id, 'BENEFICIARY',
          auth.uid(), now(), false)
  RETURNING id INTO v_tx;

  INSERT INTO public.payroll_payments (run_line_id, transaction_id, amount, paid_on, cashbox_id, created_by)
  VALUES (p_line_id, v_tx, round(p_amount, 3), COALESCE(p_paid_on, CURRENT_DATE), p_cashbox_id, auth.uid());
  RETURN v_tx;
END;
$function$;

-- ── Read models ─────────────────────────────────────────────────────────────
-- Cashiers pay salaries, so they need each line's net, paid and outstanding — not how the salary is
-- made up. This view runs as its owner on purpose (no security_invoker): it is the only way a cashier
-- reads run lines (the table itself is accountant-and-above), its WHERE refuses viewers and anonymous
-- callers, and the salary breakdown is NULL unless the caller may manage payroll.
CREATE OR REPLACE VIEW public.payroll_run_lines_status AS
SELECT l.id, l.run_id, l.employee_id,
       CASE WHEN m.ok THEN l.structure_id END AS structure_id,
       CASE WHEN m.ok THEN l.base_salary END AS base_salary,
       CASE WHEN m.ok THEN l.allowances END AS allowances,
       CASE WHEN m.ok THEN l.bonuses END AS bonuses,
       CASE WHEN m.ok THEN l.overtime END AS overtime,
       CASE WHEN m.ok THEN l.absence_deduction END AS absence_deduction,
       CASE WHEN m.ok THEN l.penalties END AS penalties,
       CASE WHEN m.ok THEN l.other_deductions END AS other_deductions,
       CASE WHEN m.ok THEN l.advance_repayment END AS advance_repayment,
       CASE WHEN m.ok THEN l.advance_plan END AS advance_plan,
       CASE WHEN m.ok THEN l.adjustment_ids END AS adjustment_ids,
       CASE WHEN m.ok THEN l.gross END AS gross,
       l.net, r.period_month, r.status AS run_status, c.name AS employee_name, c.job_title, c.department,
       COALESCE(p.paid, 0) AS paid, l.net - COALESCE(p.paid, 0) AS outstanding
FROM public.payroll_run_lines l
JOIN public.payroll_runs r ON r.id = l.run_id
JOIN public.contacts c ON c.id = l.employee_id
CROSS JOIN LATERAL (SELECT public.auth_may_manage_journals() AS ok) m
LEFT JOIN LATERAL (SELECT sum(amount) AS paid FROM public.payroll_payments WHERE run_line_id = l.id) p ON true
WHERE public.auth_role_may_write();

CREATE OR REPLACE VIEW public.payroll_advances_status WITH (security_invoker = true) AS
SELECT a.*, c.name AS employee_name,
       COALESCE(r.repaid, 0) AS repaid, a.amount - COALESCE(r.repaid, 0) AS remaining
FROM public.payroll_advances a
JOIN public.contacts c ON c.id = a.employee_id
LEFT JOIN LATERAL (SELECT sum(amount) AS repaid FROM public.payroll_advance_repayments WHERE advance_id = a.id) r ON true;

-- Salary paid in the last 12 months: salary payments only (not advances or other expenses).
CREATE OR REPLACE VIEW public.employee_summary AS
SELECT c.id, c.name, c.job_title, c.department, c.salary, c.hire_date, c.phone,
  COALESCE((SELECT sum(t.amount) FROM public.transactions t JOIN public.categories cat ON cat.id = t.category_id
            WHERE t.contact_id = c.id AND t.kind = 'EXPENSE' AND t.status = 'POSTED'
              AND cat.code IN ('EXP-SAL', 'EXP-SLR', 'LIA-SAL')
              AND t.tx_date >= (CURRENT_DATE - interval '1 year')), 0::numeric) AS last_12_months_salary_paid,
  (SELECT count(DISTINCT date_trunc('month', t.tx_date::timestamptz)) FROM public.transactions t
   JOIN public.categories cat ON cat.id = t.category_id
   WHERE t.contact_id = c.id AND t.kind = 'EXPENSE' AND t.status = 'POSTED'
     AND cat.code IN ('EXP-SAL', 'EXP-SLR', 'LIA-SAL')
     AND t.tx_date >= (CURRENT_DATE - interval '1 year')) AS months_with_payment
FROM public.contacts c
WHERE c.kind = 'EMPLOYEE' AND c.is_active = true;
REVOKE ALL ON public.employee_summary FROM anon;

-- ── Security ────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advance_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_structures_select ON public.payroll_salary_structures FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY payroll_adjustments_select ON public.payroll_adjustments FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY payroll_advances_select ON public.payroll_advances FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY payroll_repayments_select ON public.payroll_advance_repayments FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY payroll_runs_select ON public.payroll_runs FOR SELECT TO authenticated USING (public.auth_role_may_write());
CREATE POLICY payroll_run_lines_select ON public.payroll_run_lines FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY payroll_payments_select ON public.payroll_payments FOR SELECT TO authenticated USING (public.auth_role_may_write());

REVOKE ALL ON public.payroll_salary_structures, public.payroll_adjustments, public.payroll_advances, public.payroll_runs,
  public.payroll_run_lines, public.payroll_advance_repayments, public.payroll_payments,
  public.payroll_run_lines_status, public.payroll_advances_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payroll_salary_structures, public.payroll_adjustments, public.payroll_advances, public.payroll_runs,
  public.payroll_run_lines, public.payroll_advance_repayments, public.payroll_payments,
  public.payroll_run_lines_status, public.payroll_advances_status TO authenticated;
GRANT ALL ON public.payroll_salary_structures, public.payroll_adjustments, public.payroll_advances, public.payroll_runs,
  public.payroll_run_lines, public.payroll_advance_repayments, public.payroll_payments TO service_role;

REVOKE EXECUTE ON FUNCTION
  public.payroll_require(text), public.payroll_account(text, text), public.payroll_employee_name(uuid),
  public.payroll_month_end(text), public.payroll_month_posted(text), public.payroll_assert_month(text),
  public.payroll_compute_run(text), public.payroll_assert_run_current(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.payroll_set_salary(uuid, date, numeric, numeric, numeric, numeric, text),
  public.payroll_add_adjustment(uuid, text, text, numeric, text, numeric),
  public.payroll_decide_adjustment(uuid, boolean, text),
  public.payroll_issue_advance(uuid, numeric, integer, uuid, date, text), public.payroll_cancel_advance(uuid, text),
  public.payroll_prepare_run(text), public.payroll_approve_run(uuid), public.payroll_post_run(uuid),
  public.payroll_reverse_run(uuid, text), public.payroll_pay_line(uuid, numeric, uuid, date, text),
  public.payroll_run_differences(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.payroll_set_salary(uuid, date, numeric, numeric, numeric, numeric, text),
  public.payroll_add_adjustment(uuid, text, text, numeric, text, numeric),
  public.payroll_decide_adjustment(uuid, boolean, text),
  public.payroll_issue_advance(uuid, numeric, integer, uuid, date, text), public.payroll_cancel_advance(uuid, text),
  public.payroll_prepare_run(text), public.payroll_approve_run(uuid), public.payroll_post_run(uuid),
  public.payroll_reverse_run(uuid, text), public.payroll_pay_line(uuid, numeric, uuid, date, text),
  public.payroll_run_differences(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
