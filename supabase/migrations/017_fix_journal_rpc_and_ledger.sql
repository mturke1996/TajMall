-- Fix missing RPC + general ledger query (PostgREST schema cache)

-- Drop any old signatures
DROP FUNCTION IF EXISTS public.get_journal_entries_filtered(text, uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_journal_entries_filtered(uuid, uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.get_journal_entries_filtered(
  p_status text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_cashbox_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.journal_entries_with_totals
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT je.*
  FROM public.journal_entries_with_totals je
  LEFT JOIN public.journal_lines jl ON jl.journal_id = je.id
  WHERE
    (p_status IS NULL OR je.status::text = p_status)
    AND (p_contact_id IS NULL OR jl.contact_id = p_contact_id)
    AND (p_cashbox_id IS NULL OR jl.cashbox_id = p_cashbox_id)
    AND (
      p_search IS NULL OR btrim(p_search) = '' OR
      je.reference ILIKE '%' || p_search || '%' OR
      je.description ILIKE '%' || p_search || '%' OR
      je.number::text ILIKE '%' || p_search || '%'
    )
  ORDER BY je.entry_date DESC, je.number DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_entries_filtered(text, uuid, uuid, text, integer) TO authenticated;

-- General ledger lines (replaces broken nested PostgREST filter)
DROP FUNCTION IF EXISTS public.get_general_ledger_lines(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_general_ledger_lines(
  p_category_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  debit numeric(18,3),
  credit numeric(18,3),
  line_description text,
  entry_date date,
  journal_number bigint,
  journal_reference text,
  journal_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jl.debit,
    jl.credit,
    jl.description,
    je.entry_date,
    je.number,
    je.reference,
    je.id
  FROM public.journal_lines jl
  INNER JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE jl.category_id = p_category_id
    AND je.status::text = 'POSTED'
    AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
    AND (p_end_date IS NULL OR je.entry_date <= p_end_date)
  ORDER BY je.entry_date ASC, je.number ASC, jl.sort_order ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_general_ledger_lines(uuid, date, date) TO authenticated;

-- Refresh PostgREST schema cache (Supabase)
NOTIFY pgrst, 'reload schema';
