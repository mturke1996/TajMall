-- ============================================================
-- 082 — حراسة الأدوار وأذونات الصرف (مقترح — لا يُطبَّق إلا بموافقة المالك)
-- ============================================================
-- ثلاث ثغرات وُجدت بقراءة القاعدة الحية (قراءة فقط):
--
-- 1) إذن الصرف: سياسات RLS على disbursement_vouchers تسمح لأي حساب يكتب
--    (auth_role_may_write) بالتعديل والحذف المباشر. والمشغّل
--    trg_process_disbursement_voucher_posting يرحّل القيد كلما صارت الحالة
--    APPROVED (إدخالاً أو تعديلاً) ويعكسه عند تعديل أو حذف إذن معتمد.
--    النتيجة: أمين الخزينة يستطيع بطلب واحد من المتصفح أن يعتمد إذنه بنفسه
--    (update status = 'APPROVED') فيُصرف المبلغ من الخزينة دون موافقة، أو
--    أن يحذف إذناً معتمداً فيُعكس قيده. دالة decide_voucher_approval تفحص
--    الصلاحية، لكن الطريق المباشر إلى الجدول لا يمر بها.
--
-- 2) الأدوار: prevent_role_self_escalation تترك المدير (admin) يفعل أي شيء،
--    فيستطيع أن يجعل نفسه أو غيره owner، أو أن ينزع دور owner من المالك.
--
-- 3) get_my_role تعيد الدور كما هو مكتوب، فأي قيمة غير معروفة (خطأ إملائي)
--    تُعامَل كحساب يكتب لأن auth_role_may_write = «ليس viewer».
--
-- القواعد بعد هذا الملف:
--   • الدور: القيم المعروفة فقط (owner/admin/accountant/cashier/viewer)،
--     و'member' القديم = cashier كما في الواجهة، وغير ذلك = viewer.
--   • لا أحد يغيّر دوره بنفسه (فلا يبقى النظام بلا مالك). منح دور owner أو
--     نزعه للمالك فقط، وبقية الأدوار للمالك والمدير. الدور الجديد يجب أن
--     يكون معروفاً. والحساب الجديد يبدأ viewer حتى يعيّن له مسار الدعوة دوره.
--   • إذن الصرف: الاعتماد والرفض، وأي تعديل على إذن بانتظار الاعتماد أو
--     معتمد، وحذف الإذن المعتمد — للمالك والمدير والمحاسب فقط. أمين الخزينة
--     يُنشئ المسودة ويعدّلها ويرسلها للاعتماد، ويحذف ما لم يُعتمد.
--     وأسطر الإذن تتبع حالة الإذن نفسها.
--   • service_role (مسار الدعوة على الخادم) موثوق كما هو اليوم. وفي أذونات
--     الصرف فقط يُوثَق أيضاً الاتصال المباشر بالقاعدة بلا JWT (محرر SQL،
--     الترحيلات، المهام المجدولة): من يملك اتصالاً مباشراً يستطيع تعطيل أي
--     مشغّل أصلاً. أما الأدوار فلا، لأن خدمة الدخول نفسها تعمل بلا JWT.
--
-- لا تغيير على البيانات. التراجع: 082_role_and_voucher_guards.ROLLBACK.sql
-- ============================================================

BEGIN;

