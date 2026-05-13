-- ============================================================
-- Fluxen — Mall revenue categories + profile administration RLS
-- ============================================================
-- Run after 001_init.sql (Dashboard SQL Editor or supabase db push).

-- ── Align legacy default role with UI roles ───────────────────
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'viewer';

UPDATE public.profiles
SET role = 'viewer'
WHERE coalesce(trim(role), '') IN ('', 'member')
   OR coalesce(role, '') NOT IN ('owner', 'admin', 'accountant', 'cashier', 'viewer');

-- ── RLS: owners & admins may manage team profiles ───────────
DROP POLICY IF EXISTS "admin update any profile" ON public.profiles;
CREATE POLICY "admin update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

-- ── Mall-focused revenue categories (إيجارات، مواقف، خدمات…) ─
INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  ('REV-RNT', 'Shop & unit rent',       'إيجارات المحلات والوحدات',     'REVENUE', 'REVENUE', '#4A5D3F', 5),
  ('REV-PRK', 'Parking revenue',        'إيرادات مواقف السيارات',      'REVENUE', 'REVENUE', '#5A6B4E', 6),
  ('REV-SVC', 'Service & CAM charges',  'رسوم خدمات ومرافق مشتركة',    'REVENUE', 'REVENUE', '#677A59', 7),
  ('REV-ADV', 'Ads & facade rent',      'إعلانات وإيجار واجهات',       'REVENUE', 'REVENUE', '#75866A', 8),
  ('REV-KSK', 'Kiosks & carts',         'أكشاك وعربات ونقاط بيع',      'REVENUE', 'REVENUE', '#83917A', 9),
  ('REV-EVT', 'Events & promotions',    'فعاليات ومعارض مؤقتة',       'REVENUE', 'REVENUE', '#91A08B', 10),
  ('REV-LIC', 'Administrative fees',    'رسوم إدارية وتراخيص',         'REVENUE', 'REVENUE', '#A0AE9D', 11),
  ('REV-PEN', 'Late & penalty fees',    'غرامات وتأخير سداد',          'REVENUE', 'REVENUE', '#3E4D34', 12)
ON CONFLICT (code) DO NOTHING;

-- ── Common mall operating expenses ────────────────────────────
INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  ('EXP-SEC', 'Security services',      'م.أمن وحراسة',                'EXPENSE', 'EXPENSE', '#5C4033', 24),
  ('EXP-INS', 'Insurance',             'م.تأمينات',                   'EXPENSE', 'EXPENSE', '#4A5F7A', 25),
  ('EXP-MKT', 'Marketing & PR',        'م.تسويق وعلاقات عامة',        'EXPENSE', 'EXPENSE', '#6B4C7A', 26)
ON CONFLICT (code) DO NOTHING;
