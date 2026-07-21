-- ============================================================
-- Migration 059: أشهر بدون مطالبة — استبعاد من الملخصات والتقارير
-- لا تُحسب كغير مدفوعة، ومبالغها = 0 في سجل المستأجرين / AR
-- ============================================================

-- ── ملخص شهر اعتباطي (قائمة المستأجرين + PDF) ──
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
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.shop_number,
    c.floor,
    c.monthly_rent,
    c.phone,
    p_month_key AS current_month_key,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 0::numeric
      ELSE COALESCE(cur.month_amount, c.monthly_rent, 0)
    END AS current_month_amount,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 0::numeric
      ELSE COALESCE(cur.paid, 0)
    END AS current_month_paid,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 'exempt'
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
      AND NOT public.is_tenant_rent_month_exempt(
        c.id,
        to_char(tc.due_date, 'YYYY-MM')
      )
  ) open_ar ON TRUE
  WHERE c.kind = 'TENANT' AND c.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_rent_summary_for_month(text) TO authenticated;

-- ── ملخص الشهر الحالي ──
DROP VIEW IF EXISTS public.tenant_rent_summary;

CREATE VIEW public.tenant_rent_summary AS
SELECT
  c.id,
  c.name,
  c.shop_number,
  c.floor,
  c.monthly_rent,
  c.phone,
  to_char(CURRENT_DATE, 'YYYY-MM') AS current_month_key,
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM'))
      THEN 0::numeric
    ELSE COALESCE(cur.month_amount, c.monthly_rent, 0)
  END AS current_month_amount,
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM'))
      THEN 0::numeric
    ELSE COALESCE(cur.paid, 0)
  END AS current_month_paid,
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM')) THEN 'exempt'
    WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
    WHEN cur.charge_status = 'PAID'
      OR (COALESCE(cur.month_amount, c.monthly_rent, 0) > 0
        AND COALESCE(cur.paid, 0) >= COALESCE(cur.month_amount, c.monthly_rent, 0))
      THEN 'paid_full'
    WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
    WHEN COALESCE(cur.paid, 0) >= COALESCE(c.monthly_rent, 0) AND COALESCE(c.monthly_rent, 0) > 0
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
  COALESCE(open_ar.open_count, 0)::int AS open_charges_count,
  public.tenant_rent_claim_start(c.id) AS rent_claim_start
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
    AND tc.due_date >= DATE_TRUNC('month', CURRENT_DATE)::date
    AND tc.due_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
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
    AND NOT public.is_tenant_rent_month_exempt(
      c.id,
      to_char(tc.due_date, 'YYYY-MM')
    )
) open_ar ON TRUE
WHERE c.kind = 'TENANT' AND c.is_active = true;

GRANT SELECT ON public.tenant_rent_summary TO authenticated;

-- ── تقرير أعمار الذمم: استبعاد أشهر بدون مطالبة ──
CREATE OR REPLACE FUNCTION public.get_tenant_ar_aging(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH unpaid AS (
    SELECT
      lc.tenant_id,
      tc.amount - tc.total_paid AS outstanding,
      tc.due_date
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE tc.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      AND tc.amount > tc.total_paid
      AND NOT public.is_tenant_rent_month_exempt(
        lc.tenant_id,
        to_char(tc.due_date, 'YYYY-MM')
      )
  ),
  by_tenant AS (
    SELECT
      c.id AS tenant_id,
      c.name AS tenant_name,
      c.shop_number,
      c.phone,
      SUM(u.outstanding) AS total_outstanding,
      SUM(CASE WHEN u.due_date >= p_as_of THEN u.outstanding ELSE 0 END) AS bucket_current,
      SUM(CASE WHEN u.due_date < p_as_of AND u.due_date >= p_as_of - 30 THEN u.outstanding ELSE 0 END) AS bucket_30,
      SUM(CASE WHEN u.due_date < p_as_of - 30 AND u.due_date >= p_as_of - 60 THEN u.outstanding ELSE 0 END) AS bucket_60,
      SUM(CASE WHEN u.due_date < p_as_of - 60 THEN u.outstanding ELSE 0 END) AS bucket_90_plus
    FROM unpaid u
    JOIN public.contacts c ON c.id = u.tenant_id
    GROUP BY c.id, c.name, c.shop_number, c.phone
    HAVING SUM(u.outstanding) > 0
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'tenant_id', tenant_id,
        'tenant_name', tenant_name,
        'shop_number', shop_number,
        'phone', phone,
        'total_outstanding', total_outstanding,
        'bucket_current', bucket_current,
        'bucket_30', bucket_30,
        'bucket_60', bucket_60,
        'bucket_90_plus', bucket_90_plus
      ) ORDER BY total_outstanding DESC), '[]'::jsonb)
      FROM by_tenant
    ),
    'summary', jsonb_build_object(
      'total_outstanding', COALESCE((SELECT SUM(total_outstanding) FROM by_tenant), 0),
      'tenant_count', COALESCE((SELECT COUNT(*) FROM by_tenant), 0)
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_ar_aging(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
