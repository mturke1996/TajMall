-- ============================================================
-- Parameterized tenant rent summary for ANY month (YYYY-MM)
-- Replicates tenant_rent_summary view logic but for an arbitrary
-- month instead of CURRENT_DATE. Called via RPC from the tenants
-- list month picker so the paid/unpaid status always matches the
-- database's own source of truth.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tenant_rent_summary_for_month(p_month_key text)
RETURNS TABLE (
  id uuid,
  name text,
  shop_number text,
  floor text,
  monthly_rent numeric,
  phone text,
  current_month_key text,
  current_month_amount numeric,
  current_month_paid numeric,
  current_month_status text,
  total_rent_paid numeric,
  rent_linked_journals_count int,
  journal_entries_count int,
  last_12_months_revenue numeric,
  total_balance numeric,
  open_charges_total numeric,
  open_charges_count int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.name,
    c.shop_number,
    c.floor,
    c.monthly_rent,
    c.phone,
    p_month_key AS current_month_key,
    COALESCE(cur.month_amount, c.monthly_rent, 0) AS current_month_amount,
    COALESCE(cur.paid, 0) AS current_month_paid,
    CASE
      WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
      WHEN cur.charge_status = 'PAID'
        OR (COALESCE(cur.month_amount, c.monthly_rent, 0) > 0
          AND COALESCE(cur.paid, 0) >= COALESCE(cur.month_amount, c.monthly_rent, 0))
        THEN 'paid_full'
      WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
      WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
      WHEN COALESCE(cur.paid, 0) >= COALESCE(c.monthly_rent, 0)
        AND COALESCE(c.monthly_rent, 0) > 0
        THEN 'paid_full'
      WHEN COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
      ELSE 'unpaid'
    END AS current_month_status,
    COALESCE(rent_paid.total_rent_paid, 0) AS total_rent_paid,
    COALESCE(rent_je.cnt, 0)::int AS rent_linked_journals_count,
    COALESCE(all_je.cnt, 0)::int AS journal_entries_count,
    COALESCE(
      (
        SELECT SUM(t.amount)
        FROM public.transactions t
        INNER JOIN public.categories cat ON cat.id = t.category_id
        WHERE t.contact_id = c.id
          AND t.kind = 'REVENUE'
          AND t.status = 'POSTED'
          AND cat.code LIKE 'REV-RNT%'
          AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
      ),
      0
    ) AS last_12_months_revenue,
    (
      COALESCE(
        (
          SELECT SUM(t.amount)
          FROM public.transactions t
          INNER JOIN public.categories cat ON cat.id = t.category_id
          WHERE t.contact_id = c.id
            AND t.kind = 'REVENUE'
            AND t.status = 'POSTED'
            AND cat.code LIKE 'REV-RNT%'
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(tc.amount)
          FROM public.tenant_charges tc
          INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
          WHERE lc.tenant_id = c.id
            AND tc.type = 'RENT'
            AND tc.status = 'PAID'
        ),
        0
      )
    ) AS total_balance,
    COALESCE(open_ar.open_total, 0) AS open_charges_total,
    COALESCE(open_ar.open_count, 0)::int AS open_charges_count
  FROM public.contacts c
  LEFT JOIN LATERAL (
    SELECT
      tc.status AS charge_status,
      tc.total_paid AS paid,
      tc.amount AS month_amount
    FROM public.tenant_charges tc
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = c.id
      AND tc.type = 'RENT'
      AND to_char(tc.due_date, 'YYYY-MM') = p_month_key
    ORDER BY tc.due_date DESC
    LIMIT 1
  ) cur ON TRUE
  LEFT JOIN LATERAL (
    SELECT SUM(tc.total_paid) AS total_rent_paid
    FROM public.tenant_charges tc
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = c.id
      AND tc.type = 'RENT'
  ) rent_paid ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT trjl.journal_entry_id) AS cnt
    FROM public.tenant_rent_journal_links trjl
    INNER JOIN public.tenant_charges tc ON tc.id = trjl.charge_id
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
    WHERE lc.tenant_id = c.id
      AND je.status IN ('POSTED', 'DRAFT')
  ) rent_je ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT jl.journal_id) AS cnt
    FROM public.journal_lines jl
    INNER JOIN public.journal_entries je ON je.id = jl.journal_id
    WHERE jl.contact_id = c.id
      AND je.status IN ('POSTED', 'DRAFT')
  ) all_je ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      SUM(GREATEST(tc.amount - tc.total_paid, 0)) AS open_total,
      COUNT(*)::int AS open_count
    FROM public.tenant_charges tc
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = c.id
      AND tc.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      AND tc.amount > tc.total_paid
  ) open_ar ON TRUE
  WHERE c.kind = 'TENANT' AND c.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_rent_summary_for_month(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
