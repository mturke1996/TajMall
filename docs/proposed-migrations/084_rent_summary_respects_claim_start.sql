-- ============================================================================
-- 084 (PROPOSED — NOT APPLIED) — rent for months before a tenant started is not owed.
-- Needs the repository migrations; independent of 078–083. Validated on the isolated replica:
--   npx tsx scripts/test-leave-scenarios.mjs        (section "rent claim start")
--
-- What was found
--   tenant_rent_summary_for_month(), the tenant_rent_summary view, get_tenant_rent_calendar(), the open-charges total
--   and rent_missing_charges() already treat every month before the tenant's claim start as "not owed"
--   (is_tenant_rent_month_exempt → tenant_rent_claim_start). They are right. The claim start is what is wrong:
--   it is the earliest ACTIVE lease start, and the lease that the screens create on first use
--   (ensure_tenant_lease_contract) starts on 1 January of the current year whatever the tenant's own start date is.
--   So a tenant who started in April, with contract_start = April on the card, has a claim start of 1 January and the
--   period lists show January–March as unpaid. The same gap makes "set the claim start" in the rent-months dialog do
--   nothing when the date is later than the lease start: the card is updated, the lease is not, the claim start stays.
--
-- What this changes (one function, same name, same signature, same column and status values)
--   tenant_rent_claim_start(tenant) = the LATER of the earliest ACTIVE lease start and the card's contract_start,
--   unless rent was already recorded for an earlier month — then the lease start stands, so nothing that was entered
--   (a charge of any status, or a rent receipt) is ever hidden. Everything built on it follows in one step:
--   the summary function, the view and its rent_claim_start column, the calendar, statements and missing charges.
--   Nothing is written to any table. A tenant with no contract_start, or one not later than the lease, is unchanged.
--
-- Before applying, see whom it moves (read-only; the same rule as the function):
-- DRY-RUN-BEGIN
-- SELECT c.name, c.contract_start, public.tenant_rent_claim_start(c.id) AS claim_start_now
-- FROM public.contacts c
-- WHERE c.kind = 'TENANT' AND c.contract_start IS NOT NULL
--   AND date_trunc('month', c.contract_start) > date_trunc('month', public.tenant_rent_claim_start(c.id))
--   AND NOT EXISTS (SELECT 1 FROM public.tenant_charges tc JOIN public.lease_contracts lc ON lc.id = tc.contract_id
--                   WHERE lc.tenant_id = c.id AND tc.type = 'RENT' AND tc.due_date < date_trunc('month', c.contract_start)::date)
--   AND NOT EXISTS (SELECT 1 FROM public.transactions t JOIN public.categories cat ON cat.id = t.category_id
--                   WHERE t.contact_id = c.id AND t.kind = 'REVENUE' AND t.status IN ('POSTED', 'RECONCILED')
--                     AND cat.code LIKE 'REV-RNT%' AND t.tx_date < date_trunc('month', c.contract_start)::date)
-- ORDER BY c.name;
-- DRY-RUN-END
-- Rollback: 084_rent_summary_respects_claim_start.ROLLBACK.sql (restores the definition from migration 056).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_rent_claim_start(p_tenant_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 084: the card's contract start wins over a later-created lease, unless rent was already recorded before it.
  SELECT CASE
    WHEN s.lease_start IS NULL THEN s.contract_start
    WHEN s.contract_start IS NOT NULL
         AND date_trunc('month', s.contract_start) > date_trunc('month', s.lease_start)
         AND NOT EXISTS (
           SELECT 1 FROM public.tenant_charges tc
           JOIN public.lease_contracts lc ON lc.id = tc.contract_id
           WHERE lc.tenant_id = p_tenant_id AND tc.type = 'RENT'
             AND tc.due_date < date_trunc('month', s.contract_start)::date)
         AND NOT EXISTS (
           SELECT 1 FROM public.transactions t
           JOIN public.categories cat ON cat.id = t.category_id
           WHERE t.contact_id = p_tenant_id AND t.kind = 'REVENUE' AND t.status IN ('POSTED', 'RECONCILED')
             AND cat.code LIKE 'REV-RNT%'
             AND t.tx_date < date_trunc('month', s.contract_start)::date)
      THEN s.contract_start
    ELSE s.lease_start
  END
  FROM (
    SELECT
      (SELECT MIN(lc.start_date) FROM public.lease_contracts lc
       WHERE lc.tenant_id = p_tenant_id AND lc.status = 'ACTIVE') AS lease_start,
      (SELECT c.contract_start FROM public.contacts c WHERE c.id = p_tenant_id) AS contract_start
  ) s;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
