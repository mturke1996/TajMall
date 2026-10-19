-- ============================================================
-- 085 — تحصين الدوال (مقترح — لا يُطبَّق إلا بموافقة المالك)
-- ============================================================
-- مصدر هذه الهجرة: فحص نصّ كل دوال public الحية (119 دالة، 107 منها SECURITY DEFINER)،
-- واختبار كل بند على نسخة PGlite معزولة تحمل نصوص الدوال وصلاحياتها الحية. لا شيء منها يلمس
-- الإنتاج. اختبارها: node scripts/test-function-hardening.mjs
--
-- ما وُجد وما يفعله هذا الملف (بالترتيب):
--
-- 1) assert_fiscal_period_open(date) قابلة للاستدعاء من أي حساب مسجَّل عبر /rest/v1/rpc، حتى المشاهد،
--    وهي SECURITY DEFINER تُدرج صفاً في fiscal_periods لأي تاريخ (سُنح الإثبات: مشاهد أنشأ فترة 2099-05).
--    الحل: تُسحب من authenticated (تستدعيها دوال الترحيل التي تعمل بصلاحية المالك فلا يتأثر التطبيق)،
--    ويُضاف فحص دور داخل الدالة نفسها ليبقى الإغلاق قائماً لو أُعيد منح الصلاحية بخطأ.
-- 2) generate_journal_reference(date) كذلك: تزيد عدّاد ترقيم القيود لأي سنة. مشاهد يستطيع حرق أرقام
--    JY-YYYY-nnnnn فتظهر فجوات في ترقيم دفتر اليومية. السحب + فحص دور (محاسب أو مدير).
--    وتُسحب generate_cash_transfer_reference و _assert_inventory_pin_format معهما (داخليتان).
-- 3) دوال المشغّلات (audit_*، process_*، handle_new_user، prevent_role_self_escalation، set_updated_at
--    وغيرها، 21 دالة) كانت قابلة للتنفيذ من authenticated، وثلاث منها (prevent_contact_delete_with_history،
--    check_transaction_category_kind، charge_accrual_entry_date) من anon أيضاً عبر PUBLIC.
--    لا تُستدعى كـ RPC (PostgREST لا يعرض دوال trigger) لكنها تملأ تقرير مستشار Supabase.
--    تُسحب من PUBLIC وanon وauthenticated؛ المشغّلات نفسها تعمل لأن Postgres لا يفحص EXECUTE عند الإطلاق.
--    وتُكنَس كل دوال public من PUBLIC وanon (كما فعل 078 قبل أن تظهر الثلاث بعده).
-- 4) ثبّت search_path على الدوال التسع التي يرفضها المستشار (function_search_path_mutable):
--    year_close_source_id، set_updated_at، check_fiscal_period_overlap، _assert_inventory_pin_format،
--    generate_contact_code، set_transaction_posted، check_lease_contract_overlap، payroll_month_end،
--    auto_allocate_tenant_rent_payment. ALTER فقط، لا تغيير في أجسامها.
-- 5) ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ... FROM PUBLIC: الصيغة التي استعملها 078
--    (IN SCHEMA public) لا تُسقط منح PUBLIC المضمّن، فكل دالة جديدة تُنشأ بعده خرجت قابلة للتنفيذ من الجميع.
-- 6) set_cashbox_inventory_pin: أول حساب يكتب (أمين الخزينة مثلاً) يضبط الرقم السري قبل المالك،
--    ثم لا يستطيع المالك تغييره لأن التغيير يطلب الرقم الحالي ولا مسار استرداد (قُفل بلا بوابة خلفية).
--    الآن: المالك والمدير يعيدان ضبط الرقم دون الحالي. الباقون كما كانوا (يطلبون الحالي).
-- 7) handle_new_user كانت تكتب الدور 'cashier' في الملف الجديد وتعتمد على مشغّل آخر ليخفضه إلى viewer.
--    الآن تكتب 'viewer' مباشرة (أقل صلاحية افتراضية، لا تعتمد على مشغّل ثانٍ). مسار الدعوة لا يتأثر
--    (يعيّن الدور بعد الإنشاء بمفتاح الخدمة).
-- 8) مُنتحَل الكاتب: created_by على المعاملات والأذونات والتحويلات والميزانيات والمراسلات والإيصالات تأتي من
--    المتصفح ولا يفرضها أحد، فأمين الخزينة يكتب معاملة باسم المالك (أُثبت: القيد المرحَّل يحمل
--    created_by_user_id للمالك). الحل: مشغّل BEFORE يفرض created_by = auth.uid() لطلبات المستخدم المسجَّل
--    ويمنع تغييره لاحقاً، ومشغّل على disbursement_vouchers يمنع كتابة approved_by/submitted_by باسم غيرك.
--    service_role والاتصال المباشر بالقاعدة (إصلاحات وترحيلات) لا يتأثران. سجل الرقابة كان يحمل الفاعل الحقيقي دائماً.
-- 9) backfill_existing_transactions_to_ledger لا تفعل شيئاً: تعدّل المعاملة دون تغيير حقل محاسبي فيتجاوزها
--    مشغّل الترحيل، ثم تُبلغ «تم ترحيل عدد N» (أُثبت: 1 معاملة بلا قيد، الرسالة تقول رُحّلت، القيود بعدها 0).
--    الآن تعيد الترحيل فعلاً بتحويل الحالة مسودة ثم مرحّلة، وتتخطى ما يتعذّر (فترة مغلقة) وتذكر عدده.
-- 10) apply_charge_allocations: لا قفل على المعاملة فاستدعاءان متزامنان يخصّصانها مرتين (لا قيد فريد على
--    (charge_id, transaction_id))، ولا تفحص نوع المعاملة فمصروف يُخصَّص كأنه دفعة إيجار. القفل + نوع REVENUE فقط.
-- 11) app_secrets (الرقم السري المشفَّر): RLS بلا سياسات يحميها، لكن authenticated يحمل عليها كل الصلاحيات.
--    تُسحب الصلاحيات أيضاً (الدوال التي تقرؤها SECURITY DEFINER فلا تتأثر).
--
-- ما لا تغيّره (مقصود): فحوص الأدوار في بقية الدوال (فُحصت كلها، انظر تقرير التدقيق)، حجم الرقم السري (4-8 أرقام)
-- وإمكان تخمينه عبر RPC: الخطأ يُلغي المعاملة فلا يبقى عدّاد محاولات، والإغلاق الحقيقي يحتاج تغييراً في
-- الواجهة (إرجاع {ok:false} بدل الاستثناء)، وهو خارج هذا الملف.
--
-- يتطلب 082 (auth_is_trusted_backend). لا تغيير في البيانات. التراجع: 085_function_hardening.ROLLBACK.sql
-- تنبيه: إعادة تشغيل 078 بعد هذا الملف تعيد منح EXECUTE على كل الدوال لـ authenticated؛ طبّق 085 بعد 078 دائماً.
-- ============================================================

BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.auth_is_trusted_backend()') IS NULL THEN
    RAISE EXCEPTION '085 يتطلب 082 (auth_is_trusted_backend غير موجودة)';
  END IF;
END $$;

-- ── 0. نسخة قبل التغيير (للتراجع الحرفي) ─────────────────────
CREATE SCHEMA IF NOT EXISTS migration_backup;
REVOKE ALL ON SCHEMA migration_backup FROM PUBLIC;

CREATE TABLE IF NOT EXISTS migration_backup.m085_functions (
  signature text PRIMARY KEY,
  definition text NOT NULL,
  comment text,
  saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS migration_backup.m085_function_acl (
  proname text NOT NULL,
  args text NOT NULL,
  grantees text[] NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proname, args)
);
CREATE TABLE IF NOT EXISTS migration_backup.m085_table_acl (
  table_name text NOT NULL,
  grantee text NOT NULL,
  privilege text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, grantee, privilege)
);
REVOKE ALL ON migration_backup.m085_functions, migration_backup.m085_function_acl, migration_backup.m085_table_acl
  FROM PUBLIC, anon, authenticated;

-- عند إعادة التطبيق تبقى النسخة الأولى (قبل أول تطبيق)
INSERT INTO migration_backup.m085_functions (signature, definition, comment)
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid),
       obj_description(p.oid, 'pg_proc')
