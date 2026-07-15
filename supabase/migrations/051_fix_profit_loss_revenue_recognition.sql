-- ============================================================
-- Migration 051: إصلاح قائمة الأرباح والخسائر
-- ============================================================
-- المشكلة (1): 348 من 349 مطالبة إيجار أُدخلت عبر backfill متجاوزة
--   المحفّز process_tenant_charge_posting، فلم يُنشأ لها قيد اعتراف
--   بالإيراد (مدين AST-REC + دائن REV-RNT). النتيجة: الدفتر لا يعترف
--   بإيراد الإيجار (~2.08M) بينما يعترف بالمصروفات → قائمة خسائر مضلِّلة.
-- المشكلة (2): دالة get_profit_loss تضع شروط التاريخ/الحالة في LEFT JOIN ON
--   بدل WHERE، فلا تُفلتر القيود فعلياً (نفس الأرقام لأي فترة + تُضمَّن القيود المعكوسة).
-- الحل:
--   (أ) Backfill idempotent لقيود CHARGE الناقصة بتاريخ due_date.
--   (ب) إعادة كتابة get_profit_loss بفلترة صحيحة (status='POSTED' + نطاق التاريخ).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- (أ) Backfill: إنشاء قيود اعتراف الإيراد للمطالبات الناقصة
--     إدراج مباشر في journal_entries/journal_lines متجاوزاً فحص
--     الفترة المغلقة في post_to_ledger (تصحيح تاريخي شرعي).
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rec_cat uuid;
  v_rnt_cat uuid;
  v_srv_cat uuid;
  v_charge RECORD;
  v_rev_cat uuid;
  v_period uuid;
  v_version int;
  v_je uuid;
  v_tenant uuid;
  v_count int := 0;
BEGIN
  SELECT id INTO v_rec_cat FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
  SELECT id INTO v_rnt_cat FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  SELECT id INTO v_srv_cat FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;

  IF v_rec_cat IS NULL OR v_rnt_cat IS NULL THEN
    RAISE NOTICE 'AST-REC أو REV-RNT غير موجود — لا يمكن الترحيل.';
    RETURN;
  END IF;

  -- تجاوز محفّز الترحيل أثناء الإدراج المباشر
  PERFORM set_config('fluxen.skip_charge_posting', '1', true);

  FOR v_charge IN
    SELECT tc.id, tc.type, tc.amount, tc.due_date, tc.description, tc.contract_id
    FROM public.tenant_charges tc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id
    )
    AND tc.amount > 0
  LOOP
    v_rev_cat := CASE WHEN v_charge.type = 'SERVICE' THEN COALESCE(v_srv_cat, v_rnt_cat) ELSE v_rnt_cat END;

    -- الفترة المالية (إن وُجدت)
    SELECT id INTO v_period FROM public.fiscal_periods
    WHERE v_charge.due_date BETWEEN start_date AND end_date LIMIT 1;

    -- رقم إصدار القيد لهذا المصدر
    SELECT COALESCE(MAX(posting_version), 0) + 1 INTO v_version
    FROM public.journal_entries
    WHERE source_type = 'CHARGE' AND source_id = v_charge.id;

    -- المستأجر من العقد
    SELECT tenant_id INTO v_tenant FROM public.lease_contracts WHERE id = v_charge.contract_id LIMIT 1;

    -- إدراج رأس القيد
    INSERT INTO public.journal_entries (
      reference, entry_date, description, notes, status, period_id,
      source_type, source_id, posting_version, created_by_user_id, posted_at
    ) VALUES (
      'CHARGE #' || SUBSTR(v_charge.id::text, 1, 8),
      v_charge.due_date,
      COALESCE(v_charge.description, 'اعتراف إيراد إيجار'),
      'backfill 051',
      'POSTED',
      v_period,
      'CHARGE',
      v_charge.id,
      v_version,
      NULL,
      now()
    )
    RETURNING id INTO v_je;

    -- مدين: ذمم المستأجرين (AST-REC)
    INSERT INTO public.journal_lines (
      journal_id, category_id, debit, credit, description, sort_order, contact_id
    ) VALUES (
      v_je, v_rec_cat, v_charge.amount, 0,
      COALESCE(v_charge.description, 'اعتراف إيراد إيجار'), 0, v_tenant
    );

    -- دائن: إيراد الإيجار (REV-RNT أو REV-SRV)
    INSERT INTO public.journal_lines (
      journal_id, category_id, debit, credit, description, sort_order, contact_id
    ) VALUES (
      v_je, v_rev_cat, 0, v_charge.amount,
      COALESCE(v_charge.description, 'اعتراف إيراد إيجار'), 1, v_tenant
    );

    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('fluxen.skip_charge_posting', '0', true);
  RAISE NOTICE 'Backfill 051: تم إنشاء % قيد اعتراف إيراد', v_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (ب) إصلاح get_profit_loss: فلترة صحيحة بـ status + نطاق التاريخ
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  p_period text DEFAULT 'year',
  p_quarter int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
  result jsonb;
