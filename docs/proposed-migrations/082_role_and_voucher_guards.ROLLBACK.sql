-- ============================================================
-- التراجع عن 082 — يحذف حراسة أذونات الصرف، ويعيد get_my_role و
-- prevent_role_self_escalation حرفياً من النسخة التي حفظها 082 قبل الاستبدال
-- (migration_backup.m082_functions). لا يلمس أي بيانات.
-- ============================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  IF to_regclass('migration_backup.m082_functions') IS NULL THEN
    RAISE EXCEPTION 'لا توجد نسخة 082 المحفوظة (migration_backup.m082_functions) — لم يُطبَّق 082 أو حُذفت النسخة';
  END IF;
  FOR r IN SELECT signature, definition, comment FROM migration_backup.m082_functions LOOP
    EXECUTE r.definition;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.signature, r.comment);
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'نسخة 082 ناقصة: % من 2 دالة', v_count;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_guard_disbursement_voucher_lines ON public.disbursement_voucher_lines;
DROP TRIGGER IF EXISTS trg_guard_disbursement_voucher_approval ON public.disbursement_vouchers;
DROP FUNCTION IF EXISTS public.guard_disbursement_voucher_lines();
DROP FUNCTION IF EXISTS public.guard_disbursement_voucher_approval();
DROP FUNCTION IF EXISTS public.auth_is_trusted_backend();

DROP TABLE migration_backup.m082_functions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'migration_backup'::regnamespace) THEN
    DROP SCHEMA migration_backup;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
