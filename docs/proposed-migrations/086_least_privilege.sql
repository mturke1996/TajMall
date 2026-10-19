-- ============================================================
-- 086 — أقل الصلاحيات على الجداول والواجهات والصفوف (مقترح — لا يُطبَّق إلا بموافقة المالك)
-- ============================================================
-- وُجد بقراءة المخطط الحي وتجربة كل ثغرة على نسخة PGlite (لا لمس للقاعدة الحية):
--
-- 1) الواجهات (views) الثماني التي تعمل بصلاحية المالك (SECURITY DEFINER) تتجاوز RLS، ومنحها
--    للمصادَقين INSERT/UPDATE/DELETE. اثنتان منها (employee_summary و tenants_rent_status)
--    «قابلتان للتحديث تلقائياً» لأنهما تقرآن من جدول واحد هو contacts. النتيجة، وقد جُرِّبت:
--    أي حساب مصادَق، حتى المشاهد (viewer) أو من سجّل بنفسه للتو، يستطيع بطلب REST واحد:
--      PATCH /tenants_rent_status  {monthly_rent: 1, id_number: ..}   تعديل إيجار مستأجر وهويته
--      PATCH /employee_summary     {salary: 1}                        تعديل راتب موظف
--      POST  /tenants_rent_status  {kind: 'VENDOR', name: ..}         إدخال جهة وهمية
--      DELETE /employee_summary?id=eq.<id>                            حذف جهة بلا سجل معاملات
--    كل ذلك يتجاوز سياسات RLS وقاعدة «المشاهد للقراءة فقط» وصلاحيات أعمدة contacts.
--
-- 2) authenticated يملك TRUNCATE و TRIGGER و REFERENCES (وMAINTAIN في PG17) على كل جدول. لا يصلها
--    أحد عبر واجهة REST، لكنها تتجاوز RLS كلياً (TRUNCATE audit_log جُرِّب ونجح)، وأي جدول جديد
--    يرثها من الصلاحيات الافتراضية.
--
-- 3) القيود اليومية ليست ثابتة بعد الترحيل: من يملك auth_may_manage_journals (محاسب فأعلى) يستطيع
--    عبر REST أن يعدّل أسطر قيد مرحَّل أو يحذفه أو يُدخل قيداً POSTED مباشرة، حتى داخل فترة مغلقة
--    (جُرِّب). الواجهة لا تفعل ذلك أبداً: كل كتابة على القيود تمر عبر دوال القاعدة، والحذف المباشر
--    للمسودات فقط.
--
-- 4) app_notifications: أي مصادَق يعدّل أي إشعار (العنوان والرابط href، لا is_read فقط)، وأي كاتب
--    يُنشئ إشعارات مزيفة يراها المالك. مسودات النماذج: سياسات rbac_* تتيح لأي كاتب قراءة مسودات
--    الغير وتعديلها ودسّ مسودات باسمهم، والواجهة لا تقرأ إلا مسوداتها.
--
-- 5) generate_journal_reference() تزيد عدّاد الأرقام المرجعية، و assert_fiscal_period_open() تُدرج
--    فترة مالية جديدة، وكلتاهما قابلة للاستدعاء من أي مصادَق (حتى المشاهد) عبر RPC. هذا وبقية صلاحيات
--    الدوال (anon/PUBLIC، دوال المشغّلات) يعالجها 085_function_hardening.sql ولا يكرّرها هذا الملف.
--
-- 6) إن كان تسجيل البريد الإلكتروني مفتوحاً في Supabase، فكل غريب يسجّل بنفسه يصبح authenticated +
--    viewer ويقرأ كل شيء (جهات التعامل برواتبها وأرقام هوياتها، أرقام حسابات الخزائن وIBAN، كل
--    المعاملات والقيود). لا يوجد في القاعدة ما يفرّق بين غريب ومشاهد عيّنه المالك.
--
-- 7) سجل الرقابة لا يعدّله أحد عبر REST (RLS بلا سياسة كتابة)، لكن لا شيء يمنع service_role من حذف سطوره
--    أو تعديلها. (SECURITY.md يذكر أن مفتاحه كان مكشوفاً في تاريخ git؛ لم أجد قيماً حقيقية في النسخة المحلية
--    من التاريخ، ولا أستطيع التحقق من المستودع العام ولا من أن المفتاح دُوِّر، فالحراسة هنا تغلق الباب
--    على المفتاح لا على من يملك كلمة مرور القاعدة.)
--
-- 8) نشرة supabase_realtime تضم contacts و transactions و journal_entries و journal_lines، والواجهة
--    لا تشترك إلا في app_notifications. Realtime يبثّ تغييرات الصفوف لكل مشترك يجتاز RLS، وقد تضم الحمولة أعمدة
--    لا يملك المشترك صلاحية قراءتها من الجدول (مثل contacts.portal_token)؛ لم أستطع التحقق من ذلك على Supabase الحي،
--    وسحب الجداول غير المستعملة من النشرة بلا ضرر على أي حال.
--
-- 9) refresh_contacts_api_grants() (من 073/074، وتشغّلها الترحيلات القديمة عند إعادة البناء) تمنح anon
--    صلاحية SELECT على أعمدة contacts كلما شُغّلت، فتُلغي ما سحبه 078 من anon. لا يستدعيها التطبيق ولا
--    تُستدعى عبر REST، لكن أي تشغيل يدوي لها (محرر SQL، سكربت) يعيد الفتحة.
--
-- 10) احتياط تحويل الواجهات: الواجهة التي تصير security_invoker تقرأ جداولها وتنفّذ دوالها بصلاحية
--    المستدعي لا المالك. نص الواجهات في القاعدة الحية لم أستطع قراءته (لا اتصال بها من هنا)، لذا يجرّب
--    الملف قراءة كل واجهة محوَّلة بدور authenticated قبل أن يُتمّ، وتُلغى العملية كلها إن رُفضت.
--
-- 11) لا أثر تدقيق لإعادة فتح فترة مالية مغلقة ولا لتغيير دور مستخدم (جدولا fiscal_periods و profiles بلا مشغّل رقابة)،
--    مع أن إعادة الفتح هي الطريق الوحيد المتبقي لتعديل شهر مقفل (يملكه المحاسب فما فوق بتصميم الواجهة).
--
-- ما يفعله هذا الملف (كل جزء يُختبر في scripts/test-least-privilege.mjs):
--   الجزء 1  الواجهات: سبع منها تصير security_invoker (تحترم RLS للمستدعي)، و payroll_run_lines_status
--            تبقى بصلاحية المالك عن قصد (تُخفي تفاصيل الراتب عن أمين الخزينة) مع security_barrier؛
--            ولا واجهة تحمل INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER لأي دور؛ وفحص قراءة فعلي
--            لكل واجهة بدور authenticated (1d).
--   الجزء 2  الجداول: سحب TRUNCATE/TRIGGER/REFERENCES(/MAINTAIN) من authenticated وanon، وسحب الكتابة
--            المباشرة من الجداول التي لا تكتبها الواجهة ولا يكتبها مشغّل بصلاحية المستدعي، وتضييق
--            app_notifications إلى تحديث is_read فقط، وضبط الصلاحيات الافتراضية للجداول الجديدة، وسحب
--            CREATE على مخطط public من anon وauthenticated إن كانت ممنوحة لهما صراحةً (2e)، وإصلاح
--            refresh_contacts_api_grants() كي لا تمنح anon شيئاً (2f).
--   الجزء 3  السجلات: حذف القيد المباشر للمسودات فقط، وحراسة مشغّلات تمنع أدوار الواجهة (حتى
--            service_role) من تعديل القيود والأسطر وسجل الرقابة؛ دوال القاعدة والمالك يمرّون؛ وأثر
--            في سجل الرقابة لإغلاق الفترة المالية وإعادة فتحها ولتغيير الأدوار واعتماد الحسابات
--            (لم يكن يُسجَّل شيء منها؛ النوعان الجديدان fiscal_period و profile يظهران باسمهما الإنجليزي
--            في شاشة الرقابة حتى تُضاف تسميتهما إلى AUDIT_ENTITY_LABELS في src/lib/db/audit-queries.ts).
--   الجزء 4  احتواء التسجيل الذاتي: عمود profiles.approved_at، والغريب يبقى «بانتظار الموافقة» ولا
--            تُرجع له سياسات القراءة صفاً واحداً؛ الاعتماد يتم تلقائياً عندما يعيّن المالك/المدير
--            دوره (أو مسار الدعوة بمفتاح الخدمة) فلا يتغير سير العمل الحالي. إيقاف حساب معتمد (أو
--            إيقاف المالك) لا يملكه إلا من يملك تغيير دوره، ولا يوقف أحد حسابه بنفسه.
--   الجزء 5  نشرة Realtime: إبقاء app_notifications وحدها.
--   الجزء 6  فحوص بعدية داخل الإجراء نفسه: إن لم تتحقق أي قاعدة تُلغى العملية كلها.
--   لا يعتمد على 085 ولا 085 عليه؛ يعملان بأي ترتيب (كلاهما يعيد التطبيق بلا ضرر).
--
-- قبل التطبيق (دقيقة واحدة، في محرر SQL): من يوجد الآن في Auth؟ كل حساب موجود وقت التطبيق يُعتمد كما هو
-- (يحتفظ بما يراه اليوم). فإن رأيت حساباً لا تعرفه فاحذفه أولاً من Authentication > Users:
--   SELECT u.email, p.role, u.created_at, u.last_sign_in_at, (p.id IS NULL) AS no_profile
--   FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at;
-- مستخدم Auth بلا ملف شخصي يُنشأ له ملف viewer معتمد (وإلا انقطع عنه ما كان يقرؤه).
--
-- للتحقق بعد التطبيق (قراءة فقط): كل الواجهات بلا صلاحية كتابة، وسبع منها security_invoker:
--   SELECT c.relname, c.reloptions, has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_can_update
--   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' ORDER BY 1;
--
-- بعد التطبيق: (أ) الحساب الجديد (دعوة من التطبيق أو إضافة يدوية من لوحة Supabase) يبقى «بانتظار الموافقة» حتى
-- يعيّن له المالك/المدير دوراً من شاشة المستخدمين (فيُعتمد في الخطوة نفسها)، أو بـ
--   UPDATE public.profiles SET approved_at = now() WHERE id = '<uuid>';
-- (ب) استعادة نسخة احتياطية قديمة بالسكربت الطارئ (restore-cold-backup) تُرجع صفوف profiles بلا approved_at
-- فتصير كلها «بانتظار الموافقة» وينقطع الجميع؛ الحل نفسه: UPDATE public.profiles SET approved_at = now() WHERE approved_at IS NULL;
-- بحساب قاعدة البيانات المباشر. هذا سلوك مقصود (الفشل يغلق ولا يفتح).
--
-- ما لا يفعله (بقرار المالك، موثّق في أسفل الملف كتعليمات `--|` مُختبَرة):
--   • تفعيل ربط api_pre_request بـ PostgREST (يحجب RPC القراءة عن غير المعتمدين).
--   • إخفاء salary و id_number عن الأدوار دون المحاسب (يحتاج تغيير شاشات الموظفين).
--   • منع أمين الخزينة من تعديل الرصيد الافتتاحي للخزينة.
--
-- لا تغيير على البيانات إلا اعتماد الحسابات الموجودة وقت التطبيق (تُطبع أسماؤها في الرسائل).
-- التراجع: 086_least_privilege.ROLLBACK.sql (يعيد كل صلاحية سُحبت من نسخة محفوظة في migration_backup).
-- ============================================================

