-- ============================================================
-- Fluxen — Initial schema for Supabase (Taj Mall workspace)
-- ============================================================
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query
--   Paste this entire file → Run
--
-- DESIGN:
--   Shared single-workspace model. Any authenticated user can read
--   and write all data — appropriate for one business with multiple
--   employees. Switch to multi-tenant later by adding `org_id` and
--   tightening the RLS policies.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE tx_kind AS ENUM ('REVENUE','EXPENSE','TRANSFER','OPENING','ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tx_status AS ENUM ('DRAFT','POSTED','VOIDED','RECONCILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('CASH','CHEQUE','TRANSFER','CARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE cashbox_kind AS ENUM ('CASH','BANK','CARD','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  full_name_ar text,
  role        text DEFAULT 'member',   -- owner | admin | accountant | cashier | viewer
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  name_ar     text,
  address     text,
  phone       text,
  is_hq       boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  name_ar     text NOT NULL,
  kind        tx_kind NOT NULL,             -- REVENUE | EXPENSE
  type        account_type NOT NULL,
  color       text,
  icon        text,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cashboxes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  name_ar         text NOT NULL,
  kind            cashbox_kind NOT NULL,
  currency        text NOT NULL DEFAULT 'LYD',
  bank_name       text,
  account_number  text,
  iban            text,
  opening_balance numeric(18,3) NOT NULL DEFAULT 0,
  color           text,
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number        bigserial UNIQUE,
  reference     text,
  kind          tx_kind        NOT NULL,
  status        tx_status      NOT NULL DEFAULT 'POSTED',
  method        payment_method NOT NULL,
  amount        numeric(18,3)  NOT NULL CHECK (amount > 0),
  currency      text           NOT NULL DEFAULT 'LYD',
  tx_date       date           NOT NULL DEFAULT CURRENT_DATE,
  description   text,
  notes         text,
  cheque_number text,
  cheque_bank   text,
  cheque_date   date,
  category_id   uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  cashbox_id    uuid REFERENCES public.cashboxes(id)  ON DELETE RESTRICT,
  branch_id     uuid REFERENCES public.branches(id)   ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users(id)        ON DELETE SET NULL,
  posted_at     timestamptz,
  voided_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_tx_date    ON public.transactions (tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_kind       ON public.transactions (kind);
CREATE INDEX IF NOT EXISTS idx_transactions_cashbox    ON public.transactions (cashbox_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch     ON public.transactions (branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created    ON public.transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_categories_kind         ON public.categories (kind, sort_order);
CREATE INDEX IF NOT EXISTS idx_cashboxes_kind          ON public.cashboxes (kind);

-- ──────────────────────────────────────────────────────────────
-- 4. updated_at TRIGGERS
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_profiles_updated     BEFORE UPDATE ON public.profiles     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_branches_updated     BEFORE UPDATE ON public.branches     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_categories_updated   BEFORE UPDATE ON public.categories   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_cashboxes_updated    BEFORE UPDATE ON public.cashboxes    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 5. AUTO-CREATE PROFILE on auth.users insert
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, full_name_ar)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'full_name_ar')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 6. ROW-LEVEL SECURITY
--    Shared workspace: any authenticated user can CRUD all rows.
--    Profiles: each user can read all, but only update their own.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashboxes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read profiles"  ON public.profiles;
DROP POLICY IF EXISTS "self update profiles" ON public.profiles;
DROP POLICY IF EXISTS "self insert profiles" ON public.profiles;
CREATE POLICY "auth read profiles"    ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profiles"  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "self insert profiles"  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Helper: same RLS for the shared tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','categories','cashboxes','transactions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth select %1$s" ON public.%1$s;',    t);
    EXECUTE format('DROP POLICY IF EXISTS "auth insert %1$s" ON public.%1$s;',    t);
    EXECUTE format('DROP POLICY IF EXISTS "auth update %1$s" ON public.%1$s;',    t);
    EXECUTE format('DROP POLICY IF EXISTS "auth delete %1$s" ON public.%1$s;',    t);

    EXECUTE format('CREATE POLICY "auth select %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "auth insert %1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "auth update %1$s" ON public.%1$s FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "auth delete %1$s" ON public.%1$s FOR DELETE TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 7. SEED — default categories & cashboxes for Taj Mall
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.branches (code, name, name_ar, is_hq, active)
VALUES ('HQ', 'Taj Mall HQ', 'الإدارة العامة - تاج مول', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  -- Revenue
  ('REV-GEN', 'General revenue',      'إيرادات عامة',    'REVENUE', 'REVENUE', '#3E4D34', 1),
  ('REV-SUP', 'Treasury support',     'دعم الخزينة',     'REVENUE', 'REVENUE', '#536647', 2),
  ('REV-AST', 'Sale of fixed assets', 'بيع أصول ثابتة',  'REVENUE', 'REVENUE', '#74866A', 3),
  ('REV-OTH', 'Other revenue',        'إيرادات أخرى',    'REVENUE', 'REVENUE', '#9CAB91', 4),
  -- Expense
  ('EXP-AST', 'Fixed assets',         'م.أصول ثابتة',          'EXPENSE', 'EXPENSE', '#8A2F2D', 10),
  ('EXP-SAL', 'Salaries',             'م.مرتبات',               'EXPENSE', 'EXPENSE', '#7A5C0F', 11),
  ('EXP-FST', 'Festivals',            'م.مهرجانات',             'EXPENSE', 'EXPENSE', '#5E3A66', 12),
  ('EXP-MNT', 'Maintenance',          'م.صيانة وقطع غيار',     'EXPENSE', 'EXPENSE', '#1F4F73', 13),
  ('EXP-CLN', 'Cleaning',             'م.نظافة',                'EXPENSE', 'EXPENSE', '#0F6B7A', 14),
  ('EXP-CON', 'Consumables',          'م.مواد مستهلكة',         'EXPENSE', 'EXPENSE', '#7A3E5C', 15),
  ('EXP-MAT', 'Materials',            'م.مواد ومهمات',          'EXPENSE', 'EXPENSE', '#9F2F2D', 16),
  ('EXP-LBR', 'Casual labor',         'م.عمالة عارضة',          'EXPENSE', 'EXPENSE', '#A85E66', 17),
  ('EXP-RNT', 'Rent expenses',        'م.مصاريف إيجارات',      'EXPENSE', 'EXPENSE', '#8B5A1E', 18),
  ('EXP-CAF', 'Café & hospitality',   'م.مقهى وضيافة',          'EXPENSE', 'EXPENSE', '#956400', 19),
  ('EXP-WTR', 'Water',                'م.مياه',                  'EXPENSE', 'EXPENSE', '#1F6C9F', 20),
  ('EXP-ELC', 'Electricity',          'م.كهرباء',                'EXPENSE', 'EXPENSE', '#A47A0D', 21),
  ('EXP-EQP', 'Equipment',            'م.تجهيزات',               'EXPENSE', 'EXPENSE', '#586B5A', 22),
  ('EXP-BNK', 'Bank fees',            'م.عمولة مصرفية',         'EXPENSE', 'EXPENSE', '#4F4E7A', 23),
  ('EXP-OTH', 'Other',                'م.أخرى',                  'EXPENSE', 'EXPENSE', '#6E7470', 99)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.cashboxes (code, name, name_ar, kind, bank_name, color, currency) VALUES
  ('CASH',    'Main cashbox',         'الخزينة النقدية',         'CASH', NULL,                  '#3E4D34', 'LYD'),
  ('BNK-JUM', 'Jumhouria Bank',       'مصرف الجمهورية',          'BANK', 'Jumhouria',           '#1F4F73', 'LYD'),
  ('BNK-WHA', 'Wahda Bank',           'مصرف الواحة',              'BANK', 'Wahda',                '#7A5C0F', 'LYD'),
  ('BNK-LIB', 'Libyan Islamic Bank',  'مصرف الليبي الإسلامي',   'BANK', 'Libyan Islamic',       '#5E3A66', 'LYD')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 8. CASHBOX BALANCE VIEW (computed)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.cashbox_balances AS
SELECT
  c.id,
  c.code,
  c.name_ar,
  c.kind,
  c.bank_name,
  c.color,
  c.currency,
  c.opening_balance
    + COALESCE(SUM(CASE WHEN t.kind = 'REVENUE' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.kind = 'EXPENSE' THEN t.amount ELSE 0 END), 0)
    AS balance,
  COUNT(t.id) FILTER (WHERE t.tx_date >= date_trunc('month', CURRENT_DATE)) AS tx_count_month,
  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'REVENUE' AND t.tx_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_inflow,
  COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'EXPENSE' AND t.tx_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_outflow
FROM public.cashboxes c
LEFT JOIN public.transactions t
  ON t.cashbox_id = c.id AND t.status = 'POSTED'
GROUP BY c.id;

GRANT SELECT ON public.cashbox_balances TO authenticated, anon;

-- Done.
