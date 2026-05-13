-- ============================================================
-- Fluxen — Customers, Tenants, Employees & Transaction Links
-- ============================================================
-- Run after 003_transactions_creator_fk_profiles.sql

-- ──────────────────────────────────────────────────────────────
-- 1. CREATE TYPE FOR CUSTOMER KIND
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE contact_kind AS ENUM ('CUSTOMER', 'TENANT', 'EMPLOYEE', 'VENDOR', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. CONTACTS TABLE (Customers, Tenants, Employees, Vendors)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE,              -- Optional internal code
  kind            contact_kind NOT NULL DEFAULT 'CUSTOMER',
  name            text NOT NULL,            -- Full name in Arabic
  name_en         text,                     -- English name (optional)
  phone           text,
  phone2          text,
  email           text,
  address         text,
  id_number       text,                     -- National ID / CR
  tax_number      text,                     -- Tax registration
  -- For tenants (shops/units)
  shop_number     text,                     -- Shop/unit number in mall
  floor           text,                     -- Floor number
  area_sqm        numeric(10,2),            -- Area in square meters
  contract_start  date,
  contract_end    date,
  monthly_rent    numeric(18,3),            -- Fixed monthly rent amount
  -- For employees
  job_title       text,                     -- المسمى الوظيفي
  department      text,                     -- القسم
  hire_date       date,
  salary          numeric(18,3),             -- الراتب الشهري
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 3. INDEXES FOR CONTACTS
-- ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_kind ON public.contacts (kind);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_shop ON public.contacts (shop_number) WHERE shop_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_active ON public.contacts (is_active);

-- ──────────────────────────────────────────────────────────────
-- 4. ADD CONTACT REFERENCE TO TRANSACTIONS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_type text; -- 'PAYER' | 'RECEIVER' | 'BENEFICIARY'

CREATE INDEX IF NOT EXISTS idx_transactions_contact ON public.transactions (contact_id);

-- ──────────────────────────────────────────────────────────────
-- 5. UPDATE TRIGGER FOR CONTACTS
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ──────────────────────────────────────────────────────────────
-- 6. RLS POLICIES FOR CONTACTS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select contacts" ON public.contacts;
DROP POLICY IF EXISTS "auth insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "auth update contacts" ON public.contacts;
DROP POLICY IF EXISTS "auth delete contacts" ON public.contacts;

CREATE POLICY "auth select contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete contacts" ON public.contacts FOR DELETE TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- 7. SEED SAMPLE DATA (optional - remove if not needed)
-- ──────────────────────────────────────────────────────────────
-- Sample tenants
INSERT INTO public.contacts (kind, name, shop_number, floor, area_sqm, monthly_rent, phone) VALUES
  ('TENANT', 'محل الأناقة للأزياء', 'A-101', '1', 45.50, 2500.000, '091-1234567'),
  ('TENANT', 'مطعم الشامي', 'A-205', '2', 120.00, 6000.000, '092-2345678'),
  ('TENANT', 'صيدلية النور', 'B-105', '1', 35.00, 1800.000, '091-3456789'),
  ('TENANT', 'مكتبة العلم', 'C-301', '3', 55.00, 2200.000, '092-4567890')
ON CONFLICT DO NOTHING;

-- Sample employees
INSERT INTO public.contacts (kind, name, job_title, department, phone, salary) VALUES
  ('EMPLOYEE', 'أحمد محمد', 'أمين صندوق', 'المالية', '091-1111111', 3500.000),
  ('EMPLOYEE', 'خالد عمر', 'حارس أمن', 'الأمن', '091-2222222', 2500.000),
  ('EMPLOYEE', 'فاطمة علي', 'موظفة استقبال', 'الإدارة', '091-3333333', 3000.000)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 8. VIEW FOR ACTIVE TENANTS WITH RENT STATUS
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.tenants_rent_status AS
SELECT 
  c.*,
  COALESCE(
    (SELECT SUM(t.amount) 
     FROM public.transactions t 
     WHERE t.contact_id = c.id 
       AND t.kind = 'REVENUE' 
       AND t.category_id IN (SELECT id FROM public.categories WHERE code LIKE 'REV-RNT%')
       AND DATE_TRUNC('month', t.tx_date) = DATE_TRUNC('month', CURRENT_DATE)
    ), 0
  ) as rent_paid_this_month,
  CASE 
    WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
    WHEN COALESCE(
      (SELECT SUM(t.amount) 
       FROM public.transactions t 
       WHERE t.contact_id = c.id 
         AND t.kind = 'REVENUE' 
         AND t.category_id IN (SELECT id FROM public.categories WHERE code LIKE 'REV-RNT%')
         AND DATE_TRUNC('month', t.tx_date) = DATE_TRUNC('month', CURRENT_DATE)
      ), 0
    ) >= c.monthly_rent THEN 'paid'
    ELSE 'unpaid'
  END as rent_status
FROM public.contacts c
WHERE c.kind = 'TENANT' AND c.is_active = true;
