-- ============================================================
-- Migration 071: إصلاح get_journal_lines_for_period
-- ============================================================
-- السبب: journal_entries.number من نوع bigint بينما RETURNS TABLE
-- عرّف journal_number كـ integer → ERROR 42804 عند استدعاء الدالة
-- (تعذّر بناء قيد الفترة في الواجهة).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_journal_lines_for_period(date, date, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_journal_lines_for_period(
  p_start_date date,
  p_end_date date,
  p_status text DEFAULT 'POSTED',
  p_category_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50000
)
RETURNS TABLE (
  journal_id uuid,
  journal_number bigint,
  entry_date date,
  journal_reference text,
  journal_description text,
  journal_status text,
  line_id uuid,
  category_id uuid,
  category_code text,
  category_name text,
  category_type text,
  debit numeric,
  credit numeric,
  description text,
  sort_order integer,
  cashbox_id uuid,
  cashbox_name_ar text,
  cashbox_code text,
  cashbox_kind text,
  contact_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  RETURN QUERY
  WITH period_journals AS (
    SELECT je.id
    FROM public.journal_entries je
    WHERE je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND (
        p_status IS NULL
        OR btrim(p_status) = ''
        OR btrim(p_status) = 'ALL'
        OR je.status::text = p_status
      )
      AND (
        p_category_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.journal_lines jl0
          WHERE jl0.journal_id = je.id
            AND jl0.category_id = p_category_id
        )
      )
  )
  SELECT
    je.id AS journal_id,
    je.number AS journal_number,
    je.entry_date,
    je.reference AS journal_reference,
    je.description AS journal_description,
    je.status::text AS journal_status,
    jl.id AS line_id,
    jl.category_id,
    ac.code AS category_code,
    ac.name_ar AS category_name,
    ac.type::text AS category_type,
    jl.debit,
    jl.credit,
    jl.description,
    jl.sort_order,
    jl.cashbox_id,
    cb.name_ar AS cashbox_name_ar,
    cb.code AS cashbox_code,
    cb.kind::text AS cashbox_kind,
    c.name AS contact_name
  FROM period_journals pj
  JOIN public.journal_entries je ON je.id = pj.id
  JOIN public.journal_lines jl ON jl.journal_id = je.id
  JOIN public.categories ac ON ac.id = jl.category_id
  LEFT JOIN public.cashboxes cb ON cb.id = jl.cashbox_id
  LEFT JOIN public.contacts c ON c.id = jl.contact_id
  ORDER BY je.entry_date ASC, je.number ASC, jl.sort_order ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 100000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date, date, text, uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_journal_lines_for_period(date, date, text, uuid, integer) IS
  'بنود قيود الفترة — journal_number = bigint ليطابق journal_entries.number';

NOTIFY pgrst, 'reload schema';
