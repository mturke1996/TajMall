-- ============================================================
-- التراجع عن 085 — يحذف مشغّلات الكاتب ودالتيها، ويعيد كل دالة عدّلها 085 حرفياً من النسخة التي حفظها
-- قبل التغيير (migration_backup.m085_functions)، ويعيد صلاحيات التنفيذ على كل دوال public وصلاحيات
-- app_secrets كما كانت (migration_backup.m085_function_acl وm085_table_acl)، ويعيد الامتيازات الافتراضية.
-- لا يلمس أي بيانات. يُنفَّذ بالمستخدم نفسه الذي نفّذ 085 (postgres).
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('migration_backup.m085_functions') IS NULL
     OR to_regclass('migration_backup.m085_function_acl') IS NULL
     OR to_regclass('migration_backup.m085_table_acl') IS NULL THEN
    RAISE EXCEPTION 'لا توجد نسخة 085 المحفوظة (migration_backup.m085_*) — لم يُطبَّق 085 أو حُذفت النسخة';
  END IF;
END $$;

-- ── 1. المشغّلات التي أضافها 085 ─────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relnamespace = 'public'::regnamespace
      AND t.tgname IN ('trg_stamp_actor', 'trg_guard_voucher_actor')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.tbl);
  END LOOP;
END $$;
DO $$ BEGIN
  IF to_regclass('public.tenant_charge_allocations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_release_charge_on_allocation_delete ON public.tenant_charge_allocations;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.release_charge_on_allocation_delete();
DROP FUNCTION IF EXISTS public.stamp_actor_columns();
DROP FUNCTION IF EXISTS public.guard_voucher_actor_columns();

-- ── 2. أجسام الدوال كما كانت ─────────────────────────────────
DO $$
DECLARE
  r record;
  v_count int := 0;
  v_expected int;
BEGIN
  SELECT count(*) INTO v_expected FROM migration_backup.m085_functions;
  FOR r IN SELECT signature, definition, comment FROM migration_backup.m085_functions ORDER BY signature LOOP
    EXECUTE r.definition;
    -- التعليق: بحسب الاسم والوسائط المحفوظة
    EXECUTE format('COMMENT ON FUNCTION public.%s IS %L', r.signature, r.comment);
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> v_expected OR v_count = 0 THEN
    RAISE EXCEPTION 'نسخة 085 ناقصة: % من % دالة', v_count, v_expected;
  END IF;
END $$;

-- ── 3. صلاحيات التنفيذ كما كانت ──────────────────────────────
DO $$
DECLARE
  r record;
  f record;
  g text;
BEGIN
  FOR r IN SELECT proname, args, grantees FROM migration_backup.m085_function_acl LOOP
    FOR f IN
      SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname = r.proname
        AND pg_get_function_identity_arguments(p.oid) = r.args
        AND pg_has_role(current_user, p.proowner, 'MEMBER')
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.sig);
      FOREACH g IN ARRAY r.grantees LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', f.sig, g);
      END LOOP;
    END LOOP;
  END LOOP;

  IF to_regclass('public.app_secrets') IS NOT NULL
     AND EXISTS (SELECT 1 FROM migration_backup.m085_table_acl WHERE table_name = 'public.app_secrets') THEN
    REVOKE ALL ON TABLE public.app_secrets FROM PUBLIC, anon, authenticated, service_role;
    FOR r IN SELECT grantee, privilege FROM migration_backup.m085_table_acl WHERE table_name = 'public.app_secrets' LOOP
      EXECUTE format('GRANT %s ON TABLE public.app_secrets TO %s', r.privilege, r.grantee);
    END LOOP;
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- ── 4. حذف النسخة ────────────────────────────────────────────
DROP TABLE migration_backup.m085_functions;
DROP TABLE migration_backup.m085_function_acl;
DROP TABLE migration_backup.m085_table_acl;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'migration_backup'::regnamespace) THEN
    DROP SCHEMA migration_backup;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
