-- ============================================================
-- Journal system upgrade: atomic references, drafts, integration
-- ============================================================

-- 1. Atomic per-year reference sequence (no duplicate JY-YYYY-NNNNN under concurrency)
CREATE TABLE IF NOT EXISTS public.journal_reference_sequences (
  year        int PRIMARY KEY,
  last_value  int NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

ALTER TABLE public.journal_reference_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_ref_seq authenticated read" ON public.journal_reference_sequences;
CREATE POLICY "journal_ref_seq authenticated read"
  ON public.journal_reference_sequences FOR SELECT TO authenticated
  USING (true);

-- Only functions mutate sequences (SECURITY DEFINER)
REVOKE INSERT, UPDATE, DELETE ON public.journal_reference_sequences FROM authenticated;
GRANT SELECT ON public.journal_reference_sequences TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_journal_reference(p_entry_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM COALESCE(p_entry_date, CURRENT_DATE))::int;
  v_seq  int;
BEGIN
  INSERT INTO public.journal_reference_sequences (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = public.journal_reference_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'JY-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_next_journal_reference(p_entry_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM COALESCE(p_entry_date, CURRENT_DATE))::int;
  v_next int;
BEGIN
  SELECT COALESCE(last_value, 0) + 1
  INTO v_next
  FROM public.journal_reference_sequences
  WHERE year = v_year;

  IF v_next IS NULL THEN
    SELECT COUNT(*)::int + 1 INTO v_next
    FROM public.journal_entries
    WHERE EXTRACT(YEAR FROM entry_date) = v_year;
  END IF;

  RETURN 'JY-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- 2. Form drafts (resume on mobile / desktop)
CREATE TABLE IF NOT EXISTS public.journal_form_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_form_drafts_user_updated
  ON public.journal_form_drafts (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_journal_form_drafts_updated ON public.journal_form_drafts;
CREATE TRIGGER trg_journal_form_drafts_updated
  BEFORE UPDATE ON public.journal_form_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.journal_form_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal drafts select own" ON public.journal_form_drafts;
DROP POLICY IF EXISTS "journal drafts insert own" ON public.journal_form_drafts;
DROP POLICY IF EXISTS "journal drafts update own" ON public.journal_form_drafts;
DROP POLICY IF EXISTS "journal drafts delete own" ON public.journal_form_drafts;

CREATE POLICY "journal drafts select own"
  ON public.journal_form_drafts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "journal drafts insert own"
  ON public.journal_form_drafts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal drafts update own"
  ON public.journal_form_drafts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal drafts delete own"
  ON public.journal_form_drafts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_form_drafts TO authenticated;

-- 3. Enriched list view (source linkage for system integration)
DROP VIEW IF EXISTS public.journal_summary CASCADE;
DROP VIEW IF EXISTS public.journal_entries_with_totals CASCADE;

CREATE OR REPLACE VIEW public.journal_entries_with_totals
WITH (security_invoker = true) AS
SELECT
  je.id,
  je.number,
  je.reference,
  je.status,
  je.entry_date,
  je.description,
  je.notes,
  je.posted_at,
  je.reversed_at,
  je.created_at,
  je.updated_at,
  je.source_type,
  je.source_id,
  je.reversal_of_entry_id,
  je.period_id,
  COALESCE(SUM(jl.debit), 0)  AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  COUNT(jl.id)                AS line_count
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.journal_id = je.id
GROUP BY
  je.id, je.number, je.reference, je.status, je.entry_date,
  je.description, je.notes, je.posted_at, je.reversed_at,
  je.created_at, je.updated_at, je.source_type, je.source_id,
  je.reversal_of_entry_id, je.period_id;

CREATE OR REPLACE VIEW public.journal_summary
WITH (security_invoker = true) AS
SELECT
  COUNT(*)::int AS total_entries,
  COUNT(*) FILTER (WHERE status = 'POSTED')::int AS posted_entries,
  COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft_entries,
  COUNT(*) FILTER (WHERE status = 'REVERSED')::int AS reversed_entries,
  COALESCE(SUM(total_debit) FILTER (WHERE status = 'POSTED'), 0) AS total_debit,
  COALESCE(SUM(total_credit) FILTER (WHERE status = 'POSTED'), 0) AS total_credit,
  COUNT(*) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE))::int AS current_month_entries
FROM public.journal_entries_with_totals;

GRANT SELECT ON public.journal_entries_with_totals TO authenticated;
GRANT SELECT ON public.journal_summary TO authenticated;

-- 4. Duplicate entry as new DRAFT (copy lines)
CREATE OR REPLACE FUNCTION public.duplicate_journal_entry(p_journal_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig public.journal_entries%ROWTYPE;
  v_lines jsonb := '[]'::jsonb;
  r record;
BEGIN
  SELECT * INTO v_orig FROM public.journal_entries WHERE id = p_journal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  FOR r IN
    SELECT category_id, debit, credit, description, sort_order, contact_id, cashbox_id
    FROM public.journal_lines
    WHERE journal_id = p_journal_id
    ORDER BY sort_order
  LOOP
    IF COALESCE(r.debit, 0) = 0 AND COALESCE(r.credit, 0) = 0 THEN
      CONTINUE;
    END IF;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'category_id', r.category_id,
        'debit', r.debit,
        'credit', r.credit,
        'description', r.description,
        'sort_order', r.sort_order,
        'contact_id', r.contact_id,
        'cashbox_id', r.cashbox_id
      )
    );
  END LOOP;

  IF jsonb_array_length(v_lines) < 2 THEN
    RAISE EXCEPTION 'Cannot duplicate: entry has fewer than 2 valid lines';
  END IF;

  RETURN public.create_journal_entry(
    NULL,
    CURRENT_DATE,
    COALESCE(v_orig.description, '') || ' (نسخة)',
    v_orig.notes,
    v_lines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_journal_reference(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_next_journal_reference(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_journal_entry(uuid) TO authenticated;
