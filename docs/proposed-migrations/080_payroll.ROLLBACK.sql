-- ROLLBACK for 080 — removes the payroll module and restores employee_summary and the mapping constraint.
-- Refuses to run once payroll has produced accounting entries (reverse/void those first),
-- so the rollback can never orphan journal lines or cash transactions.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payroll_runs WHERE status = 'POSTED')
     OR EXISTS (SELECT 1 FROM public.payroll_payments)
     OR EXISTS (SELECT 1 FROM public.payroll_advances WHERE status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'Payroll has posted runs, payments or open advances — reverse them before removing the module.';
  END IF;
END $$;

DROP VIEW IF EXISTS public.payroll_run_lines_status;
DROP VIEW IF EXISTS public.payroll_advances_status;

DROP FUNCTION IF EXISTS public.payroll_pay_line(uuid, numeric, uuid, date, text);
DROP FUNCTION IF EXISTS public.payroll_reverse_run(uuid, text);
DROP FUNCTION IF EXISTS public.payroll_post_run(uuid);
DROP FUNCTION IF EXISTS public.payroll_approve_run(uuid);
DROP FUNCTION IF EXISTS public.payroll_prepare_run(text);
DROP FUNCTION IF EXISTS public.payroll_assert_run_current(uuid);
DROP FUNCTION IF EXISTS public.payroll_run_differences(uuid);
DROP FUNCTION IF EXISTS public.payroll_compute_run(text);
DROP FUNCTION IF EXISTS public.payroll_cancel_advance(uuid, text);
DROP FUNCTION IF EXISTS public.payroll_issue_advance(uuid, numeric, integer, uuid, date, text);
DROP FUNCTION IF EXISTS public.payroll_decide_adjustment(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.payroll_add_adjustment(uuid, text, text, numeric, text, numeric);
DROP FUNCTION IF EXISTS public.payroll_set_salary(uuid, date, numeric, numeric, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.payroll_assert_month(text);
DROP FUNCTION IF EXISTS public.payroll_month_posted(text);
DROP FUNCTION IF EXISTS public.payroll_month_end(text);
DROP FUNCTION IF EXISTS public.payroll_employee_name(uuid);
DROP FUNCTION IF EXISTS public.payroll_account(text, text);
DROP FUNCTION IF EXISTS public.payroll_require(text);

DROP TABLE IF EXISTS public.payroll_payments;
DROP TABLE IF EXISTS public.payroll_advance_repayments;
DROP TABLE IF EXISTS public.payroll_run_lines;
DROP TABLE IF EXISTS public.payroll_advances;
DROP TABLE IF EXISTS public.payroll_adjustments;
DROP TABLE IF EXISTS public.payroll_runs;
DROP TABLE IF EXISTS public.payroll_salary_structures;

-- Pre-080 definition of employee_summary (counted every expense of the employee).
CREATE OR REPLACE VIEW public.employee_summary AS
SELECT c.id, c.name, c.job_title, c.department, c.salary, c.hire_date, c.phone,
  COALESCE((SELECT sum(t.amount) FROM public.transactions t
            WHERE t.contact_id = c.id AND t.kind = 'EXPENSE'::tx_kind
              AND t.tx_date >= (CURRENT_DATE - '1 year'::interval)), 0::numeric) AS last_12_months_salary_paid,
  (SELECT count(DISTINCT date_trunc('month'::text, t.tx_date::timestamp with time zone)) FROM public.transactions t
   WHERE t.contact_id = c.id AND t.kind = 'EXPENSE'::tx_kind
     AND t.tx_date >= (CURRENT_DATE - '1 year'::interval)) AS months_with_payment
FROM public.contacts c
WHERE c.kind = 'EMPLOYEE'::contact_kind AND c.is_active = true;

DELETE FROM public.account_mappings WHERE source_type LIKE 'PAYROLL_%';
ALTER TABLE public.account_mappings DROP CONSTRAINT IF EXISTS account_mappings_source_type_check;
ALTER TABLE public.account_mappings ADD CONSTRAINT account_mappings_source_type_check CHECK (source_type = ANY (ARRAY[
  'RENT_REVENUE', 'SERVICE_REVENUE', 'DEPOSIT_LIABILITY', 'EXPENSE_CASH_ASSET', 'REVENUE_CASH_ASSET']));

-- The three accounts are removed only when nothing references them.
DELETE FROM public.categories c
WHERE c.code IN ('LIA-SAL', 'AST-ADV', 'EXP-BON')
  AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.journal_lines jl WHERE jl.category_id = c.id);

NOTIFY pgrst, 'reload schema';
COMMIT;
