-- ============================================================
-- Migration 049: ترحيل سندات الصرف عند الاعتماد فقط (Maker-Checker حقيقي)
-- ============================================================
-- المشكلة: الترِيغر process_disbursement_voucher_posting (هجرة 020) كان
-- يُرحّل إذن الصرف إلى دفتر الأستاذ والخزينة فور INSERT (حتى وهو DRAFT)،
-- فيضرب الرصيد والموازنة قبل الاعتماد. وبما أن هجرة 044 أضافت سير اعتماد
-- حقيقي (DRAFT → PENDING_APPROVAL → APPROVED / REJECTED)، صار الترحيل
-- المبكر يجعل الاعتماد شكلياً من ناحية المحاسبة.
--
-- الحل: إعادة تعريف الدالة لتكون مدركة للحالة:
--   * INSERT  : لا تُرحّل إلا إذا status = 'APPROVED'.
--   * UPDATE  : اعكس القيد السابق فقط إذا كان OLD.status='APPROVED'، ثم
--               أرحّل الجديد فقط إذا NEW.status='APPROVED'.
--   * DELETE  : اعكس القيد فقط إذا كان OLD.status='APPROVED'.
-- النتيجة: السند لا يظهر في الدفتر/الخزينة/الموازنة إلا بعد الاعتماد،
-- ورفضه يعكس أي أثر سابق.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_disbursement_voucher_posting()
RETURNS TRIGGER AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_exp_cat_id uuid;
  v_desc text;
BEGIN
  -- عكس القيد السابق فقط إذا كان الإذن معتمداً (مرحَّل سابقاً)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'APPROVED' THEN
    PERFORM public.reverse_ledger_entry('VOUCHER', OLD.id, OLD.created_by);
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit_log(
      'DELETE', 'disbursement_voucher', OLD.id,
      'إذن صرف #' || OLD.voucher_number,
      'حذف إذن صرف #' || OLD.voucher_number || ' — ' || OLD.total_amount::text || ' د.ل',
      OLD.voucher_date, OLD.total_amount, OLD.cashbox_id, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  -- لا تُرحّل إلا السندات المعتمدة
  IF NEW.status <> 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  v_exp_cat_id := COALESCE(
    NEW.category_id,
    (SELECT id FROM public.categories WHERE type = 'EXPENSE' AND active = true ORDER BY sort_order LIMIT 1)
  );

  IF v_cash_cat_id IS NULL OR v_exp_cat_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_desc := 'إذن صرف #' || NEW.voucher_number || ' — ' || NEW.payee;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_exp_cat_id,
    'debit', NEW.total_amount,
    'credit', 0,
    'description', v_desc
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_cash_cat_id,
    'debit', 0,
    'credit', NEW.total_amount,
    'description', v_desc,
    'cashbox_id', NEW.cashbox_id
  );

  PERFORM public.post_to_ledger(
    'VOUCHER',
    NEW.id,
    NEW.voucher_date,
    v_desc,
    NEW.notes,
    NEW.created_by,
    v_lines
  );

  PERFORM public.write_audit_log(
    'INSERT', 'disbursement_voucher', NEW.id,
    'إذن #' || NEW.voucher_number,
    'اعتماد وترحيل إذن صرف #' || NEW.voucher_number || ' — ' || NEW.payee || ' — −' || NEW.total_amount::text || ' د.ل',
    NEW.voucher_date, -NEW.total_amount, NEW.cashbox_id, 'warning',
    jsonb_build_object('payee', NEW.payee, 'amount', NEW.total_amount, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