-- ── 0. نسخة من الدالتين قبل الاستبدال ─────────────────────────
-- نصّهما في القاعدة الحية يختلف عن نصّ المستودع، فالتراجع يعيدهما من هذه
-- النسخة حرفياً. المخطط خارج ما تعرضه واجهة Supabase (public فقط).
CREATE SCHEMA IF NOT EXISTS migration_backup;
REVOKE ALL ON SCHEMA migration_backup FROM PUBLIC;
CREATE TABLE IF NOT EXISTS migration_backup.m082_functions (
  signature text PRIMARY KEY,
  definition text NOT NULL,
  comment text,
  saved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON migration_backup.m082_functions FROM PUBLIC, anon, authenticated;
-- عند إعادة التطبيق تبقى النسخة الأولى (قبل أول تطبيق)
INSERT INTO migration_backup.m082_functions (signature, definition, comment)
SELECT s, pg_get_functiondef(to_regprocedure(s)), obj_description(to_regprocedure(s), 'pg_proc')
FROM unnest(ARRAY['public.get_my_role()', 'public.prevent_role_self_escalation()']) AS s
WHERE to_regprocedure(s) IS NOT NULL
ON CONFLICT (signature) DO NOTHING;

-- ── 1. الدور الفعلي للمستخدم الحالي ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN r = 'member' THEN 'cashier'
    WHEN r IN ('owner', 'admin', 'accountant', 'cashier', 'viewer') THEN r
    ELSE 'viewer'
  END
  FROM (
    SELECT lower(trim(coalesce(
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
      'viewer'
    ))) AS r
  ) s;
$$;

-- طلب من الخادم بمفتاح الخدمة، أو اتصال مباشر بالقاعدة لا يحمل JWT إطلاقاً.
-- كل طلب يمر عبر واجهة Supabase (PostgREST) يحمل JWT بدور anon أو authenticated.
CREATE OR REPLACE FUNCTION public.auth_is_trusted_backend()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
      OR (auth.role() IS NULL AND auth.uid() IS NULL);
$$;

-- يُستدعى من دوال المشغّلات (تعمل بصلاحية مالكها)، فلا حاجة لمنحه لأحد عبر الواجهة
REVOKE ALL ON FUNCTION public.auth_is_trusted_backend() FROM PUBLIC, anon, authenticated;

-- ── 2. تغيير الأدوار ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me text;
  v_old text;
  v_new text;
BEGIN
  -- service_role فقط، لا الاتصال بلا JWT: خدمة الدخول (GoTrue) تعمل بلا JWT،
  -- وقد تنقل بيانات يكتبها المستخدم نفسه عند التسجيل أو تحديث حسابه.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_me := public.get_my_role();
  v_new := lower(trim(coalesce(NEW.role, 'viewer')));

  IF TG_OP = 'INSERT' THEN
    -- يبدأ viewer، إلا ما يُدخله المالك أو المدير (ودور المالك يمنحه المالك فقط).
    -- الملف الذي يُنشئه handle_new_user عند إنشاء الحساب يبدأ viewer أيضاً، ثم
    -- يعيّن مسار الدعوة الدور المطلوب بمفتاح الخدمة. التطبيق لا يتيح التسجيل الذاتي.
    IF v_me NOT IN ('owner', 'admin') OR (v_new = 'owner' AND v_me <> 'owner') THEN
      NEW.role := 'viewer';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;
  v_old := lower(trim(coalesce(OLD.role, 'viewer')));

  IF NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكنك تغيير دورك بنفسك — يغيّره لك المالك.'
      USING ERRCODE = '42501';
  END IF;

  IF v_me NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'غير مصرح: تغيير الأدوار للمالك أو المدير فقط.'
      USING ERRCODE = '42501';
  END IF;

  IF (v_old = 'owner' OR v_new = 'owner') AND v_me <> 'owner' THEN
    RAISE EXCEPTION 'غير مصرح: منح دور المالك أو نزعه للمالك فقط.'
      USING ERRCODE = '42501';
  END IF;

  IF v_new NOT IN ('owner', 'admin', 'accountant', 'cashier', 'viewer') THEN
    RAISE EXCEPTION 'دور غير معروف: %', NEW.role USING ERRCODE = '23514';
  END IF;

  NEW.role := v_new;
  RETURN NEW;
END;
$$;

-- ── 3. اعتماد أذونات الصرف ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_disbursement_voucher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_is_trusted_backend() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF public.get_my_role() NOT IN ('owner', 'admin', 'accountant') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IN ('APPROVED', 'REJECTED') OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
        RAISE EXCEPTION 'غير مصرح: الإذن الجديد يُسجَّل مسودة ثم يُرسل للاعتماد.'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.status = 'APPROVED' THEN
        RAISE EXCEPTION 'غير مصرح: حذف إذن صرف معتمد للمالك أو المدير أو المحاسب — حذفه يعكس قيده ويعيد المبلغ إلى الخزينة.'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    ELSE
      IF OLD.status IN ('PENDING_APPROVAL', 'APPROVED') THEN
        RAISE EXCEPTION 'غير مصرح: الإذن % لا يُعدَّل بعد إرساله للاعتماد إلا من المالك أو المدير أو المحاسب.',
          CASE OLD.status WHEN 'APPROVED' THEN 'المعتمد' ELSE 'المنتظر' END
          USING ERRCODE = '42501';
      END IF;
      IF NEW.status IN ('APPROVED', 'REJECTED')
         OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
         OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
        RAISE EXCEPTION 'غير مصرح: الاعتماد أو الرفض للمالك أو المدير أو المحاسب.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- كما في decide_voucher_approval (078)، لكن لكل طريق إلى الاعتماد: بلا خزينة
  -- يختلف رصيد الخزائن عن الدفتر، وبلا بند يُرحَّل المصروف على أول بند في القائمة.
  IF TG_OP <> 'DELETE' AND NEW.status = 'APPROVED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED')
     AND (NEW.cashbox_id IS NULL OR NEW.category_id IS NULL) THEN
    RAISE EXCEPTION 'حدّد الخزينة وبند المصروف قبل اعتماد إذن الصرف' USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_disbursement_voucher_approval ON public.disbursement_vouchers;