FROM unnest(ARRAY[
  'public.assert_fiscal_period_open(date)',
  'public.generate_journal_reference(date)',
  'public.set_cashbox_inventory_pin(text,text)',
  'public.handle_new_user()',
  'public.backfill_existing_transactions_to_ledger()',
  'public.apply_charge_allocations(uuid,jsonb)',
  'public.year_close_source_id(integer)',
  'public.set_updated_at()',
  'public.check_fiscal_period_overlap()',
  'public._assert_inventory_pin_format(text)',
  'public.generate_contact_code()',
  'public.set_transaction_posted()',
  'public.check_lease_contract_overlap()',
  'public.payroll_month_end(text)',
  'public.auto_allocate_tenant_rent_payment()'
]) AS s(sig)
JOIN pg_proc p ON p.oid = to_regprocedure(s.sig)
ON CONFLICT (signature) DO NOTHING;

-- صلاحيات التنفيذ على كل دوال public كما هي الآن
INSERT INTO migration_backup.m085_function_acl (proname, args, grantees)
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       COALESCE((
         SELECT array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END)
         FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
       ), ARRAY[]::text[])
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
ON CONFLICT (proname, args) DO NOTHING;

INSERT INTO migration_backup.m085_table_acl (table_name, grantee, privilege)
SELECT 'public.app_secrets', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END, a.privilege_type
FROM pg_class c, aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = to_regclass('public.app_secrets') AND a.grantee <> c.relowner
ON CONFLICT (table_name, grantee, privilege) DO NOTHING;

