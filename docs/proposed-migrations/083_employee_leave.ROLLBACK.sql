-- ROLLBACK for 083 — removes the employee file and leave module.
-- Refuses to run while either table holds rows: leave and file data are not recreated by re-applying 083,
-- so export them first (and delete the rows on purpose if they are really to be discarded).
-- The audit log entries written by the module stay: the log is never rewritten.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.employee_leave_requests') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.employee_leave_requests) THEN
    RAISE EXCEPTION 'Leave requests exist — export them before removing the module.';
  END IF;
  IF to_regclass('public.employee_details') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.employee_details) THEN
    RAISE EXCEPTION 'Employee files exist — export them before removing the module.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.employees_on_leave(date);
DROP FUNCTION IF EXISTS public.employee_leave_balance(uuid, integer);
DROP FUNCTION IF EXISTS public.employee_leave_end_early(uuid, date, text);
DROP FUNCTION IF EXISTS public.employee_leave_cancel(uuid, text);
DROP FUNCTION IF EXISTS public.employee_leave_decide(uuid, boolean, text, boolean);
DROP FUNCTION IF EXISTS public.employee_leave_request(uuid, text, date, date, text, boolean, text);
DROP FUNCTION IF EXISTS public.employee_details_upsert(uuid, text, text, date, date, date, text, text, text, text, text, numeric, numeric, integer, date, text, text);

DROP TRIGGER IF EXISTS employee_leave_guard ON public.employee_leave_requests;
DROP FUNCTION IF EXISTS public.employee_leave_guard();
DROP FUNCTION IF EXISTS public.leave_audit(text, uuid, text, text, date, text, jsonb);
DROP FUNCTION IF EXISTS public.leave_annual_shortage(uuid, date, date, uuid, boolean);
DROP FUNCTION IF EXISTS public.leave_assert_no_overlap(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.leave_used(uuid, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.leave_annual_entitlement(uuid, integer);
DROP FUNCTION IF EXISTS public.leave_carry_over_for(uuid, integer);
DROP FUNCTION IF EXISTS public.leave_days_in_year(date, date, integer);
DROP FUNCTION IF EXISTS public.leave_next_working_day(date);
DROP FUNCTION IF EXISTS public.leave_working_days(date, date);
DROP FUNCTION IF EXISTS public.leave_type_label(text);
DROP FUNCTION IF EXISTS public.leave_get_employee(uuid);
DROP FUNCTION IF EXISTS public.leave_require(text);
DROP FUNCTION IF EXISTS public.leave_can(text);
DROP FUNCTION IF EXISTS public.leave_today();

DROP TABLE IF EXISTS public.employee_leave_requests;
DROP TABLE IF EXISTS public.employee_details;

NOTIFY pgrst, 'reload schema';
COMMIT;
