-- تقرير يومية الشهر: جلب القيود حسب فترة تاريخية بدقة محاسبية

CREATE OR REPLACE FUNCTION public.get_journal_entries_for_period(
  p_start_date date,
  p_end_date date,
  p_status text DEFAULT 'POSTED',
  p_limit integer DEFAULT 2000
)
RETURNS SETOF public.journal_entries_with_totals
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
  SELECT je.*
  FROM public.journal_entries_with_totals je
  WHERE
    je.entry_date >= p_start_date
    AND je.entry_date <= p_end_date
    AND (
      p_status IS NULL
      OR btrim(p_status) = ''
      OR btrim(p_status) = 'ALL'
      OR je.status::text = p_status
    )
  ORDER BY je.entry_date ASC, je.number ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2000), 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date, date, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_journal_entries_for_period(date, date, text, integer) IS
  'قيود اليومية لفترة محددة — مرتبة زمنياً لتقارير الشهر المحاسبية';