-- ── 1. فحص الدور داخل الدالتين اللتين تكتبان ─────────────────
CREATE OR REPLACE FUNCTION public.assert_fiscal_period_open(p_entry_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_id uuid;
  v_is_closed boolean;
BEGIN
  -- 085: تُدرج فترة مالية، فلا تُنفَّذ إلا من حساب يكتب (دوال الترحيل تفحص الدور قبلها) أو من الخادم الموثوق.
  IF NOT public.auth_is_trusted_backend() AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;

  SELECT id, is_closed INTO v_period_id, v_is_closed
  FROM public.fiscal_periods
  WHERE p_entry_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_period_id IS NULL THEN
    INSERT INTO public.fiscal_periods (name, start_date, end_date, is_closed)
    VALUES (
      TO_CHAR(p_entry_date, 'YYYY-MM'),
      DATE_TRUNC('month', p_entry_date)::date,
      (DATE_TRUNC('month', p_entry_date) + INTERVAL '1 month - 1 day')::date,
      false
    )
    RETURNING id, is_closed INTO v_period_id, v_is_closed;
  END IF;

  IF v_is_closed = true THEN
    RAISE EXCEPTION 'لا يمكن إنشاء أو ترحيل أو عكس قيد في فترة مالية مغلقة (%).', TO_CHAR(p_entry_date, 'YYYY-MM')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_period_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_journal_reference(p_entry_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(YEAR FROM COALESCE(p_entry_date, CURRENT_DATE))::int;
  v_seq  int;
BEGIN
  -- 085: تزيد عدّاد الترقيم، فلا يحرق أرقام القيود إلا من يملك إنشاء القيود (create_journal_entry تفحصه أصلاً).
  IF NOT public.auth_is_trusted_backend() AND NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: ترقيم القيود يتطلب دور محاسب أو مدير.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.journal_reference_sequences (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = public.journal_reference_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  RETURN 'JY-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
END;
$function$;

-- ── 2. سحب التنفيذ ───────────────────────────────────────────
-- (أ) كل دالة مشغّل (RETURNS trigger) في public: لا PUBLIC ولا anon ولا authenticated.
--     ملاحظة: Postgres يفحص EXECUTE عند CREATE TRIGGER فقط، لا عند إطلاق المشغّل.
-- (ب) المساعدات الداخلية التي تستدعيها دوال تعمل بصلاحية مالكها فقط.
-- (ج) كنس: لا PUBLIC ولا anon على أي دالة يملكها المستخدم الحالي في public.
DO $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::regtype
      AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '085: سُحب التنفيذ من % دالة مشغّل', v_n;

  FOR r IN
    SELECT s.sig
    FROM unnest(ARRAY[
      'public.assert_fiscal_period_open(date)',
      'public.generate_journal_reference(date)',
      'public.generate_cash_transfer_reference(date)',
      'public._assert_inventory_pin_format(text)'
    ]) AS s(sig)
    WHERE to_regprocedure(s.sig) IS NOT NULL
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- الدوال الجديدة التي ينشئها postgres لا تخرج قابلة للتنفيذ من الجميع (الصيغة بلا IN SCHEMA هي التي تُسقط PUBLIC)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ── 3. تثبيت search_path على الدوال التسع ─────────────────────
-- الصرفة (لا تقرأ جدولاً): مسار فارغ. التي تقرأ جداول أو تكتبها: public ثم pg_temp.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.sig, s.path
    FROM (VALUES
      ('public.year_close_source_id(integer)', ''),
      ('public.payroll_month_end(text)', ''),
      ('public._assert_inventory_pin_format(text)', ''),
      ('public.set_updated_at()', ''),
      ('public.set_transaction_posted()', ''),
      ('public.generate_contact_code()', ''),
      ('public.check_fiscal_period_overlap()', 'public, pg_temp'),
      ('public.check_lease_contract_overlap()', 'public, pg_temp'),
      ('public.auto_allocate_tenant_rent_payment()', 'public, pg_temp')
    ) AS s(sig, path)
    WHERE to_regprocedure(s.sig) IS NOT NULL
  LOOP
    IF r.path = '' THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', r.sig, '');
    ELSE
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    END IF;
  END LOOP;
END $$;

-- ── 4. الرقم السري للجرد: استرداد المالك/المدير ──────────────
CREATE OR REPLACE FUNCTION public.set_cashbox_inventory_pin(p_new_pin text, p_current_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF NOT public.auth_role_may_write() THEN RAISE EXCEPTION 'صلاحية التعديل مطلوبة'; END IF;
  PERFORM public._assert_inventory_pin_format(p_new_pin);
  SELECT hash INTO v_hash FROM public.app_secrets WHERE key = 'cashbox_inventory_pin';
  IF v_hash IS NULL THEN
    INSERT INTO public.app_secrets (key, hash, updated_by)
    VALUES ('cashbox_inventory_pin', extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), auth.uid());
  ELSE
    -- 085: المالك والمدير يعيدان ضبط الرقم دون الحالي (نسيانه أو استيلاء حساب آخر عليه قبل المالك)؛ غيرهما يطلب الحالي.
    IF NOT public.auth_can_manage_org() THEN
      IF p_current_pin IS NULL OR extensions.crypt(p_current_pin, v_hash) IS DISTINCT FROM v_hash THEN
        RAISE EXCEPTION 'الرقم السري الحالي غير صحيح';
      END IF;
    END IF;
    UPDATE public.app_secrets SET hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), updated_at = now(), updated_by = auth.uid()
    WHERE key = 'cashbox_inventory_pin';
  END IF;
  RETURN jsonb_build_object('ok', true, 'has_pin', true);
END;
$function$;

-- الرقم المشفَّر لا يقرؤه أحد من الواجهة: RLS بلا سياسات، والآن بلا صلاحيات جدول أيضاً (طبقة ثانية)
DO $$ BEGIN
  IF to_regclass('public.app_secrets') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.app_secrets FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── 5. الحساب الجديد يبدأ viewer ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, full_name_ar, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'full_name_ar',
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── 6. منع انتحال الكاتب ─────────────────────────────────────
-- طلب مستخدم مسجَّل عبر الواجهة فقط (دور authenticated): created_by = auth.uid() عند الإدخال ولا يتغيّر بعده.
-- service_role والاتصال المباشر بالقاعدة يكتبان ما يشاءان (إصلاحات، حذف مستخدم → ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.stamp_actor_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_col text := TG_ARGV[0];
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_col, auth.uid()));
  ELSE
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_col, to_jsonb(OLD) -> v_col));
  END IF;
  RETURN NEW;
