-- ============================================================
-- Migration: Connect Journal Entries to Contacts & Cashboxes
-- ============================================================

-- 1. Alter journal_lines to add contact_id and cashbox_id
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashbox_id uuid REFERENCES public.cashboxes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_contact ON public.journal_lines (contact_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_cashbox ON public.journal_lines (cashbox_id);

-- 2. Drop and recreate view journal_lines_with_categories to include contacts and cashboxes
DROP VIEW IF EXISTS public.journal_lines_with_categories;
CREATE VIEW public.journal_lines_with_categories AS
SELECT 
  jl.id,
  jl.journal_id,
  jl.category_id,
  jl.debit,
  jl.credit,
  jl.description,
  jl.sort_order,
  ac.code as category_code,
  ac.name_ar as category_name,
  ac.type as category_type,
  ac.kind as category_kind,
  ac.color as category_color,
  jl.contact_id,
  c.name as contact_name,
  c.kind as contact_kind,
  c.shop_number as contact_shop_number,
  jl.cashbox_id,
  cb.name_ar as cashbox_name_ar,
  cb.code as cashbox_code
FROM public.journal_lines jl
JOIN public.categories ac ON ac.id = jl.category_id
LEFT JOIN public.contacts c ON c.id = jl.contact_id
LEFT JOIN public.cashboxes cb ON cb.id = jl.cashbox_id;

-- 3. Recreate create_journal_entry
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
      (line->>'contact_id')::uuid,
      (line->>'cashbox_id')::uuid
    );
  END LOOP;

  RETURN new_journal_id::text;
END;
$$;

-- 4. Recreate update_journal_entry
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
      sort_order,
      contact_id,
      cashbox_id
    ) VALUES (
      p_journal_id,
      (line->>'category_id')::uuid,
      COALESCE((line->>'debit')::numeric, 0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0),
      (line->>'contact_id')::uuid,
      (line->>'cashbox_id')::uuid
    );
  END LOOP;
END;
$$;

-- 5. Recreate reverse_journal_entry
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
  INSERT INTO public.journal_lines (
    journal_id,
    category_id,
    debit,
    credit,
    description,
    sort_order,
    contact_id,
    cashbox_id
  )
  SELECT 
    new_journal_id,
    category_id,
    credit as debit,  -- Swap
    debit as credit,  -- Swap
    'Reversal: ' || COALESCE(description, ''),
    sort_order,
    contact_id,
    cashbox_id
  FROM public.journal_lines
  WHERE journal_id = p_journal_id::uuid;

  -- Mark new entry as posted
  UPDATE public.journal_entries
  SET posted_at = now()
  WHERE id = new_journal_id;

  RETURN new_journal_id::text;
END;
$$;

-- 6. Create get_journal_entries_filtered
CREATE OR REPLACE FUNCTION public.get_journal_entries_filtered(
  p_status text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_cashbox_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS SETOF public.journal_entries_with_totals
LANGUAGE plpgsql
SECURITY DEFINER
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
      p_search IS NULL OR
      je.reference ILIKE '%' || p_search || '%' OR
      je.description ILIKE '%' || p_search || '%' OR
      je.number::text ILIKE '%' || p_search || '%'
    )
  ORDER BY je.entry_date DESC, je.number DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_entries_filtered TO authenticated;
