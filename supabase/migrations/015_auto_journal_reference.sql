-- Auto-generate journal reference when not provided (JY-YYYY-NNNNN)

CREATE OR REPLACE FUNCTION public.generate_journal_reference(p_entry_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM COALESCE(p_entry_date, CURRENT_DATE))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1
  INTO v_seq
  FROM public.journal_entries
  WHERE EXTRACT(YEAR FROM entry_date) = v_year;

  RETURN 'JY-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_next_journal_reference(p_entry_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.generate_journal_reference(p_entry_date);
$$;

GRANT EXECUTE ON FUNCTION public.generate_journal_reference(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_next_journal_reference(date) TO authenticated;

-- Recreate create_journal_entry with auto reference
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_reference text DEFAULT NULL,
  p_entry_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_journal_id uuid;
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
  v_reference text;
BEGIN
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry requires at least 2 lines';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    total_debit := total_debit + COALESCE((line->>'debit')::numeric, 0);
    total_credit := total_credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
  END IF;

  IF total_debit = 0 THEN
    RAISE EXCEPTION 'Journal entry must have non-zero amounts';
  END IF;

  v_reference := NULLIF(trim(p_reference), '');
  IF v_reference IS NULL THEN
    v_reference := public.generate_journal_reference(p_entry_date);
  END IF;

  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    v_reference,
    p_entry_date,
    p_description,
    p_notes,
    'DRAFT'
  )
  RETURNING id INTO new_journal_id;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF COALESCE((line->>'debit')::numeric, 0) = 0 AND COALESCE((line->>'credit')::numeric, 0) = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order,
      contact_id,
      cashbox_id
    ) VALUES (
      new_journal_id,
      (line->>'category_id')::uuid,
      COALESCE((line->>'debit')::numeric, 0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0),
      NULLIF(line->>'contact_id', '')::uuid,
      NULLIF(line->>'cashbox_id', '')::uuid
    );
  END LOOP;

  RETURN new_journal_id::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_journal_entry TO authenticated;
