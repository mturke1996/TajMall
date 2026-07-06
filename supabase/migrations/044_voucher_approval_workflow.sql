-- ============================================================
-- Migration 044: مسار اعتماد سندات حقيقي (Maker-Checker)
-- ============================================================
-- disbursement_vouchers لم يكن فيه أي حالة اعتماد فعلياً (خلافاً لما
-- يصفه مخطط Prisma غير المستخدم). هذا الملف يضيف حالة حقيقية:
-- DRAFT → PENDING_APPROVAL → APPROVED / REJECTED
-- مع إشعار فعلي (عبر app_notifications + Realtime) في كل انتقال.
-- ============================================================

ALTER TABLE public.disbursement_vouchers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS submitted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_disbursement_vouchers_status
  ON public.disbursement_vouchers (status);

-- الأذونات الحالية بلا حالة اعتماد تُعامَل كمعتمدة مسبقاً (لا تُقفل
-- رجعياً أذوناً سابقة بانتظار موافقة لم تُطلب أصلاً).
UPDATE public.disbursement_vouchers SET status = 'APPROVED' WHERE status = 'DRAFT';

CREATE OR REPLACE FUNCTION public.submit_voucher_for_approval(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_amount numeric;
  v_payee text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  UPDATE public.disbursement_vouchers
  SET status = 'PENDING_APPROVAL', submitted_at = now(), submitted_by = auth.uid()
  WHERE id = p_voucher_id AND status IN ('DRAFT', 'REJECTED')
  RETURNING voucher_number, total_amount, payee INTO v_number, v_amount, v_payee;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'الإذن غير موجود أو ليس في حالة تسمح بإرساله للاعتماد';
  END IF;

  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  VALUES (
    'VOUCHER_PENDING_APPROVAL',
    'إذن صرف بانتظار الاعتماد',
    format('إذن %s للمستفيد %s بقيمة %s د.ل — يحتاج موافقة owner/admin.', v_number, v_payee, v_amount::text),
    format('/vouchers?highlight=%s', p_voucher_id::text),
    'warning',
    'disbursement_voucher',
    p_voucher_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_voucher_approval(
  p_voucher_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_payee text;
BEGIN
  IF public.get_my_role() NOT IN ('owner', 'admin', 'accountant') THEN
    RAISE EXCEPTION 'غير مصرح: الاعتماد يتطلب صلاحية owner أو admin أو accountant' USING ERRCODE = '42501';
  END IF;

  IF p_approve THEN
    UPDATE public.disbursement_vouchers
    SET status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), rejection_reason = NULL
    WHERE id = p_voucher_id AND status = 'PENDING_APPROVAL'
    RETURNING voucher_number, payee INTO v_number, v_payee;
  ELSE
    UPDATE public.disbursement_vouchers
    SET status = 'REJECTED', approved_by = auth.uid(), approved_at = now(), rejection_reason = p_reason
    WHERE id = p_voucher_id AND status = 'PENDING_APPROVAL'
    RETURNING voucher_number, payee INTO v_number, v_payee;
  END IF;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'الإذن غير موجود أو ليس بانتظار الاعتماد';
  END IF;

  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  VALUES (
    CASE WHEN p_approve THEN 'VOUCHER_APPROVED' ELSE 'VOUCHER_REJECTED' END,
    CASE WHEN p_approve THEN 'تمت الموافقة على إذن صرف' ELSE 'تم رفض إذن صرف' END,
    format('إذن %s للمستفيد %s%s', v_number, v_payee, CASE WHEN p_reason IS NOT NULL THEN ' — السبب: ' || p_reason ELSE '' END),
    format('/vouchers?highlight=%s', p_voucher_id::text),
    CASE WHEN p_approve THEN 'success' ELSE 'danger' END,
    'disbursement_voucher',
    p_voucher_id::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_voucher_for_approval(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_voucher_approval(uuid, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
