-- ============================================================================
-- 079 (PROPOSED — NOT APPLIED) — post the missing revenue accruals for rent charges
-- Requires 078 (uses public.post_missing_charge_accrual and public.charge_accrual_entry_date).
-- DATA CHANGE: inserts CHARGE journal entries (Dr AST-REC / Cr REV-RNT). Take a pg_dump first.
--
-- Charges in an OPEN period are accrued on their own due date (July–October 2026 today).
-- Charges in a CLOSED period (April–June 2026 today) are accrued on CURRENT_DATE, so closed
-- months stay untouched. If the owner prefers them in their own month, reopen those periods
-- (or decide to leave them), run this file, then close the periods again.
-- ============================================================================

-- Step 1 — preview (read-only): what will be posted and on which date.
SELECT to_char(tc.due_date, 'YYYY-MM') AS rent_month,
       public.charge_accrual_entry_date(tc.due_date) AS accrual_date,
       count(*) AS charges,
       sum(tc.amount) AS amount
FROM public.tenant_charges tc
WHERE tc.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                  WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED')
GROUP BY 1, 2
ORDER BY 1;

-- Step 2 — post (run only after the preview is approved).
BEGIN;
SELECT count(public.post_missing_charge_accrual(tc.id)) AS accruals_posted
FROM public.tenant_charges tc
WHERE tc.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                  WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED');

-- Step 3 — verify before COMMIT: must return 0 rows.
SELECT tc.id FROM public.tenant_charges tc
WHERE tc.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                  WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED');
COMMIT;

-- Rollback for this data change: every row it created is identifiable and can be reversed with
--   UPDATE public.journal_entries SET status = 'REVERSED', reversed_at = now()
--   WHERE source_type = 'CHARGE' AND created_at >= '<time step 2 ran>' AND status = 'POSTED';
-- (reversal only marks entries; nothing is deleted, the audit log keeps both events.)
