-- ROLLBACK for 084 — restores tenant_rent_claim_start() as migration 056 defined it:
-- the earliest ACTIVE lease start, otherwise the card's contract_start. No data is touched.
BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_rent_claim_start(p_tenant_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT MIN(lc.start_date)
      FROM public.lease_contracts lc
      WHERE lc.tenant_id = p_tenant_id
        AND lc.status = 'ACTIVE'
    ),
    (
      SELECT c.contract_start
      FROM public.contacts c
      WHERE c.id = p_tenant_id
    )
  );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