BEGIN
  IF p_period = 'year' THEN
    start_date := make_date(p_year, 1, 1);
    end_date := make_date(p_year + 1, 1, 1);
  ELSIF p_period = 'quarter' AND p_quarter IS NOT NULL THEN
    start_date := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
    end_date := start_date + INTERVAL '3 months';
  ELSIF p_period = 'month' AND p_month IS NOT NULL THEN
    start_date := make_date(p_year, p_month, 1);
    end_date := start_date + INTERVAL '1 month';
  ELSE
    start_date := make_date(p_year, 1, 1);
    end_date := make_date(p_year + 1, 1, 1);
  END IF;

  WITH revenue_data AS (
    SELECT
      c.id as category_id,
      c.code as category_code,
      c.name_ar as category_name,
      c.color,
      COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) as amount
    FROM public.categories c
    JOIN public.journal_lines jl ON jl.category_id = c.id
    JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date >= start_date
      AND je.entry_date < end_date
    WHERE c.type = 'REVENUE' AND c.active = true
    GROUP BY c.id, c.code, c.name_ar, c.color
    HAVING COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) != 0
  ),
  expense_data AS (
    SELECT
      c.id as category_id,
      c.code as category_code,
      c.name_ar as category_name,
      c.color,
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) as amount
    FROM public.categories c
    JOIN public.journal_lines jl ON jl.category_id = c.id
    JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date >= start_date
      AND je.entry_date < end_date
    WHERE c.type = 'EXPENSE' AND c.active = true
    GROUP BY c.id, c.code, c.name_ar, c.color
    HAVING COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) != 0
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(amount) FROM revenue_data), 0) as total_revenue,
      COALESCE((SELECT SUM(amount) FROM expense_data), 0) as total_expense
  )
  SELECT jsonb_build_object(
    'revenue', (
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'amount', amount,
        'percentage', CASE
          WHEN (SELECT total_revenue FROM totals) > 0
          THEN ROUND((amount / (SELECT total_revenue FROM totals)) * 100, 1)
          ELSE 0
        END,
        'color', color
      ) ORDER BY amount DESC)
      FROM revenue_data
    ),
    'expenses', (
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'amount', amount,
        'percentage', CASE
          WHEN (SELECT total_expense FROM totals) > 0
          THEN ROUND((amount / (SELECT total_expense FROM totals)) * 100, 1)
          ELSE 0
        END,
        'color', color
      ) ORDER BY amount DESC)
      FROM expense_data
    ),
    'summary', jsonb_build_object(
      'total_revenue', (SELECT total_revenue FROM totals),
      'total_expense', (SELECT total_expense FROM totals),
      'net_profit', (SELECT total_revenue - total_expense FROM totals),
      'profit_margin', CASE
        WHEN (SELECT total_revenue FROM totals) > 0
        THEN ROUND(((SELECT total_revenue - total_expense FROM totals) / (SELECT total_revenue FROM totals)) * 100, 1)
        ELSE 0
      END
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_loss TO authenticated;
