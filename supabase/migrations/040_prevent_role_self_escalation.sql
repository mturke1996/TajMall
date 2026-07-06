-- ============================================================
-- Migration 040: منع ترقية الدور الذاتية (Privilege Escalation Fix)
-- ============================================================
-- المشكلة: سياسة RLS "rbac_update_profiles" (migration 021) تسمح لأي
-- مستخدم بتحديث صفّه الخاص (auth.uid() = id) دون أي قيد على عمود role،
-- وواجهة التطبيق (useUpdateProfile) تنفّذ update({role}) مباشرة من
-- المتصفح. عملياً: أي حساب viewer يستطيع تنفيذ نداء واحد ليجعل نفسه
-- owner. هذا الملف يقفل عمود role عبر trigger على مستوى القاعدة —
-- الحماية الحقيقية الوحيدة التي لا يمكن تجاوزها من العميل.
--
-- القاعدة:
--   • owner/admin (أو أي طلب عبر service_role — مثل مسار الدعوة
--     /api/admin/invite) يستطيعون تغيير أي دور بحرية.
--   • أي شخص آخر: لا يمكنه تغيير role الخاص به عبر UPDATE (يفشل الطلب
--     بخطأ صريح)، ولا يمكنه إدخال دور مرتفع عبر INSERT مباشر (يُفرض
--     'viewer' دوماً بغض النظر عن القيمة المطلوبة).
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- المدراء (owner/admin) وطلبات service_role الموثوقة (مثل مسار
  -- الدعوة على الخادم) يستطيعون تعيين أي دور بحرية.
  IF auth.role() = 'service_role' OR public.auth_can_manage_org() THEN
    RETURN NEW;
  END IF;

  -- تحديث: أي محاولة لتغيير الدور الخاص بالمستخدم نفسه تُرفض بصراحة.
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكنك تغيير دورك الخاص — يتطلب صلاحية owner أو admin.'
      USING ERRCODE = '42501';
  END IF;

  -- إدخال مباشر (نادر — التسجيل التلقائي عادة لا يمرّ من هنا كمستخدم
  -- موثّق): يُفرض 'viewer' كحد أدنى أماناً بغض النظر عن القيمة المطلوبة.
  IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'viewer' THEN
    NEW.role := 'viewer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

COMMENT ON FUNCTION public.prevent_role_self_escalation() IS
  'يمنع أي مستخدم غير owner/admin من تغيير عمود role الخاص به أو بغيره — يسدّ ثغرة ترقية الذات عبر update({role}) المباشر من العميل.';