END;
$function$;

-- معتمِد الإذن ومُرسِله: لا يُكتبان باسم غير الفاعل (decide_voucher_approval وsubmit_voucher_for_approval تكتبان auth.uid())
CREATE OR REPLACE FUNCTION public.guard_voucher_actor_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (NEW.approved_by IS NOT NULL AND NEW.approved_by <> auth.uid()
      AND (TG_OP = 'INSERT' OR NEW.approved_by IS DISTINCT FROM OLD.approved_by))
     OR (NEW.submitted_by IS NOT NULL AND NEW.submitted_by <> auth.uid()
      AND (TG_OP = 'INSERT' OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by)) THEN
    RAISE EXCEPTION 'غير مصرح: لا يُسجَّل الاعتماد أو الإرسال باسم مستخدم آخر.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_actor_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_voucher_actor_columns() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tbl, t.col
    FROM (VALUES
      ('transactions', 'created_by'),
      ('disbursement_vouchers', 'created_by'),
      ('cash_transfers', 'created_by'),
      ('budgets', 'created_by'),
      ('correspondence_letters', 'created_by'),
      ('receipt_vouchers', 'created_by')
    ) AS t(tbl, col)
    WHERE to_regclass('public.' || t.tbl) IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = t.tbl AND c.column_name = t.col)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_actor ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER trg_stamp_actor BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_actor_columns(%L)', r.tbl, r.col);
  END LOOP;

  IF to_regclass('public.disbursement_vouchers') IS NOT NULL
     AND (SELECT count(*) FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = 'disbursement_vouchers'
            AND c.column_name IN ('approved_by', 'submitted_by')) = 2 THEN
    DROP TRIGGER IF EXISTS trg_guard_voucher_actor ON public.disbursement_vouchers;
    CREATE TRIGGER trg_guard_voucher_actor BEFORE INSERT OR UPDATE ON public.disbursement_vouchers
      FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_actor_columns();
  END IF;
END $$;

-- ── 7. ترحيل المعاملات السابقة: تعمل فعلاً ───────────────────
CREATE OR REPLACE FUNCTION public.backfill_existing_transactions_to_ledger()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx record;
  v_count int := 0;
  v_skipped int := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب محاسباً أو مديراً.' USING ERRCODE = '42501';
  END IF;
  -- معاملات مرحّلة بلا قيد مرحَّل في دفتر اليومية
  FOR v_tx IN
    SELECT t.id
    FROM public.transactions t
    LEFT JOIN public.journal_entries je ON je.source_type = 'TRANSACTION' AND je.source_id = t.id AND je.status = 'POSTED'
    WHERE t.status = 'POSTED' AND je.id IS NULL
    ORDER BY t.tx_date ASC, t.number ASC
  LOOP
    BEGIN
      -- 085: تحديث الحالة إلى نفسها لا يُرحِّل شيئاً (مشغّل الترحيل يتجاوز ما لم يتغيّر فيه حقل محاسبي)،
      -- فتُحوَّل مسودة ثم مرحّلة ليُنشئ المشغّل القيد. أي فشل (فترة مغلقة مثلاً) يُلغي هذه المعاملة وحدها.
      UPDATE public.transactions SET status = 'DRAFT' WHERE id = v_tx.id;
      UPDATE public.transactions SET status = 'POSTED' WHERE id = v_tx.id;
      IF NOT EXISTS (SELECT 1 FROM public.journal_entries je
                     WHERE je.source_type = 'TRANSACTION' AND je.source_id = v_tx.id AND je.status = 'POSTED') THEN
        RAISE EXCEPTION 'لم يُنشأ قيد للمعاملة';
      END IF;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN 'تم ترحيل عدد ' || v_count || ' معاملة سابقة بنجاح إلى قيود اليومية.'
    || CASE WHEN v_skipped > 0 THEN ' تعذّر ترحيل ' || v_skipped || ' (فترة مغلقة أو بيانات ناقصة).' ELSE '' END;
