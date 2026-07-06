-- ============================================================
-- Migration 043: موازنات مقابل الفعلي (Budget vs Actual)
-- ============================================================
-- موازنة شهرية بسيطة لكل بند (category) — تُقارَن بالفعلي من
-- transactions المرحّلة لحساب الفارق شهرياً أو سنوياً.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  year        int  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      numeric(18,3) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes       text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON public.budgets (year, month);

DO $$ BEGIN
  CREATE TRIGGER trg_budgets_updated
    BEFORE UPDATE ON public.budgets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- القراءة لكل موظف؛ الكتابة لـ owner/admin/accountant فقط (ليس cashier)
-- تماشياً مع صلاحية account.manage الحالية على البنود نفسها.
DROP POLICY IF EXISTS "read budgets" ON public.budgets;
CREATE POLICY "read budgets"
  ON public.budgets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage budgets" ON public.budgets;
CREATE POLICY "manage budgets"
  ON public.budgets FOR ALL TO authenticated
  USING (public.get_my_role() IN ('owner', 'admin', 'accountant'))
  WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'accountant'));

NOTIFY pgrst, 'reload schema';
