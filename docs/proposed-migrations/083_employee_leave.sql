-- ============================================================================
-- 083 (PROPOSED — NOT APPLIED) — the employee file and leave.
-- Needs only the repository migrations (audit log, roles); it does not depend on 080.
-- Validated on the isolated replica: npx tsx scripts/test-leave-scenarios.mjs
--
-- Adds
--   employee_details          one row per employee: national id, birth date, employment type, contract and
--                             probation end, bank account and IBAN, emergency contact, yearly leave days and
--                             carry-over, end of service, notes.
--   employee_leave_requests   leave with a working-day count (Friday and Saturday are the weekend), a status
--                             (PENDING, APPROVED, REJECTED, CANCELLED) and the decision trail.
--
-- Rules the database enforces
--   * Writes go through SECURITY DEFINER functions only; the tables have no write policies. Every function
--     checks the caller's role and writes the audit log (entity 'employee', so it shows on the employee's history).
--   * Reads: owner, admin and accountant (the roles that see payroll). employees_on_leave(date) is the only
--     leave read open to cashiers: name, type and dates, never the reason.
--   * Requesting leave: owner, admin, accountant. Approving or rejecting, cancelling an approved leave, ending one
--     early, and over-balance exceptions: owner and admin.
--   * A leave never overlaps another PENDING or APPROVED leave of the same employee (checked in the function with
--     the clashing dates in the message, and again by a trigger so no write path can skip it).
--   * Annual leave cannot go below zero, per calendar year (a leave across New Year is split between the years).
--     An owner or admin may exceed the balance only by writing why; the note is kept on the request.
--   * A leave in a closed payroll month is fine (it is not money). Unpaid leave does not touch payroll: the screen
--     suggests a deduction and the accountant adds it through the normal payroll adjustment.
--   * "Today" is the calendar day in Libya (Africa/Tripoli), not the server's UTC day.
--
-- Reading this file next to 080: the helper naming (leave_*) and the guard levels (approve, manage, write) follow
-- payroll_require. Rollback: 083_employee_leave.ROLLBACK.sql (refuses while the tables hold data).
-- ============================================================================
BEGIN;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_details (
  employee_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  national_id text CHECK (national_id IS NULL OR length(national_id) <= 40),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1920-01-01' AND DATE '2100-01-01'),
  employment_type text NOT NULL DEFAULT 'FULL_TIME' CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY')),
  contract_end date,
  probation_end date,
  bank_name text CHECK (bank_name IS NULL OR length(bank_name) <= 120),
  bank_account text CHECK (bank_account IS NULL OR length(bank_account) <= 60),
  iban text CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  emergency_name text CHECK (emergency_name IS NULL OR length(emergency_name) <= 120),
  emergency_phone text CHECK (emergency_phone IS NULL OR length(emergency_phone) <= 30),
  -- Working days a year; editable per employee.
  annual_leave_days numeric(5,1) NOT NULL DEFAULT 30 CHECK (annual_leave_days >= 0 AND annual_leave_days <= 120),
  -- Days brought from the previous year, and the calendar year they belong to (they do not follow the employee
  -- into later years).
  leave_carry_over numeric(5,1) NOT NULL DEFAULT 0 CHECK (leave_carry_over >= 0 AND leave_carry_over <= 120),
  leave_carry_over_year integer CHECK (leave_carry_over_year IS NULL OR leave_carry_over_year BETWEEN 2000 AND 2100),
  termination_date date,
  termination_reason text CHECK (termination_reason IS NULL OR length(termination_reason) <= 300),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (termination_date IS NOT NULL OR termination_reason IS NULL)
);

