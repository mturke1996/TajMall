-- ============================================================
-- Fluxen — Create Journal Entry Tables (Missing from initial schema)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. CREATE JOURNAL STATUS ENUM
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE journal_status AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. CREATE JOURNAL ENTRIES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number        bigserial UNIQUE,
  reference     text,
  status        journal_status NOT NULL DEFAULT 'DRAFT',
  entry_date    date NOT NULL DEFAULT CURRENT_DATE,
  description   text,
  notes         text,
  posted_at     timestamptz,
  reversed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 3. CREATE JOURNAL LINES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id    uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  debit         numeric(18,3) NOT NULL DEFAULT 0,
  credit        numeric(18,3) NOT NULL DEFAULT 0,
  description   text,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON public.journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_category ON public.journal_lines (category_id);

-- ──────────────────────────────────────────────────────────────
-- 5. UPDATED_AT TRIGGER FOR JOURNAL ENTRIES
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_journal_entries_updated 
    BEFORE UPDATE ON public.journal_entries 
    FOR EACH ROW 
    EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth full access journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "auth full access journal_lines" ON public.journal_lines;

CREATE POLICY "auth full access journal_entries" 
  ON public.journal_entries 
  FOR ALL TO authenticated 
  USING (true) WITH CHECK (true);

CREATE POLICY "auth full access journal_lines" 
  ON public.journal_lines 
  FOR ALL TO authenticated 
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 7. GRANT PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_lines TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.journal_entries_number_seq TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 8. INITIAL VIEWS (will be recreated fully in migration 006)
-- ──────────────────────────────────────────────────────────────
-- These are minimal versions to get things working immediately

-- Drop existing views if they exist to avoid conflicts
DROP VIEW IF EXISTS public.journal_entries_with_totals CASCADE;
DROP VIEW IF EXISTS public.journal_lines_with_categories CASCADE;
DROP VIEW IF EXISTS public.journal_summary CASCADE;

-- Recreate views
CREATE OR REPLACE VIEW public.journal_entries_with_totals AS
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
  COALESCE(SUM(jl.debit), 0) as total_debit,
  COALESCE(SUM(jl.credit), 0) as total_credit,
  COUNT(jl.id) as line_count
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.journal_id = je.id
GROUP BY je.id, je.number, je.reference, je.status, je.entry_date, 
         je.description, je.notes, je.posted_at, je.reversed_at, je.created_at, je.updated_at;

CREATE OR REPLACE VIEW public.journal_lines_with_categories AS
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
  ac.color as category_color
FROM public.journal_lines jl
JOIN public.categories ac ON ac.id = jl.category_id;

CREATE OR REPLACE VIEW public.journal_summary AS
SELECT 
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE status = 'POSTED') as posted_entries,
  COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_entries,
  COUNT(*) FILTER (WHERE status = 'REVERSED') as reversed_entries,
  COALESCE(SUM(total_debit) FILTER (WHERE status = 'POSTED'), 0) as total_debit,
  COALESCE(SUM(total_credit) FILTER (WHERE status = 'POSTED'), 0) as total_credit,
  COUNT(*) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)) as current_month_entries
FROM public.journal_entries_with_totals;

-- Grant access to views
GRANT SELECT ON public.journal_entries_with_totals TO authenticated;
GRANT SELECT ON public.journal_lines_with_categories TO authenticated;
GRANT SELECT ON public.journal_summary TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 9. ENABLE REALTIME
-- ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_lines;

-- ============================================================
-- DONE: Journal tables are now ready!
-- ============================================================