END;
$function$;

-- ── 8. تخصيص الدفعات على المطالبات ───────────────────────────
CREATE OR REPLACE FUNCTION public.apply_charge_allocations(p_transaction_id uuid, p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx record;
  v_item jsonb;
  v_charge record;
  v_alloc numeric;
  v_total numeric := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تتطلب صلاحية كتابة.' USING ERRCODE = '42501';
  END IF;
  -- 085: قفل المعاملة يمنع استدعاءين متزامنين من تخصيصها مرتين (لا قيد فريد على التخصيص)
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المعاملة غير موجودة';
  END IF;

  IF v_tx.status != 'POSTED' THEN
    RAISE EXCEPTION 'المعاملة غير مرحّلة';
  END IF;

  -- 085: التخصيص على مطالبات المستأجر للإيرادات (الدفعات) فقط، لا المصروفات
  IF v_tx.kind IS DISTINCT FROM 'REVENUE' THEN
    RAISE EXCEPTION 'التخصيص على المطالبات يخص الإيرادات (الدفعات) فقط';
  END IF;

  IF v_tx.contact_id IS NULL THEN
    RAISE EXCEPTION 'المعاملة غير مرتبطة بمستأجر';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_charge_allocations
    WHERE transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'تم تخصيص هذه المعاملة مسبقاً';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_alloc := COALESCE((v_item->>'amount')::numeric, 0);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    v_total := v_total + v_alloc;

    SELECT tc.* INTO v_charge
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE tc.id = (v_item->>'charge_id')::uuid
      AND lc.tenant_id = v_tx.contact_id
      AND tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'مطالبة غير صالحة أو مغلقة للمستأجر';
    END IF;

    IF (v_charge.amount - v_charge.total_paid) < v_alloc THEN
      RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على المطالبة';
    END IF;

    INSERT INTO public.tenant_charge_allocations (charge_id, transaction_id, amount)
    VALUES (v_charge.id, p_transaction_id, v_alloc);

    UPDATE public.tenant_charges
    SET
      total_paid = total_paid + v_alloc,
      status = CASE
        WHEN total_paid + v_alloc >= amount THEN 'PAID'
        WHEN total_paid + v_alloc > 0 THEN 'PARTIAL'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_charge.id;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'يجب تخصيص مبلغ واحد على الأقل';
  END IF;

  IF v_total > v_tx.amount THEN
    RAISE EXCEPTION 'مجموع التخصيص يتجاوز مبلغ المعاملة';
  END IF;
END;
$function$;

-- ── 9. توثيق ─────────────────────────────────────────────────
COMMENT ON FUNCTION public.assert_fiscal_period_open(date) IS
  'داخلية: تتحقق من أن الفترة مفتوحة وتُنشئها عند الغياب. لا تُستدعى من الواجهة؛ تفحص الدور أيضاً (085).';
COMMENT ON FUNCTION public.generate_journal_reference(date) IS
  'داخلية: ترقيم القيود. لا تُستدعى من الواجهة؛ تفحص الدور أيضاً (085).';
COMMENT ON FUNCTION public.set_cashbox_inventory_pin(text, text) IS
  'ضبط الرقم السري للجرد: الأول لأي حساب يكتب، والتغيير يطلب الرقم الحالي، والمالك/المدير يعيدان الضبط دونه (085).';
COMMENT ON FUNCTION public.backfill_existing_transactions_to_ledger() IS
  'يعيد ترحيل المعاملات المرحّلة التي بلا قيد (محاسب أو مدير)؛ يتخطى ما يتعذّر ويذكر عدده (085).';
COMMENT ON FUNCTION public.stamp_actor_columns() IS
  'مشغّل: created_by = auth.uid() لطلبات المستخدم المسجَّل ولا يتغيّر بعد الإدخال (085).';
COMMENT ON FUNCTION public.guard_voucher_actor_columns() IS
  'مشغّل: approved_by وsubmitted_by على إذن الصرف لا يُكتبان باسم مستخدم آخر (085).';

NOTIFY pgrst, 'reload schema';

COMMIT;
