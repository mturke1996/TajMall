-- ============================================================
-- Migration 052: تحصين ترحيل المعاملات ضد فراغ حساب الخزينة
-- ============================================================
-- المشكلة: عند إنشاء إيراد أو مصروف، يُرحّل تريغر
--   process_transaction_posting بنداً نقدياً (مدين/دائن) يستخدم
--   v_cash_cat_id المجلوب من account_mappings (source_type='REVENUE_CASH_ASSET').
--   إذا كان السطر ناقصاً أو category_id فيه NULL (مثلاً حُذف بند AST-CSH)،
--   يصبح category_id للبند النقدي NULL فيُخالف قيد NOT NULL على
--   journal_lines.category_id، فيُلغى الإدراج بالكامل ويفشل حفظ المعاملة
--   برسالة عامة "فشل الحفظ" — ويصيب الإيراد والمصروف معاً.
--
-- الحل: إذا كان account_mappings ناقصاً، نرجع مباشرة إلى بند AST-CSH،
--   وإن لم يوجد نُطلق استثناءً عربياً واضحاً بدل خطأ NOT NULL الغامض.
--   (نفس نمط 018/020/049 التي تختار AST-CSH مباشرة.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_transaction_posting()
RETURNS TRIGGER AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_rec_cat_id uuid;
  v_dep_cat_id uuid;
  v_rent_cat_id uuid;
  v_is_rent boolean := false;
  v_is_deposit boolean := false;
BEGIN
  -- Get standard categories
  SELECT category_id INTO v_cash_cat_id FROM public.account_mappings WHERE source_type = 'REVENUE_CASH_ASSET' LIMIT 1;

  -- Fallback: إذا كان الربط ناقصاً أو NULL، استخدم بند AST-CSH مباشرة
  IF v_cash_cat_id IS NULL THEN
    SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  END IF;
  IF v_cash_cat_id IS NULL THEN
    RAISE EXCEPTION 'تعذّر الترحيل: حساب الخزينة/النقد (AST-CSH) غير معرّف ولا يوجد رابط في account_mappings. شغّل هجرة 013 لتعريف البند وربطه.';
  END IF;

  SELECT category_id INTO v_rec_cat_id FROM public.account_mappings WHERE source_type = 'AST-REC' OR source_type = 'RENT_REVENUE' LIMIT 1; -- Fallback
  SELECT category_id INTO v_dep_cat_id FROM public.account_mappings WHERE source_type = 'DEPOSIT_LIABILITY' LIMIT 1;

  -- Rent revenue category
  SELECT id INTO v_rent_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;

  IF NEW.category_id = v_rent_cat_id THEN
    v_is_rent := true;
  END IF;

  SELECT category_id INTO v_rec_cat_id FROM public.account_mappings WHERE source_type = 'RENT_REVENUE' LIMIT 1;

  -- Check if it is deposit (using category code LIA-DEP)
  IF EXISTS (SELECT 1 FROM public.categories WHERE id = NEW.category_id AND code = 'LIA-DEP') THEN
    v_is_deposit := true;
  END IF;

  -- Check if transaction is updated or deleted
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    -- Reverse the old entry first
    PERFORM public.reverse_ledger_entry('TRANSACTION', OLD.id, OLD.created_by);
  END IF;

  -- If it's a delete or voided status, stop here after reversing
  IF (TG_OP = 'DELETE' OR NEW.status != 'POSTED') THEN
    RETURN OLD;
  END IF;

  -- Build Journal Lines based on transaction kind
  IF NEW.kind = 'REVENUE' THEN
    -- Deposit to Cashbox (Debit Cashbox Asset)
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', NEW.description,
      'cashbox_id', NEW.cashbox_id
    );

    IF v_is_deposit = true THEN
      -- Deposit received (Credit Deposit Liability)
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_dep_cat_id,
        'debit', 0,
        'credit', NEW.amount,
        'description', 'تأمين مستأجر مستلم: ' || COALESCE(NEW.description, ''),
        'contact_id', NEW.contact_id
      );
    ELSIF v_is_rent = true AND NEW.contact_id IS NOT NULL THEN
      -- Rent payment (Credit Tenants Receivables - reducing customer's outstanding balance)
      -- Find rec category AST-REC
      SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
      v_lines := v_lines || jsonb_build_object(
        'category_id', COALESCE(v_rec_cat_id, NEW.category_id),
        'debit', 0,
        'credit', NEW.amount,
        'description', 'سداد إيجار مستحق: ' || COALESCE(NEW.description, ''),
        'contact_id', NEW.contact_id
      );
    ELSE
      -- Generic Revenue (Credit Revenue Category)
      v_lines := v_lines || jsonb_build_object(
        'category_id', NEW.category_id,
        'debit', 0,
        'credit', NEW.amount,
        'description', NEW.description,
        'contact_id', NEW.contact_id
      );
    END IF;

  ELSIF NEW.kind = 'EXPENSE' THEN
    -- Debit Expense Category
    v_lines := v_lines || jsonb_build_object(
      'category_id', NEW.category_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', NEW.description,
      'contact_id', NEW.contact_id
    );

    -- Credit Cashbox Asset
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', 0,
      'credit', NEW.amount,
      'description', NEW.description,
      'cashbox_id', NEW.cashbox_id
    );

  ELSIF NEW.kind = 'OPENING' THEN
    -- Debit Cashbox Asset
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_cash_cat_id,
      'debit', NEW.amount,
      'credit', 0,
      'description', 'رصيد افتتاحي: ' || COALESCE(NEW.description, ''),
      'cashbox_id', NEW.cashbox_id
    );

    -- Credit Opening Balance Equity
    SELECT id INTO v_dep_cat_id FROM public.categories WHERE code = 'EQ-OPB' LIMIT 1;
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_dep_cat_id,
      'debit', 0,
      'credit', NEW.amount,
      'description', 'رصيد افتتاحي رأس المال',
      'contact_id', NEW.contact_id
    );
  END IF;

  -- Post the Journal Entry
  PERFORM public.post_to_ledger(
    'TRANSACTION',
    NEW.id,
    NEW.tx_date,
    NEW.description,
    NEW.notes,
    NEW.created_by,
    v_lines
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