CREATE TABLE IF NOT EXISTS public.employee_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Leave is employment history: an employee who has any cannot be deleted, only archived.
  employee_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  leave_type text NOT NULL CHECK (leave_type IN ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'OTHER')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  -- Working days between the two dates, Friday and Saturday excluded (computed by the function, never typed).
  days numeric(6,1) NOT NULL CHECK (days > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  -- Why an owner or admin let the request go over the annual balance.
  override_note text CHECK (override_note IS NULL OR length(override_note) <= 500),
  -- The planned end, when an approved leave was cut short.
  original_end_date date,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (days <= (end_date - start_date) + 1),
  CHECK (status NOT IN ('APPROVED', 'REJECTED') OR decided_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS employee_leave_requests_employee_idx ON public.employee_leave_requests (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS employee_leave_requests_live_idx ON public.employee_leave_requests (start_date, end_date)
  WHERE status IN ('PENDING', 'APPROVED');

-- ── Helpers (not callable through the API) ──────────────────────────────────
-- The calendar day in Libya. The server runs on UTC, which is still yesterday for the first two hours of a Libyan day.
CREATE OR REPLACE FUNCTION public.leave_today()
 RETURNS date LANGUAGE sql STABLE
AS $function$ SELECT (now() AT TIME ZONE 'Africa/Tripoli')::date $function$;

CREATE OR REPLACE FUNCTION public.leave_can(p_level text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  IF p_level = 'approve' THEN RETURN public.get_my_role() IN ('owner', 'admin');
  ELSIF p_level = 'manage' THEN RETURN public.auth_may_manage_journals();
  ELSIF p_level = 'write' THEN RETURN public.auth_role_may_write();
  END IF;
  RAISE EXCEPTION 'leave_can: unknown level %', p_level;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_require(p_level text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.leave_can(p_level) THEN
    RAISE EXCEPTION '%', CASE p_level
      WHEN 'approve' THEN 'غير مصرح: قرار الإجازات للمالك أو المدير'
      WHEN 'manage' THEN 'غير مصرح: بيانات الموظفين والإجازات للمحاسب أو المدير'
      ELSE 'غير مصرح: هذه العملية تتطلب صلاحية كتابة' END
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_get_employee(p_employee_id uuid)
 RETURNS public.contacts LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v public.contacts;
BEGIN
  SELECT * INTO v FROM public.contacts WHERE id = p_employee_id AND kind = 'EMPLOYEE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الموظف غير موجود أو ليس من نوع موظف' USING ERRCODE = '23503';
  END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_type_label(p_type text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE p_type WHEN 'ANNUAL' THEN 'سنوية' WHEN 'SICK' THEN 'مرضية' WHEN 'UNPAID' THEN 'بدون راتب'
                     WHEN 'EMERGENCY' THEN 'طارئة' WHEN 'MATERNITY' THEN 'أمومة' ELSE 'أخرى' END
$function$;

-- Working days from p_start to p_end inclusive. Postgres day of week: Sunday 0 … Friday 5, Saturday 6.
CREATE OR REPLACE FUNCTION public.leave_working_days(p_start date, p_end date)
 RETURNS numeric LANGUAGE sql IMMUTABLE
AS $function$
  SELECT count(*)::numeric FROM generate_series(0, GREATEST(p_end - p_start, -1)) g
  WHERE extract(dow FROM p_start + g) NOT IN (5, 6)
$function$;

-- The first working day after p_date (the day the employee is expected back).
CREATE OR REPLACE FUNCTION public.leave_next_working_day(p_date date)
 RETURNS date LANGUAGE sql IMMUTABLE
AS $function$
  SELECT p_date + g FROM generate_series(1, 7) g WHERE extract(dow FROM p_date + g) NOT IN (5, 6) ORDER BY g LIMIT 1
$function$;

-- Working days of a leave that fall inside one calendar year.
CREATE OR REPLACE FUNCTION public.leave_days_in_year(p_start date, p_end date, p_year integer)
 RETURNS numeric LANGUAGE sql IMMUTABLE
AS $function$
  SELECT public.leave_working_days(GREATEST(p_start, make_date(p_year, 1, 1)), LEAST(p_end, make_date(p_year, 12, 31)))
$function$;

CREATE OR REPLACE FUNCTION public.leave_carry_over_for(p_employee_id uuid, p_year integer)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE((SELECT d.leave_carry_over FROM public.employee_details d
                   WHERE d.employee_id = p_employee_id AND d.leave_carry_over_year = p_year), 0)
$function$;

-- Annual days for the year: the employee's yearly allowance (30 when there is no file yet) plus the carry-over
-- that belongs to that year.
CREATE OR REPLACE FUNCTION public.leave_annual_entitlement(p_employee_id uuid, p_year integer)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE((SELECT d.annual_leave_days FROM public.employee_details d WHERE d.employee_id = p_employee_id), 30)
         + public.leave_carry_over_for(p_employee_id, p_year)
$function$;

-- Working days of one type and status that fall in a year, optionally leaving one request out.
CREATE OR REPLACE FUNCTION public.leave_used(p_employee_id uuid, p_year integer, p_type text, p_status text, p_exclude uuid DEFAULT NULL)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(sum(public.leave_days_in_year(r.start_date, r.end_date, p_year)), 0)
  FROM public.employee_leave_requests r
  WHERE r.employee_id = p_employee_id AND r.leave_type = p_type AND r.status = p_status
    AND r.id IS DISTINCT FROM p_exclude
    AND r.start_date <= make_date(p_year, 12, 31) AND r.end_date >= make_date(p_year, 1, 1)
$function$;

-- Raises when the dates touch another PENDING or APPROVED leave of the employee. The advisory lock makes two
-- simultaneous requests for the same employee queue instead of both passing the check.
CREATE OR REPLACE FUNCTION public.leave_assert_no_overlap(p_employee_id uuid, p_start date, p_end date, p_exclude uuid DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE o public.employee_leave_requests;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('employee_leave:' || p_employee_id::text, 0));
  SELECT * INTO o FROM public.employee_leave_requests r
  WHERE r.employee_id = p_employee_id AND r.status IN ('PENDING', 'APPROVED')
    AND r.id IS DISTINCT FROM p_exclude AND r.start_date <= p_end AND r.end_date >= p_start
  ORDER BY r.start_date LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'تتداخل هذه الفترة مع إجازة % للموظف من % إلى %',
      CASE o.status WHEN 'PENDING' THEN 'بانتظار القرار' ELSE 'معتمدة' END,
      to_char(o.start_date, 'DD/MM/YYYY'), to_char(o.end_date, 'DD/MM/YYYY')
      USING ERRCODE = '23P01';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.employee_leave_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IN ('PENDING', 'APPROVED') THEN
    PERFORM public.leave_assert_no_overlap(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS employee_leave_guard ON public.employee_leave_requests;
CREATE TRIGGER employee_leave_guard
  BEFORE INSERT OR UPDATE OF status, start_date, end_date, employee_id ON public.employee_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.employee_leave_guard();

-- NULL when the annual balance covers the dates in every year they touch; otherwise the Arabic shortage message.
-- A request counts the employee's other pending leave too (it is promised days); an approval counts approved only.
CREATE OR REPLACE FUNCTION public.leave_annual_shortage(
  p_employee_id uuid, p_start date, p_end date, p_exclude uuid, p_count_pending boolean)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE y integer; v_need numeric; v_avail numeric; v_msg text;
BEGIN
  FOR y IN EXTRACT(year FROM p_start)::integer .. EXTRACT(year FROM p_end)::integer LOOP
    v_need := public.leave_days_in_year(p_start, p_end, y);
    CONTINUE WHEN v_need = 0;
    v_avail := public.leave_annual_entitlement(p_employee_id, y)
             - public.leave_used(p_employee_id, y, 'ANNUAL', 'APPROVED', p_exclude)
             - CASE WHEN p_count_pending THEN public.leave_used(p_employee_id, y, 'ANNUAL', 'PENDING', p_exclude) ELSE 0 END;
    IF v_need > v_avail + 0.0005 THEN
      v_msg := COALESCE(v_msg || E'\n', '')
        || format('رصيد الإجازة السنوية لعام %s لا يكفي: المتاح %s والمطلوب %s', y, trim_scale(GREATEST(v_avail, 0)), trim_scale(v_need));
    END IF;
  END LOOP;
  RETURN v_msg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_audit(
  p_action text, p_employee_id uuid, p_employee_name text, p_summary text, p_date date, p_severity text, p_meta jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.write_audit_log(p_action, 'employee', p_employee_id, p_employee_name, p_summary, p_date,
                                 NULL, NULL, p_severity, p_meta);
END;
$function$;

-- ── Employee file ───────────────────────────────────────────────────────────
-- The form sends the whole file, so a NULL clears a field. Three values keep what is stored when left NULL: the
-- employment type, the yearly allowance and the carry-over (a missing carry-over year stays the stored one while the
-- carry-over is unchanged, so editing the file in a later year never hands the same days out again).
CREATE OR REPLACE FUNCTION public.employee_details_upsert(
  p_employee_id uuid,
  p_employment_type text DEFAULT NULL,
  p_national_id text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_contract_end date DEFAULT NULL,
  p_probation_end date DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_bank_account text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_emergency_name text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_annual_leave_days numeric DEFAULT NULL,
  p_leave_carry_over numeric DEFAULT NULL,
  p_leave_carry_over_year integer DEFAULT NULL,
  p_termination_date date DEFAULT NULL,
  p_termination_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_emp public.contacts;
  v_old public.employee_details;
  v_had boolean;
  v_new public.employee_details;
  v_type text;
  v_iban text := NULLIF(upper(regexp_replace(COALESCE(p_iban, ''), '\s', '', 'g')), '');
  v_term_reason text := NULLIF(btrim(p_termination_reason), '');
  v_carry numeric;
  v_carry_year integer;
  v_changed text[];
  v_labels text;
BEGIN
  PERFORM public.leave_require('manage');
  v_emp := public.leave_get_employee(p_employee_id);
  SELECT * INTO v_old FROM public.employee_details WHERE employee_id = p_employee_id;
  v_had := FOUND;

  v_type := COALESCE(NULLIF(btrim(p_employment_type), ''), CASE WHEN v_had THEN v_old.employment_type END, 'FULL_TIME');
  IF v_type NOT IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY') THEN
    RAISE EXCEPTION 'نوع التوظيف غير معروف: %', v_type USING ERRCODE = '22023';
  END IF;
  IF v_iban IS NOT NULL AND v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' THEN
    RAISE EXCEPTION 'رقم الآيبان غير صحيح — يبدأ برمزين لحرفين ثم رقمين (مثل LY83…)' USING ERRCODE = '22023';
  END IF;
  IF p_birth_date IS NOT NULL AND p_birth_date >= public.leave_today() THEN
    RAISE EXCEPTION 'تاريخ الميلاد يجب أن يكون في الماضي' USING ERRCODE = '22023';
  END IF;
  IF p_annual_leave_days IS NOT NULL AND (p_annual_leave_days < 0 OR p_annual_leave_days > 120) THEN
    RAISE EXCEPTION 'أيام الإجازة السنوية بين 0 و120' USING ERRCODE = '22023';
  END IF;
  IF p_leave_carry_over IS NOT NULL AND (p_leave_carry_over < 0 OR p_leave_carry_over > 120) THEN
    RAISE EXCEPTION 'الرصيد المرحّل بين 0 و120 يوماً' USING ERRCODE = '22023';
  END IF;
  IF p_termination_date IS NOT NULL THEN
    IF v_term_reason IS NULL OR length(v_term_reason) < 3 THEN
      RAISE EXCEPTION 'اكتب سبب انتهاء الخدمة' USING ERRCODE = '22023';
    END IF;
    IF v_emp.hire_date IS NOT NULL AND p_termination_date < v_emp.hire_date THEN
      RAISE EXCEPTION 'تاريخ انتهاء الخدمة قبل تاريخ التعيين (%)', to_char(v_emp.hire_date, 'DD/MM/YYYY') USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.employee_leave_requests r
               WHERE r.employee_id = p_employee_id AND r.status IN ('PENDING', 'APPROVED') AND r.end_date > p_termination_date) THEN
      RAISE EXCEPTION 'توجد إجازة معتمدة أو بانتظار القرار بعد تاريخ انتهاء الخدمة — ألغِها أو قصّرها أولاً' USING ERRCODE = '55000';
    END IF;
  END IF;

  v_carry := COALESCE(p_leave_carry_over, CASE WHEN v_had THEN v_old.leave_carry_over END, 0);
  v_carry_year := COALESCE(
    p_leave_carry_over_year,
    CASE WHEN v_had AND v_carry IS NOT DISTINCT FROM v_old.leave_carry_over THEN v_old.leave_carry_over_year END,
    CASE WHEN v_carry > 0 THEN EXTRACT(year FROM public.leave_today())::integer END);

  INSERT INTO public.employee_details AS d
    (employee_id, national_id, birth_date, employment_type, contract_end, probation_end, bank_name, bank_account, iban,
     emergency_name, emergency_phone, annual_leave_days, leave_carry_over, leave_carry_over_year,
     termination_date, termination_reason, notes, updated_by)
  VALUES (p_employee_id, NULLIF(btrim(p_national_id), ''), p_birth_date, v_type, p_contract_end, p_probation_end,
          NULLIF(btrim(p_bank_name), ''), NULLIF(btrim(p_bank_account), ''), v_iban,
          NULLIF(btrim(p_emergency_name), ''), NULLIF(btrim(p_emergency_phone), ''),
          COALESCE(p_annual_leave_days, CASE WHEN v_had THEN v_old.annual_leave_days END, 30), v_carry, v_carry_year,
          p_termination_date, CASE WHEN p_termination_date IS NULL THEN NULL ELSE v_term_reason END,
          NULLIF(btrim(p_notes), ''), auth.uid())
  ON CONFLICT (employee_id) DO UPDATE SET
    national_id = EXCLUDED.national_id, birth_date = EXCLUDED.birth_date, employment_type = EXCLUDED.employment_type,
    contract_end = EXCLUDED.contract_end, probation_end = EXCLUDED.probation_end, bank_name = EXCLUDED.bank_name,
    bank_account = EXCLUDED.bank_account, iban = EXCLUDED.iban, emergency_name = EXCLUDED.emergency_name,
    emergency_phone = EXCLUDED.emergency_phone, annual_leave_days = EXCLUDED.annual_leave_days,
    leave_carry_over = EXCLUDED.leave_carry_over, leave_carry_over_year = EXCLUDED.leave_carry_over_year,
    termination_date = EXCLUDED.termination_date, termination_reason = EXCLUDED.termination_reason,
    notes = EXCLUDED.notes, updated_at = now(), updated_by = auth.uid()
  RETURNING d.* INTO v_new;

  -- Which fields moved. Values are not copied into the log: the file holds bank and identity numbers.
  SELECT array_agg(k ORDER BY k) INTO v_changed
  FROM jsonb_object_keys(to_jsonb(v_new)) k
  WHERE k NOT IN ('created_at', 'updated_at', 'updated_by', 'employee_id')
    AND (NOT v_had OR to_jsonb(v_new) -> k IS DISTINCT FROM to_jsonb(v_old) -> k);
  IF v_had AND v_changed IS NULL THEN RETURN; END IF;

  SELECT string_agg(COALESCE(l.label, c.k), '، ' ORDER BY c.ord)
  INTO v_labels
  FROM unnest(COALESCE(v_changed, ARRAY[]::text[])) WITH ORDINALITY AS c(k, ord)
  LEFT JOIN (VALUES
    ('national_id', 'الرقم الوطني'), ('birth_date', 'تاريخ الميلاد'), ('employment_type', 'نوع التوظيف'),
    ('contract_end', 'نهاية العقد'), ('probation_end', 'نهاية فترة التجربة'), ('bank_name', 'المصرف'),
    ('bank_account', 'الحساب المصرفي'), ('iban', 'الآيبان'), ('emergency_name', 'جهة الطوارئ'),
    ('emergency_phone', 'هاتف الطوارئ'), ('annual_leave_days', 'الإجازة السنوية'), ('leave_carry_over', 'الرصيد المرحّل'),
    ('leave_carry_over_year', 'سنة الرصيد المرحّل'), ('termination_date', 'نهاية الخدمة'),
    ('termination_reason', 'سبب نهاية الخدمة'), ('notes', 'الملاحظات')
  ) AS l(k, label) ON l.k = c.k;

  PERFORM public.leave_audit(CASE WHEN v_had THEN 'UPDATE' ELSE 'INSERT' END, p_employee_id, v_emp.name,
    CASE WHEN v_had THEN 'تعديل ملف الموظف: ' || COALESCE(v_labels, '') ELSE 'فتح ملف الموظف' END,
    public.leave_today(), CASE WHEN p_termination_date IS NOT NULL THEN 'warning' ELSE 'info' END,
    jsonb_build_object('event', 'employee_details', 'changed', to_jsonb(COALESCE(v_changed, ARRAY[]::text[])),
                       'termination_date', p_termination_date));
END;
$function$;

-- ── Leave requests ──────────────────────────────────────────────────────────
-- p_approve records the leave as approved at once (owner and admin only). p_override_note lets an owner or admin
-- go over the annual balance; it needs words, and it is kept on the request.
CREATE OR REPLACE FUNCTION public.employee_leave_request(
  p_employee_id uuid, p_leave_type text, p_start date, p_end date, p_reason text DEFAULT NULL,
  p_approve boolean DEFAULT false, p_override_note text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_emp public.contacts;
  v_term date;
  v_days numeric;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_override text := NULLIF(btrim(p_override_note), '');
  v_approved boolean := COALESCE(p_approve, false);
  v_short text;
  v_id uuid;
BEGIN
  PERFORM public.leave_require('manage');
  IF v_approved OR v_override IS NOT NULL THEN PERFORM public.leave_require('approve'); END IF;
  v_emp := public.leave_get_employee(p_employee_id);

  IF p_leave_type IS NULL OR p_leave_type NOT IN ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'OTHER') THEN
    RAISE EXCEPTION 'نوع الإجازة غير معروف: %', COALESCE(p_leave_type, '—') USING ERRCODE = '22023';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'حدّد بداية الإجازة ونهايتها' USING ERRCODE = '22023';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'تاريخ نهاية الإجازة قبل تاريخ بدايتها' USING ERRCODE = '22023';
  END IF;
  IF p_end - p_start > 365 THEN
    RAISE EXCEPTION 'مدة الإجازة أطول من سنة — قسّمها على فترتين' USING ERRCODE = '22023';
  END IF;
  IF p_start < DATE '2020-01-01' OR p_end > public.leave_today() + 730 THEN
    RAISE EXCEPTION 'تاريخ الإجازة غير معقول، راجع السنة' USING ERRCODE = '22023';
  END IF;
  IF p_leave_type = 'OTHER' AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'اكتب سبب الإجازة' USING ERRCODE = '22023';
  END IF;
  IF v_override IS NOT NULL AND length(v_override) < 3 THEN
    RAISE EXCEPTION 'اكتب سبب تجاوز الرصيد' USING ERRCODE = '22023';
  END IF;
  IF v_emp.hire_date IS NOT NULL AND p_start < v_emp.hire_date THEN
    RAISE EXCEPTION 'تبدأ الإجازة قبل تاريخ تعيين الموظف (%)', to_char(v_emp.hire_date, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  SELECT d.termination_date INTO v_term FROM public.employee_details d WHERE d.employee_id = p_employee_id;
  IF v_term IS NOT NULL AND p_end > v_term THEN
    RAISE EXCEPTION 'تنتهي الإجازة بعد تاريخ انتهاء خدمة الموظف (%)', to_char(v_term, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;

  v_days := public.leave_working_days(p_start, p_end);
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'الفترة المختارة كلها عطلة أسبوعية (الجمعة والسبت)' USING ERRCODE = '22023';
  END IF;

  PERFORM public.leave_assert_no_overlap(p_employee_id, p_start, p_end, NULL);

  IF p_leave_type = 'ANNUAL' THEN
    v_short := public.leave_annual_shortage(p_employee_id, p_start, p_end, NULL, true);
    IF v_short IS NOT NULL AND v_override IS NULL THEN
      RAISE EXCEPTION '%', v_short || E'\nتجاوز الرصيد يحتاج المالك أو المدير مع كتابة السبب.' USING ERRCODE = 'LV001';
    END IF;
  END IF;

  INSERT INTO public.employee_leave_requests
    (employee_id, leave_type, start_date, end_date, days, status, reason, override_note, decided_by, decided_at, created_by)
  VALUES (p_employee_id, p_leave_type, p_start, p_end, v_days, CASE WHEN v_approved THEN 'APPROVED' ELSE 'PENDING' END,
          v_reason, CASE WHEN v_short IS NOT NULL THEN v_override END,
          CASE WHEN v_approved THEN auth.uid() END, CASE WHEN v_approved THEN now() END, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.leave_audit('INSERT', p_employee_id, v_emp.name,
    format('%s إجازة %s من %s إلى %s (%s أيام عمل)%s',
           CASE WHEN v_approved THEN 'تسجيل واعتماد' ELSE 'طلب' END, public.leave_type_label(p_leave_type),
           to_char(p_start, 'DD/MM/YYYY'), to_char(p_end, 'DD/MM/YYYY'), trim_scale(v_days),
           CASE WHEN v_short IS NOT NULL THEN ' — تجاوز الرصيد: ' || v_override ELSE '' END),
    p_start, CASE WHEN v_approved THEN 'success' ELSE 'info' END,
    jsonb_build_object('event', CASE WHEN v_approved THEN 'leave_approved' ELSE 'leave_requested' END,
                       'request_id', v_id, 'leave_type', p_leave_type, 'days', v_days, 'over_balance', v_short IS NOT NULL));
  RETURN v_id;
END;
$function$;

-- Owner and admin decide. A rejection needs its reason. An approval re-checks the annual balance, because the
-- allowance may have been lowered since the request was made; going over needs p_override and a note.
CREATE OR REPLACE FUNCTION public.employee_leave_decide(
  p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL, p_override boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  r public.employee_leave_requests;
  v_note text := NULLIF(btrim(p_note), '');
  v_short text;
  v_name text;
  v_over boolean := false;
BEGIN
  PERFORM public.leave_require('approve');
  IF p_approve IS NULL THEN RAISE EXCEPTION 'حدّد الموافقة أو الرفض' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.employee_leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإجازة غير موجود'; END IF;
  IF r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'الطلب ليس بانتظار القرار (%)',
      CASE r.status WHEN 'APPROVED' THEN 'معتمد' WHEN 'REJECTED' THEN 'مرفوض' ELSE 'ملغى' END USING ERRCODE = '55000';
  END IF;
  IF NOT p_approve AND (v_note IS NULL OR length(v_note) < 3) THEN
    RAISE EXCEPTION 'اكتب سبب الرفض' USING ERRCODE = '22023';
  END IF;
  v_name := (public.leave_get_employee(r.employee_id)).name;

  IF p_approve AND r.leave_type = 'ANNUAL' THEN
    v_short := public.leave_annual_shortage(r.employee_id, r.start_date, r.end_date, r.id, false);
    IF v_short IS NOT NULL AND r.override_note IS NULL THEN
      IF NOT COALESCE(p_override, false) OR v_note IS NULL OR length(v_note) < 3 THEN
        RAISE EXCEPTION '%', v_short || E'\nللاعتماد رغم ذلك أكّد التجاوز واكتب السبب.' USING ERRCODE = 'LV001';
      END IF;
      v_over := true;
    END IF;
  END IF;

  UPDATE public.employee_leave_requests
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
      decided_by = auth.uid(), decided_at = now(), decision_note = v_note,
      override_note = CASE WHEN v_over THEN v_note ELSE override_note END
  WHERE id = p_request_id;

  PERFORM public.leave_audit('UPDATE', r.employee_id, v_name,
    format('%s إجازة %s من %s إلى %s%s', CASE WHEN p_approve THEN 'اعتماد' ELSE 'رفض' END, public.leave_type_label(r.leave_type),
           to_char(r.start_date, 'DD/MM/YYYY'), to_char(r.end_date, 'DD/MM/YYYY'),
           CASE WHEN v_note IS NOT NULL THEN ' — ' || v_note ELSE '' END),
    r.start_date, CASE WHEN p_approve THEN 'success' ELSE 'warning' END,
    jsonb_build_object('event', CASE WHEN p_approve THEN 'leave_approved' ELSE 'leave_rejected' END,
                       'request_id', p_request_id, 'over_balance', v_over));
END;
$function$;

-- A pending request is withdrawn by anyone who may manage; an approved one that has not started needs owner or admin.
-- Once it has started, the days are taken: cut it short instead (employee_leave_end_early).
CREATE OR REPLACE FUNCTION public.employee_leave_cancel(p_request_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  r public.employee_leave_requests;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_name text;
BEGIN
  PERFORM public.leave_require('manage');
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'اكتب سبب الإلغاء' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.employee_leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإجازة غير موجود'; END IF;
  IF r.status = 'APPROVED' THEN
    PERFORM public.leave_require('approve');
    IF r.start_date < public.leave_today() THEN
      RAISE EXCEPTION 'بدأت هذه الإجازة فلا تُلغى — اختر «رجوع مبكر» لتقصيرها' USING ERRCODE = '55000';
    END IF;
  ELSIF r.status <> 'PENDING' THEN
    RAISE EXCEPTION 'لا يُلغى طلب حالته %', CASE r.status WHEN 'REJECTED' THEN 'مرفوض' ELSE 'ملغى' END USING ERRCODE = '55000';
  END IF;
  v_name := (public.leave_get_employee(r.employee_id)).name;

  UPDATE public.employee_leave_requests
  SET status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason
  WHERE id = p_request_id;

  PERFORM public.leave_audit('UPDATE', r.employee_id, v_name,
    format('إلغاء إجازة %s من %s إلى %s — %s', public.leave_type_label(r.leave_type),
           to_char(r.start_date, 'DD/MM/YYYY'), to_char(r.end_date, 'DD/MM/YYYY'), v_reason),
    r.start_date, 'warning',
    jsonb_build_object('event', 'leave_cancelled', 'request_id', p_request_id, 'was', r.status));
END;
$function$;

-- The employee came back before the approved end: the leave now ends on p_new_end and the days after it return
-- to the balance.
CREATE OR REPLACE FUNCTION public.employee_leave_end_early(p_request_id uuid, p_new_end date, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  r public.employee_leave_requests;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_days numeric;
  v_name text;
BEGIN
  PERFORM public.leave_require('approve');
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'اكتب سبب العودة المبكرة' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.employee_leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإجازة غير موجود'; END IF;
  IF r.status <> 'APPROVED' THEN RAISE EXCEPTION 'تُقصَّر الإجازة المعتمدة فقط' USING ERRCODE = '55000'; END IF;
  IF p_new_end IS NULL OR p_new_end >= r.end_date OR p_new_end < r.start_date THEN
    RAISE EXCEPTION 'آخر يوم إجازة جديد يجب أن يقع بين % و%', to_char(r.start_date, 'DD/MM/YYYY'),
      to_char(r.end_date - 1, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  v_days := public.leave_working_days(r.start_date, p_new_end);
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'لم يبقَ يوم عمل في الإجازة بعد التقصير — ألغِها بدلاً من ذلك' USING ERRCODE = '22023';
  END IF;
  v_name := (public.leave_get_employee(r.employee_id)).name;

  UPDATE public.employee_leave_requests
  SET end_date = p_new_end, days = v_days, original_end_date = COALESCE(original_end_date, r.end_date)
  WHERE id = p_request_id;

  PERFORM public.leave_audit('UPDATE', r.employee_id, v_name,
    format('عودة مبكرة من إجازة %s: تنتهي في %s بدلاً من %s — %s', public.leave_type_label(r.leave_type),
           to_char(p_new_end, 'DD/MM/YYYY'), to_char(r.end_date, 'DD/MM/YYYY'), v_reason),
    p_new_end, 'info',
    jsonb_build_object('event', 'leave_shortened', 'request_id', p_request_id, 'days', v_days, 'old_end', r.end_date));
END;
$function$;

-- ── Read models ─────────────────────────────────────────────────────────────
-- One row per leave type for a calendar year. Only ANNUAL has an entitlement and a remaining figure; the other types
-- are counters. taken = approved working days inside the year; pending = days still waiting for a decision;
-- remaining = entitlement − taken − pending (negative only after an approved override).
CREATE OR REPLACE FUNCTION public.employee_leave_balance(p_employee_id uuid, p_year integer DEFAULT NULL)
 RETURNS TABLE (leave_type text, entitlement numeric, carry_over numeric, taken numeric, pending numeric, remaining numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_year integer := COALESCE(p_year, EXTRACT(year FROM public.leave_today())::integer);
BEGIN
  PERFORM public.leave_require('manage');
  PERFORM public.leave_get_employee(p_employee_id);
  IF v_year NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'السنة غير صحيحة' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  SELECT t.lt,
         CASE WHEN t.lt = 'ANNUAL' THEN public.leave_annual_entitlement(p_employee_id, v_year) END,
         CASE WHEN t.lt = 'ANNUAL' THEN public.leave_carry_over_for(p_employee_id, v_year) END,
         public.leave_used(p_employee_id, v_year, t.lt, 'APPROVED'),
         public.leave_used(p_employee_id, v_year, t.lt, 'PENDING'),
         CASE WHEN t.lt = 'ANNUAL' THEN public.leave_annual_entitlement(p_employee_id, v_year)
                   - public.leave_used(p_employee_id, v_year, t.lt, 'APPROVED')
                   - public.leave_used(p_employee_id, v_year, t.lt, 'PENDING') END
  FROM unnest(ARRAY['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'OTHER']) WITH ORDINALITY AS t(lt, ord)
  ORDER BY t.ord;
END;
$function$;

-- Who is away on a day (approved leave only), with the first working day they are expected back. Open to every role
-- that can write; it carries no reason or decision text. Viewers get no rows.
CREATE OR REPLACE FUNCTION public.employees_on_leave(p_date date DEFAULT NULL)
 RETURNS TABLE (request_id uuid, employee_id uuid, employee_name text, job_title text, department text,
                leave_type text, start_date date, end_date date, days numeric, return_date date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_day date := COALESCE(p_date, public.leave_today());
BEGIN
  IF NOT public.leave_can('write') THEN RETURN; END IF;
  RETURN QUERY
  SELECT r.id, r.employee_id, c.name, c.job_title, c.department, r.leave_type, r.start_date, r.end_date, r.days,
         public.leave_next_working_day(r.end_date)
  FROM public.employee_leave_requests r
  JOIN public.contacts c ON c.id = r.employee_id AND c.kind = 'EMPLOYEE'
  WHERE r.status = 'APPROVED' AND r.start_date <= v_day AND r.end_date >= v_day
  ORDER BY r.end_date, c.name;
END;
$function$;

-- ── Security ────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_details_select ON public.employee_details;
DROP POLICY IF EXISTS employee_leave_requests_select ON public.employee_leave_requests;
CREATE POLICY employee_details_select ON public.employee_details FOR SELECT TO authenticated USING (public.auth_may_manage_journals());
CREATE POLICY employee_leave_requests_select ON public.employee_leave_requests FOR SELECT TO authenticated USING (public.auth_may_manage_journals());

REVOKE ALL ON public.employee_details, public.employee_leave_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_details, public.employee_leave_requests TO authenticated;
GRANT ALL ON public.employee_details, public.employee_leave_requests TO service_role;

REVOKE EXECUTE ON FUNCTION
  public.leave_today(), public.leave_can(text), public.leave_require(text), public.leave_get_employee(uuid),
  public.leave_type_label(text), public.leave_working_days(date, date), public.leave_next_working_day(date),
  public.leave_days_in_year(date, date, integer), public.leave_carry_over_for(uuid, integer),
  public.leave_annual_entitlement(uuid, integer), public.leave_used(uuid, integer, text, text, uuid),
  public.leave_assert_no_overlap(uuid, date, date, uuid), public.employee_leave_guard(),
  public.leave_annual_shortage(uuid, date, date, uuid, boolean),
  public.leave_audit(text, uuid, text, text, date, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.employee_details_upsert(uuid, text, text, date, date, date, text, text, text, text, text, numeric, numeric, integer, date, text, text),
  public.employee_leave_request(uuid, text, date, date, text, boolean, text),
  public.employee_leave_decide(uuid, boolean, text, boolean),
  public.employee_leave_cancel(uuid, text),
  public.employee_leave_end_early(uuid, date, text),
  public.employee_leave_balance(uuid, integer),
  public.employees_on_leave(date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.employee_details_upsert(uuid, text, text, date, date, date, text, text, text, text, text, numeric, numeric, integer, date, text, text),
  public.employee_leave_request(uuid, text, date, date, text, boolean, text),
  public.employee_leave_decide(uuid, boolean, text, boolean),
  public.employee_leave_cancel(uuid, text),
  public.employee_leave_end_early(uuid, date, text),
  public.employee_leave_balance(uuid, integer),
  public.employees_on_leave(date)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
