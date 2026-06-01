-- ============================================================
-- Migration: Fix Journal Entry RPC Types
-- ============================================================

-- Fix create_journal_entry
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
AS $$
DECLARE
  new_journal_id uuid;
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
BEGIN
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

  -- Insert journal entry
  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    p_reference,
    p_entry_date,
    p_description,
    p_notes,
    'DRAFT'
  )
  RETURNING id INTO new_journal_id;

  -- Insert journal lines
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
      new_journal_id,
      (line->>'category_id')::uuid,
      COALESCE((line->>'debit')::numeric, 0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0)
    );
  END LOOP;

  RETURN new_journal_id::text;
END;
$$;

-- Fix post_journal_entry
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_journal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status journal_status;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  -- Check current status
  SELECT status, total_debit, total_credit 
  INTO v_status, v_total_debit, v_total_credit
  FROM public.journal_entries_with_totals 
  WHERE id = p_journal_id::uuid;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft entries can be posted';
  END IF;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'Cannot post unbalanced entry';
  END IF;

  -- Update status
  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now()
  WHERE id = p_journal_id::uuid;
END;
$$;

-- Fix reverse_journal_entry
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  original record;
  new_journal_id uuid;
BEGIN
  -- Get original entry
  SELECT * INTO original
  FROM public.journal_entries
  WHERE id = p_journal_id::uuid AND status = 'POSTED';

  IF original IS NULL THEN
    RAISE EXCEPTION 'Posted journal entry not found';
  END IF;

  -- Mark original as reversed
  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = p_journal_id::uuid;

  -- Create reversed entry (swap debits and credits)
  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    COALESCE(original.reference, '') || ' (Reversal)',
    CURRENT_DATE,
    'Reversal of entry #' || original.number || ': ' || COALESCE(original.description, ''),
    'Auto-generated reversal',
    'POSTED'
  )
  RETURNING id INTO new_journal_id;

  -- Create reversed lines
  INSERT INTO public.journal_lines (journal_id, category_id, debit, credit, description, sort_order)
  SELECT 
    new_journal_id,
    category_id,
    credit as debit,  -- Swap
    debit as credit,  -- Swap
    'Reversal: ' || COALESCE(description, ''),
    sort_order
  FROM public.journal_lines
  WHERE journal_id = p_journal_id::uuid;

  -- Mark new entry as posted
  UPDATE public.journal_entries
  SET posted_at = now()
  WHERE id = new_journal_id;

  RETURN new_journal_id::text;
END;
$$;
