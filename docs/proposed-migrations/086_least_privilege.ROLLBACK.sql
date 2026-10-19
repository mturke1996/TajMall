-- ============================================================
-- التراجع عن 086 — يعيد كل صلاحية سُحبت وكل سياسة تغيّرت وخيارات الواجهات ونشرة Realtime والصلاحيات
-- الافتراضية من النسخة المحفوظة في migration_backup (m086_*)، ويحذف ما أنشأه 086: مشغّلات السجلات
-- والملفات الشخصية، دوال auth_is_member و api_pre_request وغيرها، وعمود profiles.approved_at (يُفقد
-- تاريخ الاعتماد فقط). لا يلمس أي بيانات أخرى (ملفات viewer التي أنشأها 086 لمستخدمين بلا ملف تبقى، وهي لا تضر).
-- إن كنت فعّلت كتلة pre-request الاختيارية فشغّل كتلة UNDO منها قبل هذا الملف.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('migration_backup.m086_revoked') IS NULL THEN
    RAISE EXCEPTION 'لا توجد نسخة 086 المحفوظة (migration_backup.m086_revoked) — لم يُطبَّق 086 أو حُذفت النسخة';
  END IF;
END $$;

-- ── 1. أعد الصلاحيات المسحوبة، وأزل المنوحة ─────────────────
DO $$
DECLARE
  r record;
  v_tbl text;
  v_col text;
BEGIN
  FOR r IN SELECT kind, object, grantee, privilege FROM migration_backup.m086_revoked WHERE kind = 'table' LOOP
    IF to_regclass(r.object) IS NOT NULL
       AND (r.grantee = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.grantee)) THEN
      EXECUTE format('GRANT %s ON TABLE %s TO %s', r.privilege, r.object,
                     CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END);
    END IF;
  END LOOP;

  FOR r IN SELECT kind, object, grantee, privilege FROM migration_backup.m086_revoked WHERE kind = 'schema' LOOP
    IF to_regnamespace(r.object) IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.grantee) THEN
      EXECUTE format('GRANT %s ON SCHEMA %I TO %I', r.privilege, r.object, r.grantee);
    END IF;
  END LOOP;

  FOR r IN SELECT object, grantee, privilege FROM migration_backup.m086_granted WHERE kind = 'column' LOOP
    v_tbl := split_part(r.object, '(', 1);
    v_col := rtrim(split_part(r.object, '(', 2), ')');
    IF to_regclass(v_tbl) IS NOT NULL THEN
      EXECUTE format('REVOKE %s (%I) ON TABLE %s FROM %I', r.privilege, v_col, v_tbl, r.grantee);
    END IF;
  END LOOP;
END $$;

-- ── 2. خيارات الواجهات ───────────────────────────────────────
DO $$
DECLARE
  r record;
  o text;
BEGIN
  FOR r IN SELECT view_name, reloptions FROM migration_backup.m086_view_options LOOP
    IF to_regclass('public.' || r.view_name) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I RESET (security_invoker, security_barrier)', r.view_name);
      IF r.reloptions IS NOT NULL THEN
        FOREACH o IN ARRAY r.reloptions LOOP
          EXECUTE format('ALTER VIEW public.%I SET (%s)', r.view_name, replace(o, '=', ' = '));
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 3. السياسات ──────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_sql text;
BEGIN
  FOR r IN SELECT * FROM migration_backup.m086_policies LOOP
    IF to_regclass('public.' || r.table_name) IS NULL THEN CONTINUE; END IF;
    IF r.action = 'created' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policy_name, r.table_name);
    ELSIF r.action = 'altered' THEN
      v_sql := format('ALTER POLICY %I ON public.%I', r.policy_name, r.table_name);
      IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', r.qual); END IF;
      IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', r.with_check); END IF;
      EXECUTE v_sql;
    ELSIF r.action = 'dropped' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policy_name, r.table_name);
      v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s', r.policy_name, r.table_name,
                      r.permissive, r.cmd, array_to_string(r.roles, ', '));
      IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', r.qual); END IF;
      IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', r.with_check); END IF;
      EXECUTE v_sql;
    END IF;
  END LOOP;
END $$;

-- ── 3b. الدوال التي عدّلها 086 (النص الأصلي كما كان) ─────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT signature, definition FROM migration_backup.m086_functions LOOP
    IF to_regprocedure(r.signature) IS NOT NULL THEN
      EXECUTE r.definition;
    END IF;
  END LOOP;
END $$;

-- ── 4. ما أنشأه 086 ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.audit_log;
DROP TRIGGER IF EXISTS trg_guard_journal_entries ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_guard_journal_entries_truncate ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_guard_journal_lines ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_guard_journal_lines_truncate ON public.journal_lines;
DROP TRIGGER IF EXISTS trg_profiles_approval ON public.profiles;
DROP TRIGGER IF EXISTS trg_zz_audit_profile_access ON public.profiles;
DROP TRIGGER IF EXISTS trg_zz_audit_fiscal_periods ON public.fiscal_periods;
DROP FUNCTION IF EXISTS public.audit_log_append_only();
DROP FUNCTION IF EXISTS public.guard_ledger_rows();
DROP FUNCTION IF EXISTS public.guard_profile_approval();
DROP FUNCTION IF EXISTS public.audit_profile_access_changes();
DROP FUNCTION IF EXISTS public.audit_fiscal_period_changes();
DROP FUNCTION IF EXISTS public.api_pre_request();
DROP FUNCTION IF EXISTS public.auth_is_member();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS approved_at;

-- ── 5. نشرة Realtime ─────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN RETURN; END IF;
  FOR r IN SELECT table_name FROM migration_backup.m086_publication LOOP
    IF to_regclass('public.' || r.table_name) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r.table_name) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r.table_name);
    END IF;
  END LOOP;
END $$;

-- ── 6. الصلاحيات الافتراضية للجداول الجديدة ──────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT owner_role, grantee, privilege FROM migration_backup.m086_default_acl LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.owner_role) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.grantee) THEN
      BEGIN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT %s ON TABLES TO %I',
                       r.owner_role, r.privilege, r.grantee);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE '086 rollback: لا صلاحية لإعادة الصلاحية الافتراضية % للدور %', r.privilege, r.grantee;
      END;
    END IF;
  END LOOP;
END $$;

-- ── 7. حذف النسخة المحفوظة ───────────────────────────────────
DROP FUNCTION IF EXISTS migration_backup.m086_revoke(text, text, text, text);
DROP FUNCTION IF EXISTS migration_backup.m086_save_policy(text, text, text);
DROP TABLE IF EXISTS migration_backup.m086_revoked;
DROP TABLE IF EXISTS migration_backup.m086_granted;
DROP TABLE IF EXISTS migration_backup.m086_policies;
DROP TABLE IF EXISTS migration_backup.m086_view_options;
DROP TABLE IF EXISTS migration_backup.m086_publication;
DROP TABLE IF EXISTS migration_backup.m086_default_acl;
DROP TABLE IF EXISTS migration_backup.m086_functions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'migration_backup'::regnamespace)
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'migration_backup'::regnamespace) THEN
    DROP SCHEMA migration_backup;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
