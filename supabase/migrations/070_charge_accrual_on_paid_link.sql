-- ============================================================
-- Migration 070: لا تتخطَّ اعتراف إيراد CHARGE عند ربط دفع
-- ============================================================
-- المشكلة: process_tenant_charge_posting يخرج مبكراً عندما تصبح
-- المطالبة PAID مع journal_entry_id (قيد تحصيل/معاملة) دون التأكد
-- من وجود قيد CHARGE (مدين AST-REC / دائن REV-RNT). النتيجة: قيد
-- اليومية الشهري يُظهر إيراد إيجار ناقصاً رغم وجود مطالبات.
-- الحل:
--   1) التخطي المبكر فقط إن وُجد قيد CHARGE مرحَّل للمطالبة.
--   2) عند إنشاء قيد الاعتراف لا نستبدل journal_entry_id إن كان
--      يشير لقيد تحصيل (وليس CHARGE لنفس المطالبة).
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_tenant_charge_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_rec_cat_id uuid;
  v_rev_cat_id uuid;
  v_tenant_id uuid;
  v_journal_id uuid;
  v_has_charge_accrual boolean := false;
  v_keep_existing_link boolean := false;
BEGIN
  IF current_setting('fluxen.skip_charge_posting', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;

  IF NEW.type = 'SERVICE' THEN
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;
  ELSE
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.lease_contracts
  WHERE id = NEW.contract_id;

  IF TG_OP = 'UPDATE' THEN
    -- تسوية يدوية: شهر مدفوع + ربط بقيد دفع — فقط إن وُجد استحقاق CHARGE مسبقاً
    IF NEW.status = 'PAID'
      AND NEW.journal_entry_id IS NOT NULL
      AND OLD.amount IS NOT DISTINCT FROM NEW.amount
      AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date
      AND OLD.contract_id IS NOT DISTINCT FROM NEW.contract_id
    THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.source_type = 'CHARGE'
          AND je.source_id = NEW.id
          AND je.status = 'POSTED'
      ) INTO v_has_charge_accrual;

      IF v_has_charge_accrual THEN
        RETURN NEW;
      END IF;
      -- لا يوجد قيد اعتراف: نتابع لإنشائه دون عكس رابط التحصيل أدناه
    ELSE
      PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    RETURN OLD;
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rec_cat_id,
    'debit', NEW.amount,
    'credit', 0,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rev_cat_id,
    'debit', 0,
    'credit', NEW.amount,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_journal_id := public.post_to_ledger(
    'CHARGE',
    NEW.id,
    NEW.due_date,
    NEW.description,
    NULL,
    NULL,
    v_lines
  );

  IF NEW.journal_entry_id IS DISTINCT FROM v_journal_id THEN
    -- لا تستبدل رابط تحصيل موجود بقيد الاعتراف
    IF NEW.journal_entry_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.id = NEW.journal_entry_id
          AND (
            je.source_type IS DISTINCT FROM 'CHARGE'
            OR je.source_id IS DISTINCT FROM NEW.id
          )
      ) INTO v_keep_existing_link;
    END IF;

    IF NOT v_keep_existing_link THEN
      PERFORM set_config('fluxen.skip_charge_posting', '1', true);
      UPDATE public.tenant_charges
      SET journal_entry_id = v_journal_id
      WHERE id = NEW.id;
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
