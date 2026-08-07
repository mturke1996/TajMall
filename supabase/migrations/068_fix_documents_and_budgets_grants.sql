-- ============================================================
-- إصلاح صلاحيات API للجداول التي أُنشئت بسياسات RLS
-- دون GRANT صريح لـ authenticated (نفس فئة عطل جهات الاتصال في 014).
-- آمن للإعادة: GRANT تراكمي ولا يغيّر السياسات.
-- يتخطى الجداول غير الموجودة حتى لا يفسد مشروعاً ناقص الهجرات.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.correspondence_letters') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence_letters TO authenticated';
  END IF;

  IF to_regclass('public.receipt_vouchers') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_vouchers TO authenticated';
  END IF;

  IF to_regclass('public.receipt_voucher_lines') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_voucher_lines TO authenticated';
  END IF;

  IF to_regclass('public.budgets') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated';
  END IF;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

NOTIFY pgrst, 'reload schema';
