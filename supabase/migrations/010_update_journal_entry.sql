-- ============================================================
-- Migration: Update Journal Entry RPC Function
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_journal_entry(
  p_journal_id uuid,
  p_reference text DEFAULT NULL,
  p_entry_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
  v_status journal_status;
BEGIN
  -- Verify the entry exists and is in DRAFT status
  SELECT status INTO v_status
  FROM public.journal_entries
  WHERE id = p_journal_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft entries can be updated';
  END IF;

  -- Validate lines array
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry requires at least 2 lines';
  END IF;

  -- Calculate totals
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    total_debit := total_debit + COALESCE((line->>'debit')::numeric, 0);
    total_credit := total_credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  -- Check balance
  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
  END IF;

  IF total_debit = 0 THEN
    RAISE EXCEPTION 'Journal entry must have non-zero amounts';
  END IF;

  -- Update journal entry header
  UPDATE public.journal_entries
  SET
    reference = p_reference,
    entry_date = p_entry_date,
    description = p_description,
    notes = p_notes,
    updated_at = now()
  WHERE id = p_journal_id;

  -- Delete existing lines
  DELETE FROM public.journal_lines
  WHERE journal_id = p_journal_id;

  -- Insert new lines
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF COALESCE((line->>'debit')::numeric, 0) = 0 AND COALESCE((line->>'credit')::numeric, 0) = 0 THEN
      CONTINUE; -- Skip zero lines
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order
    ) VALUES (
      p_journal_id,
      (line->>'category_id')::uuid,
      COALESCE((line->>'debit')::numeric, 0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0)
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_journal_entry TO authenticated;