BEGIN;

-- ── 0. نسخة التراجع ──────────────────────────────────────────
-- تُحفظ عند أول تطبيق فقط (ON CONFLICT DO NOTHING)، فإعادة التطبيق لا تكتب فوق الحالة الأصلية.
CREATE SCHEMA IF NOT EXISTS migration_backup;
REVOKE ALL ON SCHEMA migration_backup FROM PUBLIC;

CREATE TABLE IF NOT EXISTS migration_backup.m086_revoked (
  kind text NOT NULL,        -- table | schema
  object text NOT NULL,      -- public.contacts | public
  grantee text NOT NULL,     -- اسم الدور أو PUBLIC
  privilege text NOT NULL,
  PRIMARY KEY (kind, object, grantee, privilege)
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_granted (
  kind text NOT NULL,        -- column
  object text NOT NULL,      -- public.app_notifications(is_read)
  grantee text NOT NULL,
  privilege text NOT NULL,
  PRIMARY KEY (kind, object, grantee, privilege)
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_policies (
  table_name text NOT NULL,
  policy_name text NOT NULL,
  action text NOT NULL,      -- altered | dropped | created
  cmd text,
  permissive text,
  roles text[],
  qual text,
  with_check text,
  PRIMARY KEY (table_name, policy_name)
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_view_options (
  view_name text PRIMARY KEY,
  reloptions text[]
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_publication (
  table_name text PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_default_acl (
  owner_role text NOT NULL,
  grantee text NOT NULL,
  privilege text NOT NULL,
  PRIMARY KEY (owner_role, grantee, privilege)
);
CREATE TABLE IF NOT EXISTS migration_backup.m086_functions (
  signature text PRIMARY KEY,
  definition text NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA migration_backup FROM PUBLIC, anon, authenticated;

-- يسجّل الصلاحية (إن وُجدت فعلاً) ثم يسحبها
CREATE OR REPLACE FUNCTION migration_backup.m086_revoke(p_schema text, p_rel text, p_priv text, p_grantee text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_oid oid;
  v_grantee oid;
BEGIN
  v_oid := to_regclass(format('%I.%I', p_schema, p_rel));
  IF v_oid IS NULL THEN RETURN; END IF;
  IF p_grantee = 'PUBLIC' THEN
    v_grantee := 0;
  ELSE
    SELECT r.oid INTO v_grantee FROM pg_roles r WHERE r.rolname = p_grantee;
    IF v_grantee IS NULL THEN RETURN; END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c, aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = v_oid AND a.grantee = v_grantee AND a.privilege_type = p_priv
  ) THEN
    INSERT INTO migration_backup.m086_revoked (kind, object, grantee, privilege)
    VALUES ('table', format('%I.%I', p_schema, p_rel), p_grantee, p_priv)
    ON CONFLICT DO NOTHING;
    EXECUTE format('REVOKE %s ON TABLE %I.%I FROM %s', p_priv, p_schema, p_rel,
                   CASE WHEN p_grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(p_grantee) END);
  END IF;
END
$fn$;

-- يحفظ تعريف السياسة الحالية (أول مرة فقط) قبل تغييرها أو حذفها
CREATE OR REPLACE FUNCTION migration_backup.m086_save_policy(p_table text, p_policy text, p_action text)
RETURNS void
LANGUAGE sql
AS $fn$
  INSERT INTO migration_backup.m086_policies (table_name, policy_name, action, cmd, permissive, roles, qual, with_check)
  SELECT p.tablename, p.policyname, p_action, p.cmd, p.permissive, p.roles::text[], p.qual, p.with_check
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = p_table AND p.policyname = p_policy
  ON CONFLICT DO NOTHING;
$fn$;

-- ── 1. الواجهات ──────────────────────────────────────────────
DO $part1$
DECLARE
  v text;
  r record;
  g text;
BEGIN
  -- 1a. سبع واجهات تقرأ جداول RLS الخاصة بها بصلاحية المالك ← تصير بصلاحية المستدعي.
  --     كل سياسات SELECT على الجداول التي تقرؤها ظاهرة للمصادَقين أصلاً، فلا يتغير ما يراه أي دور،
  --     لكن RLS (وبوابة الأعضاء في الجزء 4) تسري عليها، وتختفي إمكانية الكتابة عبرها.
  FOREACH v IN ARRAY ARRAY['monthly_summary', 'top_expense_categories', 'employee_summary',
                           'journal_lines_with_categories', 'tenant_rent_summary', 'tenants_rent_status',
                           'cashbox_balances']
  LOOP
    IF to_regclass('public.' || v) IS NOT NULL
       AND (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('public.' || v)) = 'v' THEN
      INSERT INTO migration_backup.m086_view_options (view_name, reloptions)
      SELECT v, c.reloptions FROM pg_class c WHERE c.oid = to_regclass('public.' || v)
      ON CONFLICT DO NOTHING;
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;

  -- 1b. payroll_run_lines_status تبقى بصلاحية المالك: أمين الخزينة يصرف الراتب فيرى الصافي والمتبقي
  --     فقط، والتفاصيل تُخفيها CASE داخل الواجهة، والصفوف تُصفّى بـ auth_role_may_write(). حاجز الأمان
  --     يمنع أي شرط يكتبه المستدعي من أن يُقيَّم قبل شرط الواجهة.
  IF to_regclass('public.payroll_run_lines_status') IS NOT NULL THEN
    INSERT INTO migration_backup.m086_view_options (view_name, reloptions)
    SELECT 'payroll_run_lines_status', c.reloptions FROM pg_class c
    WHERE c.oid = to_regclass('public.payroll_run_lines_status')
    ON CONFLICT DO NOTHING;
    EXECUTE 'ALTER VIEW public.payroll_run_lines_status SET (security_barrier = true)';
  END IF;

  -- 1c. لا كتابة ولا TRUNCATE ولا REFERENCES ولا TRIGGER على أي واجهة، لأي دور واجهة
  FOR r IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
  LOOP
    FOREACH v IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
      FOREACH g IN ARRAY ARRAY['authenticated', 'anon', 'PUBLIC'] LOOP
        PERFORM migration_backup.m086_revoke('public', r.relname, v, g);
      END LOOP;
    END LOOP;
  END LOOP;
END
$part1$;

-- 1d. فحص قراءة فعلي: الواجهة المحوَّلة تُنفَّذ الآن بصلاحية المستدعي، فإن كان نصها الحي يقرأ عموداً أو يستدعي
--     دالة لا يملكها authenticated (مثل contacts.portal_token) فلن تعمل لأحد. نجرّبها هنا بدور authenticated:
--     الرفض يُلغي الملف كله قبل أن يتغيّر شيء، بدل أن يكتشفه المستخدمون في الشاشات.
--     (إن لم يسمح دور هذا الاتصال بالتحول إلى authenticated يُتخطى الفحص مع تنبيه.)
DO $part1d$
DECLARE
  v text;
  v_switched boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_switched := true;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '086: تعذّر التحول إلى authenticated في هذه الجلسة — تُرك فحص قراءة الواجهات (جرّبها بعد التطبيق من التطبيق نفسه)';
  END;
  IF NOT v_switched THEN RETURN; END IF;

  FOREACH v IN ARRAY ARRAY['monthly_summary', 'top_expense_categories', 'employee_summary',
                           'journal_lines_with_categories', 'tenant_rent_summary', 'tenants_rent_status',
                           'cashbox_balances', 'payroll_run_lines_status'] LOOP
    IF to_regclass('public.' || v) IS NULL THEN CONTINUE; END IF;
    BEGIN
      EXECUTE format('SELECT * FROM public.%I LIMIT 0', v);
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION '086: الواجهة % لا يستطيع authenticated قراءتها بعد تحويلها إلى صلاحية المستدعي (%). أبقِها بصلاحية المالك وأخبر المطوّر.', v, SQLERRM
        USING ERRCODE = '42501';
    END;
  END LOOP;
  EXECUTE 'RESET ROLE';
END
$part1d$;

-- ── 2. صلاحيات الجداول ───────────────────────────────────────
DO $part2$
DECLARE
  t record;
  p text;
  g text;
  v_priv text[];
  v_role text;
  v_has_acl boolean;
BEGIN
  -- 2-0. anon (والزائر عموماً) لا يملك شيئاً على أي جدول أو واجهة، لا على مستوى الجدول ولا الأعمدة.
  --       (refresh_contacts_api_grants من 074 تمنح أعمدة contacts لـ anon كلما شُغّلت.)
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
      PERFORM migration_backup.m086_revoke('public', t.relname, p, 'anon');
      PERFORM migration_backup.m086_revoke('public', t.relname, p, 'PUBLIC');
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.relname);
    END IF;
  END LOOP;

  -- 2a. TRUNCATE و TRIGGER و REFERENCES (وMAINTAIN إن وُجد في هذا الإصدار) لا يحتاجها أي مصادَق
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') LOOP
    FOREACH p IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
      FOREACH g IN ARRAY ARRAY['authenticated', 'anon', 'PUBLIC'] LOOP
        PERFORM migration_backup.m086_revoke('public', t.relname, p, g);
      END LOOP;
    END LOOP;
  END LOOP;

  -- 2b. جداول لا تكتبها الواجهة مباشرة (كل كتابتها عبر RPC بصلاحية المالك أو مشغّلات SECURITY DEFINER).
  --     مصدر القائمة: استعراض كل .from('<جدول>').insert/update/delete/upsert في src. وجدول يكتب فيه
  --     مشغّل بصلاحية المستدعي (tenant_charge_allocations، tenant_charges عبر auto_allocate_tenant_rent_payment)
  --     يُبقى له ما يحتاجه المشغّل.
  FOR t IN SELECT * FROM (VALUES
      ('account_mappings',         ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('audit_log',                ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('branches',                 ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('cash_transfers',           ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('journal_lines',            ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('journal_entries',          ARRAY['INSERT', 'UPDATE']),
      ('journal_reference_sequences', ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('tenant_rent_exempt_months', ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('tenant_rent_journal_links', ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('tenant_rent_price_bands',  ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('tenant_charge_allocations', ARRAY['UPDATE', 'DELETE']),
      ('tenant_charges',           ARRAY['DELETE']),
      ('transactions',             ARRAY['UPDATE']),
      ('profiles',                 ARRAY['INSERT', 'DELETE']),
      ('app_notifications',        ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('app_secrets',              ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      ('cashbox_inventory_runs',   ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('cashbox_inventory_lines',  ARRAY['INSERT', 'UPDATE', 'DELETE']),
      ('fiscal_periods',           ARRAY['DELETE'])
    ) AS x(tbl, privs)
  LOOP
    FOREACH p IN ARRAY t.privs LOOP
      FOREACH g IN ARRAY ARRAY['authenticated', 'anon', 'PUBLIC'] LOOP
        PERFORM migration_backup.m086_revoke('public', t.tbl, p, g);
      END LOOP;
    END LOOP;
  END LOOP;

  -- 2c. الإشعارات: الواجهة تعلّم «مقروء» فقط
  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    GRANT UPDATE (is_read) ON public.app_notifications TO authenticated;
    INSERT INTO migration_backup.m086_granted (kind, object, grantee, privilege)
    VALUES ('column', 'public.app_notifications(is_read)', 'authenticated', 'UPDATE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2d. الجداول الجديدة لا ترث هذه الصلاحيات (الافتراضي في Supabase يمنح كل شيء لـ authenticated)
  v_priv := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];
  IF current_setting('server_version_num')::int >= 170000 THEN
    v_priv := array_append(v_priv, 'MAINTAIN');
  END IF;
  FOREACH v_role IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN CONTINUE; END IF;
    BEGIN
      INSERT INTO migration_backup.m086_default_acl (owner_role, grantee, privilege)
      SELECT v_role, pg_get_userbyid(a.grantee), a.privilege_type
      FROM pg_default_acl d, aclexplode(d.defaclacl) a
      WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = v_role)
        AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'r'
        AND pg_get_userbyid(a.grantee) IN ('authenticated', 'anon')
        AND a.privilege_type = ANY (v_priv)
      ON CONFLICT DO NOTHING;
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE %s ON TABLES FROM authenticated, anon',
                     v_role, array_to_string(v_priv, ', '));
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '086: لا صلاحية لتغيير الصلاحيات الافتراضية للدور % (طبّقها بحساب مالك ذلك الدور)', v_role;
    END;
  END LOOP;

  -- 2e. مخطط public: لا CREATE لأدوار الواجهة. تُسحب فقط إن كانت ممنوحة لهما صراحةً (لا نلمس PUBLIC ولا
  --     postgres: ترحيلاتك تعمل بحساب postgres وقد تعتمد عليهما). لا يصلها أحد عبر REST أصلاً.
  FOREACH g IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = g)
       AND EXISTS (SELECT 1 FROM pg_namespace n,
                          aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
                   WHERE n.nspname = 'public' AND a.privilege_type = 'CREATE'
                     AND a.grantee = (SELECT r.oid FROM pg_roles r WHERE r.rolname = g)) THEN
      INSERT INTO migration_backup.m086_revoked (kind, object, grantee, privilege)
      VALUES ('schema', 'public', g, 'CREATE') ON CONFLICT DO NOTHING;
      EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', g);
    END IF;
  END LOOP;
END
$part2$;

-- 2f. refresh_contacts_api_grants(): نفس الدالة بلا منح anon شيئاً (الباقي حرفياً كما هو في القاعدة).
--     يُحفظ نصها الأصلي للتراجع. إن كانت مصحَّحة أصلاً أو نصها مختلف عن المتوقع لا يُغيَّر شيء.
DO $part2f$
DECLARE
  v_def text;
  v_new text;
BEGIN
  IF to_regprocedure('public.refresh_contacts_api_grants()') IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef('public.refresh_contacts_api_grants()'::regprocedure);
  v_new := replace(v_def, 'TO anon, authenticated', 'TO authenticated');
  IF v_new <> v_def THEN
    INSERT INTO migration_backup.m086_functions (signature, definition)
    VALUES ('public.refresh_contacts_api_grants()', v_def) ON CONFLICT DO NOTHING;
    EXECUTE v_new;
  END IF;
END
$part2f$;

-- ── 3. السجلات: القيود وسجل الرقابة ──────────────────────────
-- يعمل المشغّلان التاليان بصلاحية المستدعي (ليسا SECURITY DEFINER عن قصد) حتى يرى current_user الحقيقي:
-- دوال القاعدة (SECURITY DEFINER) والمالك والترحيلات يعملون بحساب postgres فيمرّون، وأدوار الواجهة
-- (authenticated و anon و service_role) تُمنع. حذف الأسطر المتتالي (ON DELETE CASCADE) والـ
-- ON DELETE SET NULL يعملان بحساب مالك الجدول فيمرّان أيضاً.
CREATE OR REPLACE FUNCTION public.audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION 'غير مصرح: سجل الرقابة للإضافة من النظام فقط ولا يُعدَّل ولا يُحذف عبر الواجهة.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.guard_ledger_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'service_role', 'authenticator') THEN
    -- الاستثناء الوحيد: حذف مسودة قيد (الواجهة تفعله مباشرة)، وأسطرها تُحذف تلقائياً بحساب المالك
    IF TG_TABLE_NAME = 'journal_entries' AND TG_OP = 'DELETE' THEN
      IF OLD.status = 'DRAFT' THEN
        RETURN OLD;
      END IF;
    END IF;
    RAISE EXCEPTION 'غير مصرح: القيود تُكتب عبر دوال النظام فقط (إنشاء/تعديل/ترحيل/عكس) ولا تُعدَّل مباشرة.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_log_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_ledger_rows() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER trg_audit_log_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_append_only();
DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER trg_audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_append_only();

DROP TRIGGER IF EXISTS trg_guard_journal_entries ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_rows();
DROP TRIGGER IF EXISTS trg_guard_journal_entries_truncate ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entries_truncate
  BEFORE TRUNCATE ON public.journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_ledger_rows();
DROP TRIGGER IF EXISTS trg_guard_journal_lines ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_rows();
DROP TRIGGER IF EXISTS trg_guard_journal_lines_truncate ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines_truncate
  BEFORE TRUNCATE ON public.journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_ledger_rows();

-- حذف القيد المباشر عبر الواجهة: مسودات فقط (الواجهة ترشّح status = DRAFT أصلاً)
DO $part3$
BEGIN
  PERFORM migration_backup.m086_save_policy('journal_entries', 'rbac_delete_journal_entries', 'altered');
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'journal_entries'
             AND policyname = 'rbac_delete_journal_entries') THEN
    ALTER POLICY rbac_delete_journal_entries ON public.journal_entries
      USING (public.auth_may_manage_journals() AND status = 'DRAFT');
  ELSE
    INSERT INTO migration_backup.m086_policies (table_name, policy_name, action)
    VALUES ('journal_entries', 'rbac_delete_journal_entries', 'created') ON CONFLICT DO NOTHING;
    CREATE POLICY rbac_delete_journal_entries ON public.journal_entries
      AS PERMISSIVE FOR DELETE TO authenticated
      USING (public.auth_may_manage_journals() AND status = 'DRAFT');
  END IF;
END
$part3$;

-- أثر تدقيق لإغلاق الفترة المالية وإعادة فتحها: المحاسب (فما فوق) يعيد فتح فترة مغلقة بتحديث واحد، ثم ينشئ
-- أو يعكس قيوداً فيها بالدوال العادية، وكل هذا لم يكن يترك أثراً على الفتح نفسه. الحدث الآن في سجل الرقابة.
CREATE OR REPLACE FUNCTION public.audit_fiscal_period_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.write_audit_log(
    'UPDATE', 'fiscal_period', NEW.id, NEW.name,
    CASE WHEN NEW.is_closed THEN 'إغلاق الفترة المالية ' || NEW.name
         ELSE 'إعادة فتح الفترة المالية ' || NEW.name || ' (كانت مغلقة)' END,
    NEW.start_date, NULL, NULL,
    CASE WHEN NEW.is_closed THEN 'info' ELSE 'warning' END,
    jsonb_build_object('event', CASE WHEN NEW.is_closed THEN 'period_closed' ELSE 'period_reopened' END,
                       'start_date', NEW.start_date, 'end_date', NEW.end_date)
  );
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.audit_fiscal_period_changes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_zz_audit_fiscal_periods ON public.fiscal_periods;
CREATE TRIGGER trg_zz_audit_fiscal_periods
  AFTER UPDATE ON public.fiscal_periods
  FOR EACH ROW WHEN (OLD.is_closed IS DISTINCT FROM NEW.is_closed)
  EXECUTE FUNCTION public.audit_fiscal_period_changes();

-- مسودات النماذج: صاحبها فقط (الواجهة تقرأ وتكتب بـ user_id = المستخدم الحالي في كل موضع)
DO $part3b$
DECLARE
  t text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_form_drafts', 'journal_form_drafts'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOREACH pol IN ARRAY ARRAY['rbac_select_' || t, 'rbac_insert_' || t, 'rbac_update_' || t, 'rbac_delete_' || t] LOOP
      -- لا تُحذف سياسة إلا إن وُجدت سياسة «صاحب الصف» لنفس الأمر (وإلا فقدت الواجهة المسودات كلها)
      IF EXISTS (SELECT 1 FROM pg_policies o
                 WHERE o.schemaname = 'public' AND o.tablename = t AND o.policyname LIKE '%own'
                   AND o.cmd = upper(split_part(pol, '_', 2))) THEN
        PERFORM migration_backup.m086_save_policy(t, pol, 'dropped');
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      END IF;
    END LOOP;
  END LOOP;
END
$part3b$;

-- ── 4. احتواء التسجيل الذاتي ─────────────────────────────────
-- الغريب الذي يسجّل بنفسه يصير authenticated + viewer، ولا تفرّقه القاعدة عن مشاهد عيّنه المالك.
-- approved_at: NULL = بانتظار الموافقة. الحسابات الموجودة وقت التطبيق تُعتمد (الأسماء تُطبع أدناه).
DO $part4a$
DECLARE
  v_list text;
  v_orphans int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'approved_at') THEN
    ALTER TABLE public.profiles ADD COLUMN approved_at timestamptz;
    -- مستخدم Auth بلا ملف شخصي: كان يقرأ كل شيء بصفة مشاهد (get_my_role يعيد viewer لمن لا ملف له). نُنشئ له
    -- ملف viewer معتمداً فيحتفظ بما يراه اليوم بدل أن ينقطع. (التريغر الجديد لم يُنشأ بعد، فيبقى approved_at كما ندخله.)
    BEGIN
      INSERT INTO public.profiles (id, role, approved_at)
      SELECT u.id, 'viewer', now() FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS v_orphans = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '086: تعذّر إنشاء ملفات للمستخدمين بلا ملف (%): أنشئها يدوياً وإلا لن يقرؤوا شيئاً', SQLERRM;
    END;
    SELECT string_agg(coalesce(u.email, p.id::text) || ' [' || coalesce(p.role, '-') || ']', ', ' ORDER BY p.created_at)
      INTO v_list
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id;
    UPDATE public.profiles SET approved_at = COALESCE(created_at, now()) WHERE approved_at IS NULL;
    RAISE NOTICE '086: اعتُمدت الحسابات الموجودة (% منها بلا ملف سابق): %', v_orphans, COALESCE(v_list, '(لا شيء)');
  END IF;
END
$part4a$;

COMMENT ON COLUMN public.profiles.approved_at IS
  'NULL = حساب جديد بانتظار موافقة المالك: دوره viewer دائماً ولا يرى أي بيانات. يُعتمد تلقائياً عندما يعدّل المالك أو المدير أو مفتاح الخدمة صفه (086).';

-- هل المستدعي عضو معتمد؟ (service_role موثوق كما هو اليوم)
CREATE OR REPLACE FUNCTION public.auth_is_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.approved_at IS NOT NULL);
$fn$;

CREATE OR REPLACE FUNCTION public.guard_profile_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_jwt_role text := auth.role();
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_trusted boolean;
BEGIN
  v_admin := v_uid IS NOT NULL AND public.get_my_role() IN ('owner', 'admin');
  -- يعتمد: مفتاح الخدمة، المالك/المدير، أو جلسة قاعدة مباشرة بلا JWT (محرر SQL، ترحيلات)
  v_trusted := v_jwt_role = 'service_role' OR v_admin OR (v_jwt_role IS NULL AND v_uid IS NULL);

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_role = 'service_role' OR v_admin THEN
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    ELSIF v_jwt_role IS NULL AND v_uid IS NULL THEN
      NULL; -- خدمة الدخول تنشئ ملف الحساب الجديد بلا JWT وبلا approved_at: يبقى بانتظار الموافقة
    ELSE
      NEW.approved_at := NULL; -- مستخدم واجهة يُدخل صفه بنفسه
    END IF;
  ELSE
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at AND NOT v_trusted THEN
      RAISE EXCEPTION 'غير مصرح: اعتماد الحسابات للمالك أو المدير فقط.' USING ERRCODE = '42501';
    END IF;
    -- إيقاف حساب معتمد = إسقاطه إلى viewer بلا اعتماد، أي تغيير دور فعلاً: يخضع لقواعد 082 نفسها
    -- (لا أحد يوقف حسابه بنفسه، والمالك وحده يوقف مالكاً). يُستثنى service_role واتصال القاعدة المباشر.
    IF OLD.approved_at IS NOT NULL AND NEW.approved_at IS NULL
       AND v_jwt_role IS DISTINCT FROM 'service_role' AND (v_jwt_role IS NOT NULL OR v_uid IS NOT NULL) THEN
      IF NEW.id = v_uid THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكنك إيقاف حسابك بنفسك.' USING ERRCODE = '42501';
      END IF;
      IF lower(trim(coalesce(OLD.role, ''))) = 'owner' AND public.get_my_role() <> 'owner' THEN
        RAISE EXCEPTION 'غير مصرح: إيقاف حساب المالك للمالك فقط.' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- من يعيّن دور حساب غيره (المالك، المدير، مسار الدعوة بمفتاح الخدمة) يعتمده في الخطوة نفسها
    IF OLD.approved_at IS NULL AND NEW.approved_at IS NULL AND v_trusted AND NEW.id IS DISTINCT FROM v_uid THEN
      NEW.approved_at := now();
    END IF;
  END IF;

  -- حساب غير معتمد لا يكتب ولا يملك دوراً
  IF NEW.approved_at IS NULL THEN
    NEW.role := 'viewer';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_profiles_approval ON public.profiles;
CREATE TRIGGER trg_profiles_approval
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_approval();

-- أثر تدقيق لتغيير الأدوار والاعتماد والإيقاف (لم يكن يُسجَّل شيء منها). بعد الاعتماد الأولي أعلاه فلا ضجيج.
CREATE OR REPLACE FUNCTION public.audit_profile_access_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_name text := coalesce(NEW.full_name_ar, NEW.full_name, NEW.id::text);
BEGIN
  PERFORM public.write_audit_log(
    'UPDATE', 'profile', NEW.id, v_name,
    CASE
      WHEN OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL THEN 'اعتماد حساب ' || v_name || ' بدور ' || coalesce(NEW.role, '-')
      WHEN OLD.approved_at IS NOT NULL AND NEW.approved_at IS NULL THEN 'إيقاف حساب ' || v_name || ' (كان ' || coalesce(OLD.role, '-') || ')'
      ELSE 'تغيير دور ' || v_name || ': ' || coalesce(OLD.role, '-') || ' ← ' || coalesce(NEW.role, '-')
    END,
    CURRENT_DATE, NULL, NULL, 'warning',
    jsonb_build_object('event', 'profile_access', 'old_role', OLD.role, 'new_role', NEW.role,
                       'was_approved', OLD.approved_at IS NOT NULL, 'approved', NEW.approved_at IS NOT NULL)
  );
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.audit_profile_access_changes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_zz_audit_profile_access ON public.profiles;
CREATE TRIGGER trg_zz_audit_profile_access
  AFTER UPDATE ON public.profiles
  FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role
                     OR (OLD.approved_at IS NULL) IS DISTINCT FROM (NEW.approved_at IS NULL))
  EXECUTE FUNCTION public.audit_profile_access_changes();

-- كل سياسات القراءة المفتوحة (USING true) تصير «عضو معتمد». الصياغة (SELECT ...) تُقيَّم مرة لكل جملة.
DO $part4b$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND p.permissive = 'PERMISSIVE'
      AND ('authenticated' = ANY (p.roles::text[]) OR 'public' = ANY (p.roles::text[]))
      AND lower(btrim(coalesce(p.qual, ''))) IN ('true', '(true)')
      AND p.tablename <> 'profiles'
  LOOP
    PERFORM migration_backup.m086_save_policy(r.tablename, r.policyname, 'altered');
    EXECUTE format('ALTER POLICY %I ON public.%I USING ((SELECT public.auth_is_member()))', r.policyname, r.tablename);
  END LOOP;

  -- سياسة تعديل المدير كانت تقرأ profiles بنفسها (EXISTS على الجدول نفسه): تعمل ما دامت سياسة القراءة
  -- «true»، وتنهار بـ infinite recursion بمجرد أن تصير سياسة القراءة شرطاً. تُستبدل بالدالة المكافئة
  -- (owner/admin) التي تقرأ الجدول بصلاحية المالك فلا تتكرر السياسة.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
             AND policyname = 'admin update any profile') THEN
    PERFORM migration_backup.m086_save_policy('profiles', 'admin update any profile', 'altered');
    ALTER POLICY "admin update any profile" ON public.profiles USING (public.auth_can_manage_org());
  END IF;

  -- الملفات الشخصية: كل حساب يرى صفه (ليعرف الواجهة أنه بانتظار الموافقة)، والأعضاء يرون الفريق
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
             AND policyname = 'rbac_select_profiles') THEN
    PERFORM migration_backup.m086_save_policy('profiles', 'rbac_select_profiles', 'altered');
    ALTER POLICY rbac_select_profiles ON public.profiles
      USING (id = auth.uid() OR (SELECT public.auth_is_member()));
  END IF;

  -- الإشعارات: تحديث الأعضاء فقط (والأعمدة محصورة في is_read من الجزء 2)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_notifications'
             AND policyname = 'rbac_update_app_notifications') THEN
    PERFORM migration_backup.m086_save_policy('app_notifications', 'rbac_update_app_notifications', 'altered');
    ALTER POLICY rbac_update_app_notifications ON public.app_notifications
      USING ((SELECT public.auth_is_member())) WITH CHECK ((SELECT public.auth_is_member()));
  END IF;

  -- مسوداتي: صاحبها العضو فقط
  FOR r IN
    SELECT p.tablename, p.policyname, p.cmd
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename IN ('transaction_form_drafts', 'journal_form_drafts')
      AND p.policyname LIKE '%own' AND p.permissive = 'PERMISSIVE'
  LOOP
    PERFORM migration_backup.m086_save_policy(r.tablename, r.policyname, 'altered');
    IF r.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (auth.uid() = user_id AND (SELECT public.auth_is_member()))',
                     r.policyname, r.tablename);
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() = user_id AND (SELECT public.auth_is_member())) WITH CHECK (auth.uid() = user_id AND (SELECT public.auth_is_member()))',
                     r.policyname, r.tablename);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() = user_id AND (SELECT public.auth_is_member()))',
                     r.policyname, r.tablename);
    END IF;
  END LOOP;
END
$part4b$;

-- نقطة التحقق قبل كل طلب REST (تُفعَّل بقرار المالك، انظر أسفل الملف): ترفض حساباً غير معتمد حتى
-- قبل أن يبلغ جدولاً أو دالة. تغطي دوال القراءة (get_balance_sheet، get_journal_entries_for_period...)
-- التي لا تمر بسياسات RLS. وجودها لا يغيّر شيئاً حتى يُربط بـ PostgREST.
CREATE OR REPLACE FUNCTION public.api_pre_request()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.auth_is_member() THEN
    RAISE EXCEPTION 'الحساب بانتظار موافقة المالك.' USING ERRCODE = '42501';
  END IF;
END
$fn$;

-- ── 5. نشرة Realtime ─────────────────────────────────────────
-- الواجهة تشترك في app_notifications فقط (src/lib/db/notification-queries.ts). Realtime قد يبثّ الصف كاملاً
-- (ومنه contacts.portal_token) لكل مشترك يجتاز RLS؛ فتبقى النشرة على ما تستعمله الواجهة.
DO $part5$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['contacts', 'transactions', 'journal_entries', 'journal_lines'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      BEGIN
        INSERT INTO migration_backup.m086_publication (table_name) VALUES (t) ON CONFLICT DO NOTHING;
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '086: تعذّر سحب % من نشرة supabase_realtime (%) — أزله من لوحة Supabase (Database > Publications)', t, SQLERRM;
      END;
    END IF;
  END LOOP;
END
$part5$;

-- صلاحيات الدوال العامة (anon/PUBLIC، دوال المشغّلات، generate_journal_reference، assert_fiscal_period_open)
-- في 085_function_hardening.sql؛ هنا فقط صلاحيات الدوال التي ينشئها هذا الملف.
REVOKE ALL ON FUNCTION public.guard_profile_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_member() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_pre_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_pre_request() TO authenticated, service_role;

-- ── 6. فحوص بعدية: إن لم تتحقق أي قاعدة تُلغى العملية كلها ────
DO $post$
DECLARE
  n int;
  v_list text;
BEGIN
  SELECT count(*) INTO n
  FROM pg_class c CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS x(priv)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
    AND (has_table_privilege('authenticated', c.oid, x.priv) OR has_table_privilege('anon', c.oid, x.priv));
  IF n > 0 THEN RAISE EXCEPTION '086: بقيت % صلاحية كتابة على واجهات', n; END IF;

  SELECT string_agg(c.relname, ', ') INTO v_list
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
    AND c.relname IN ('monthly_summary', 'top_expense_categories', 'employee_summary', 'journal_lines_with_categories',
                      'tenant_rent_summary', 'tenants_rent_status', 'cashbox_balances')
    AND NOT (coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']);
  IF v_list IS NOT NULL THEN RAISE EXCEPTION '086: واجهات لم تصر security_invoker: %', v_list; END IF;

  SELECT count(*) INTO n
  FROM pg_class c CROSS JOIN unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']) AS x(priv)
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND (has_table_privilege('authenticated', c.oid, x.priv) OR has_table_privilege('anon', c.oid, x.priv));
  IF n > 0 THEN RAISE EXCEPTION '086: بقيت % صلاحية TRUNCATE/TRIGGER/REFERENCES على جداول', n; END IF;

  SELECT count(*) INTO n
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
    AND has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES');
  IF n > 0 THEN RAISE EXCEPTION '086: anon يملك صلاحية على % كائن', n; END IF;

  IF to_regclass('public.audit_log') IS NOT NULL AND (
       has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
    OR has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.audit_log', 'DELETE')) THEN
    RAISE EXCEPTION '086: authenticated ما زال يكتب في audit_log';
  END IF;

  -- كل سياسة حذف على journal_entries تشترط DRAFT (يكشف سياسة حية خارج المستودع تفتح الباب)
  SELECT string_agg(p.policyname, ', ') INTO v_list
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'journal_entries' AND p.cmd IN ('DELETE', 'ALL')
    AND p.permissive = 'PERMISSIVE' AND p.qual NOT LIKE '%DRAFT%';
  IF v_list IS NOT NULL THEN RAISE EXCEPTION '086: سياسة حذف قيود لا تشترط المسودة: %', v_list; END IF;

  -- لا سياسة قراءة مفتوحة للمصادَقين بعد الآن
  SELECT string_agg(p.tablename || '.' || p.policyname, ', ') INTO v_list
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.cmd IN ('SELECT', 'ALL')
    AND ('authenticated' = ANY (p.roles::text[]) OR 'public' = ANY (p.roles::text[]))
    AND lower(btrim(coalesce(p.qual, ''))) IN ('true', '(true)');
  IF v_list IS NOT NULL THEN RAISE EXCEPTION '086: سياسات قراءة ما زالت مفتوحة: %', v_list; END IF;

  -- الدالة التي تعيد منح الأعمدة لم تعد تمنح anon
  IF to_regprocedure('public.refresh_contacts_api_grants()') IS NOT NULL
     AND pg_get_functiondef('public.refresh_contacts_api_grants()'::regprocedure) LIKE '%TO anon, authenticated%' THEN
    RAISE EXCEPTION '086: refresh_contacts_api_grants() ما زالت تمنح anon أعمدة contacts (نصها الحي مختلف عن المتوقع، عدّلها يدوياً)';
  END IF;

  SELECT count(*) INTO n FROM public.profiles WHERE approved_at IS NULL;
  IF n > 0 THEN RAISE NOTICE '086: % حساب بانتظار الموافقة (راجعها قبل الاعتماد)', n; END IF;

  SELECT count(*) INTO n FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
  IF n > 0 THEN RAISE NOTICE '086: % مستخدم Auth بلا ملف شخصي — لن يقرأ شيئاً حتى يُنشأ له ملف', n; END IF;

  FOREACH v_list IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_list) AND has_schema_privilege(v_list, 'public', 'CREATE') THEN
      RAISE NOTICE '086: الدور % ما زال يملك CREATE على مخطط public (ممنوح عبر PUBLIC أو عضوية دور — راجعه في لوحة Supabase)', v_list;
    END IF;
  END LOOP;
END
$post$;

COMMENT ON FUNCTION public.auth_is_member() IS
  'هل المستدعي عضو معتمد (profiles.approved_at) أو مفتاح الخدمة؟ تستعملها سياسات القراءة وapi_pre_request (086).';
COMMENT ON FUNCTION public.guard_profile_approval() IS
  'الحساب الجديد بانتظار الموافقة؛ اعتماده للمالك أو المدير أو مفتاح الخدمة، وغير المعتمد دوره viewer دائماً (086).';
COMMENT ON FUNCTION public.guard_ledger_rows() IS
  'أدوار الواجهة (حتى service_role) لا تكتب في القيود والأسطر؛ تُكتب عبر دوال النظام فقط، وتُحذف المسودات مباشرة (086).';
COMMENT ON FUNCTION public.audit_log_append_only() IS
  'سجل الرقابة للإضافة من النظام فقط: أدوار الواجهة لا تعدّل ولا تحذف ولا تفرّغ (086).';
COMMENT ON FUNCTION public.api_pre_request() IS
  'نقطة تحقق PostgREST (db-pre-request): ترفض الحساب غير المعتمد. لا أثر لها قبل ربطها (انظر 086 أسفل الملف).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- خطوات اختيارية بقرار المالك — كل كتلة بين OPTIONAL-BEGIN و OPTIONAL-END،
-- وسطورها مسبوقة بـ `--| ` ويختبرها scripts/test-least-privilege.mjs بعد نزع البادئة.
-- انسخ سطور كتلة واحدة، انزع `--| ` من أولها، وشغّلها منفصلة. لكل كتلة كتلة تراجع (UNDO).
-- ============================================================

-- OPTIONAL-BEGIN pre-request
-- تفعيل api_pre_request في PostgREST: حساب غير معتمد يُرفض في كل طلب REST (جداول وواجهات ودوال RPC)،
-- فتُغلق دوال القراءة (get_balance_sheet، get_general_ledger_lines، tenant_rent_summary_for_month ...)
-- التي لا تمر بـ RLS. شغّلها بعد أن تتأكد أن الدخول والتصفح يعملان بعد تطبيق 086.
-- الأمان الأول يبقى إيقاف «Allow new users to sign up» في Supabase: Authentication > Sign In / Providers > Email.
-- ملاحظة: أي طلب بمفتاح anon يفشل بعد التفعيل (anon لا يملك EXECUTE على الدالة، ولا يستعمل التطبيق REST بمفتاحه).
--| ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.api_pre_request';
--| NOTIFY pgrst, 'reload config';
-- OPTIONAL-UNDO pre-request
--| ALTER ROLE authenticator RESET pgrst.db_pre_request;
--| NOTIFY pgrst, 'reload config';
-- OPTIONAL-END pre-request

-- OPTIONAL-BEGIN contacts-masking
-- إخفاء salary و id_number عن الأدوار دون المحاسب (المحاسب والمدير والمالك يرونهما). لا تطبّقها قبل أن
-- تقرأ الشاشات contacts_masked بدل contacts: قراءة العمودين من الجدول مباشرة تفشل (permission denied) لكل
-- الأدوار، ويفشل `.update(...).select(CONTACT_LIST_COLUMNS)` و `select('*')` على contacts. المواضع في src:
-- src/lib/db/contact-columns.ts (CONTACT_LIST_COLUMNS)، queries.ts (useContacts/useContact/useCreateContact/
-- useUpdateContact)، mall-queries.ts، tenant-statements-queries.ts، backup/tables.ts، rent-revenue-months-block.tsx.
-- الكتابة لا تتأثر (UPDATE/INSERT على العمودين باقٍ)، لكن لا شيء يقرأهما بعد الكتابة إلا contacts_masked.
-- ملاحظات: (1) مدفوعات الرواتب نفسها تبقى ظاهرة للجميع في المعاملات والقيود (مجاميع بند م.مرتبات)؛ هذا
-- يحمي الراتب المتعاقد عليه ورقم الهوية الوطنية، لا حركة الصرف. (2) لا تشغّل refresh_contacts_api_grants()
-- (من 073/074) بعدها: تعيد منح كل الأعمدة. (3) عدّل numeric(18,3) أدناه إن كان نوع salary عندك غير ذلك.
-- (4) تشغَّل مرة واحدة؛ الواجهتان employee_summary و tenants_rent_status تُعاد كتابتهما لتقرآ contacts_masked
-- بنفس الأعمدة تماماً، ونصّاهما الأصليان يُحفظان في migration_backup.m086_opt_views لكتلة UNDO.
--| CREATE TABLE IF NOT EXISTS migration_backup.m086_opt_views (view_name text PRIMARY KEY, definition text NOT NULL);
--| REVOKE SELECT (salary, id_number) ON public.contacts FROM authenticated;
--| CREATE OR REPLACE VIEW public.contacts_masked WITH (security_barrier = true) AS
--|   SELECT c.id, c.code, c.kind, c.name, c.name_en, c.phone, c.phone2, c.email, c.address, c.tax_number,
--|          c.shop_number, c.floor, c.area_sqm, c.contract_start, c.contract_end, c.monthly_rent,
--|          c.job_title, c.department, c.hire_date, c.is_active, c.notes, c.created_at, c.updated_at,
--|          (CASE WHEN public.auth_may_manage_journals() THEN c.salary END)::numeric(18,3) AS salary,
--|          (CASE WHEN public.auth_may_manage_journals() THEN c.id_number END) AS id_number
--|   FROM public.contacts c
--|   WHERE public.auth_is_member();
--| REVOKE ALL ON public.contacts_masked FROM PUBLIC, anon, authenticated;
--| GRANT SELECT ON public.contacts_masked TO authenticated;
--| DO $o$
--| DECLARE
--|   v text;
--|   d text;
--| BEGIN
--|   FOREACH v IN ARRAY ARRAY['employee_summary', 'tenants_rent_status'] LOOP
--|     d := regexp_replace(pg_get_viewdef(('public.' || v)::regclass, true), ';\s*$', '');
--|     IF position('contacts_masked' IN d) > 0 THEN CONTINUE; END IF;
--|     IF position('FROM contacts c' IN d) = 0 THEN RAISE EXCEPTION 'unexpected definition of view %', v; END IF;
--|     INSERT INTO migration_backup.m086_opt_views (view_name, definition) VALUES (v, d) ON CONFLICT DO NOTHING;
--|     EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS %s', v,
--|                    replace(d, 'FROM contacts c', 'FROM contacts_masked c'));
--|   END LOOP;
--| END
--| $o$;
-- OPTIONAL-UNDO contacts-masking
--| GRANT SELECT (salary, id_number) ON public.contacts TO authenticated;
--| DO $u$
--| DECLARE
--|   r record;
--| BEGIN
--|   FOR r IN SELECT view_name, definition FROM migration_backup.m086_opt_views LOOP
--|     EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS %s', r.view_name, r.definition);
--|   END LOOP;
--| END
--| $u$;
--| DROP VIEW IF EXISTS public.contacts_masked;
--| DROP TABLE IF EXISTS migration_backup.m086_opt_views;
-- OPTIONAL-END contacts-masking

-- OPTIONAL-BEGIN cashier-cashbox
-- أمين الخزينة (cashier) يملك cashbox.manage في الواجهة، وسياسة RLS تتيح له تعديل cashboxes كلها. الرصيد
-- الافتتاحي جزء من رصيد الخزينة المعروض (opening_balance + حركات الدفتر): تعديله يخفي عجزاً دون أي قيد.
-- هذه الكتلة تجعل الرصيد الافتتاحي للمالك والمدير والمحاسب فقط (إنشاء خزينة جديدة بصفر يبقى مسموحاً لأمين الخزينة).
--| CREATE OR REPLACE FUNCTION public.guard_cashbox_opening_balance()
--| RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
--| BEGIN
--|   IF current_user IN ('authenticated', 'anon') AND public.get_my_role() NOT IN ('owner', 'admin', 'accountant') THEN
--|     IF (TG_OP = 'INSERT' AND coalesce(NEW.opening_balance, 0) <> 0)
--|        OR (TG_OP = 'UPDATE' AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance) THEN
--|       RAISE EXCEPTION 'غير مصرح: الرصيد الافتتاحي للخزينة للمالك أو المدير أو المحاسب.' USING ERRCODE = '42501';
--|     END IF;
--|   END IF;
--|   RETURN NEW;
--| END $fn$;
--| REVOKE ALL ON FUNCTION public.guard_cashbox_opening_balance() FROM PUBLIC, anon, authenticated;
--| DROP TRIGGER IF EXISTS trg_guard_cashbox_opening_balance ON public.cashboxes;
--| CREATE TRIGGER trg_guard_cashbox_opening_balance BEFORE INSERT OR UPDATE ON public.cashboxes
--|   FOR EACH ROW EXECUTE FUNCTION public.guard_cashbox_opening_balance();
-- OPTIONAL-UNDO cashier-cashbox
--| DROP TRIGGER IF EXISTS trg_guard_cashbox_opening_balance ON public.cashboxes;
--| DROP FUNCTION IF EXISTS public.guard_cashbox_opening_balance();
-- OPTIONAL-END cashier-cashbox