CREATE TRIGGER trg_guard_disbursement_voucher_approval
  BEFORE INSERT OR UPDATE OR DELETE ON public.disbursement_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_disbursement_voucher_approval();

-- أسطر الإذن تتبع حالته: لا تُضاف ولا تُعدَّل ولا تُحذف بعد إرساله للاعتماد.
-- عند حذف الإذن نفسه تُحذف أسطره تلقائياً (ON DELETE CASCADE) ولا يعود الإذن
-- مرئياً، فيمر الحذف المتسلسل.
CREATE OR REPLACE FUNCTION public.guard_disbursement_voucher_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.auth_is_trusted_backend()
     OR public.get_my_role() IN ('owner', 'admin', 'accountant') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT v.status INTO v_status FROM public.disbursement_vouchers v
  WHERE v.id = CASE WHEN TG_OP = 'INSERT' THEN NEW.voucher_id ELSE OLD.voucher_id END;
  IF v_status IN ('PENDING_APPROVAL', 'APPROVED') THEN
    RAISE EXCEPTION 'غير مصرح: بنود الإذن لا تُعدَّل بعد إرساله للاعتماد إلا من المالك أو المدير أو المحاسب.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.voucher_id IS DISTINCT FROM OLD.voucher_id THEN
    SELECT v.status INTO v_status FROM public.disbursement_vouchers v WHERE v.id = NEW.voucher_id;
    IF v_status IN ('PENDING_APPROVAL', 'APPROVED') THEN
      RAISE EXCEPTION 'غير مصرح: لا يُنقل بند إلى إذن أُرسل للاعتماد.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_disbursement_voucher_lines ON public.disbursement_voucher_lines;
CREATE TRIGGER trg_guard_disbursement_voucher_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.disbursement_voucher_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_disbursement_voucher_lines();

REVOKE ALL ON FUNCTION public.guard_disbursement_voucher_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_disbursement_voucher_lines() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_disbursement_voucher_approval() IS
  'اعتماد إذن الصرف ورفضه وتعديل الإذن بعد إرساله وحذف المعتمد: owner/admin/accountant فقط (082).';
COMMENT ON FUNCTION public.prevent_role_self_escalation() IS
  'لا أحد يغيّر دوره بنفسه؛ دور owner يمنحه وينزعه owner فقط؛ بقية الأدوار owner/admin؛ الحساب الجديد يبدأ viewer (082).';

NOTIFY pgrst, 'reload schema';

COMMIT;
