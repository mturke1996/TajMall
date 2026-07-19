-- ============================================================
-- Migration 055: إقفال السنة يدوياً بعد المعاينة
-- - preview_fiscal_year_close: قراءة فقط (تحقق)
-- - close_fiscal_year: ينفّذ القيد فقط عند الاستدعاء الصريح
-- - إغلاق الفترات اختيارياً (افتراضي: لا — يدوي من أزرار الفترات)
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_fiscal_year_close(p_year int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := make_date(p_year, 1, 1);
  v_end date := make_date(p_year, 12, 31);
  v_source_id uuid := public.year_close_source_id(p_year);
  v_already uuid;
  v_rev numeric := 0;
  v_exp numeric := 0;
  v_open_periods int := 0;
  v_closed_periods int := 0;
BEGIN
  IF auth.uid() IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;

  SELECT je.id INTO v_already
  FROM public.journal_entries je
  WHERE je.source_type = 'YEAR_CLOSE'
    AND je.source_id = v_source_id
    AND je.status = 'POSTED'
  LIMIT 1;

  SELECT
    COALESCE(SUM(CASE WHEN c.type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_rev, v_exp
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= v_start
    AND je.entry_date <= v_end
    AND c.type IN ('REVENUE', 'EXPENSE')
    AND COALESCE(je.source_type, '') IS DISTINCT FROM 'YEAR_CLOSE';

  SELECT
    COUNT(*) FILTER (WHERE NOT is_closed)::int,
    COUNT(*) FILTER (WHERE is_closed)::int
  INTO v_open_periods, v_closed_periods
  FROM public.fiscal_periods
  WHERE end_date >= v_start
    AND start_date <= v_end;

  RETURN jsonb_build_object(
    'year', p_year,
    'already_closed', v_already IS NOT NULL,
    'existing_journal_id', v_already,
    'total_revenue', v_rev,
    'total_expense', v_exp,
    'net_income', v_rev - v_exp,
    'open_periods', v_open_periods,
    'closed_periods', v_closed_periods,
    'can_close', v_already IS NULL AND (ABS(v_rev) > 0.001 OR ABS(v_exp) > 0.001)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_year int,
  p_close_periods boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_re_id uuid;
  v_start date := make_date(p_year, 1, 1);
  v_end date := make_date(p_year, 12, 31);
  v_lines jsonb := '[]'::jsonb;
  v_rev numeric;
  v_exp numeric;
  v_net numeric;
  r record;
  v_journal_id uuid;
  v_already uuid;
  v_source_id uuid := public.year_close_source_id(p_year);
  v_closed_periods int := 0;
  v_was_closed uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: إقفال السنة يتطلب محاسب أو مدير.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_re_id FROM public.categories WHERE code = 'EQ-RE' AND active = true LIMIT 1;
  IF v_re_id IS NULL THEN
    RAISE EXCEPTION 'حساب الأرباح المحتجزة EQ-RE غير موجود';
  END IF;

  SELECT je.id INTO v_already
  FROM public.journal_entries je
  WHERE je.source_type = 'YEAR_CLOSE'
    AND je.source_id = v_source_id
    AND je.status = 'POSTED'
  LIMIT 1;

  IF v_already IS NOT NULL THEN
    RAISE EXCEPTION 'السنة % مُقفَلة محاسبياً مسبقاً', p_year;
  END IF;

  FOR r IN
    SELECT
      c.id AS category_id,
      c.name_ar,
      COALESCE(SUM(jl.credit - jl.debit), 0) AS bal
    FROM public.categories c
    JOIN public.journal_lines jl ON jl.category_id = c.id
    JOIN public.journal_entries je ON je.id = jl.journal_id
    WHERE c.type = 'REVENUE'
      AND c.active = true
      AND je.status = 'POSTED'
      AND je.entry_date >= v_start
      AND je.entry_date <= v_end
      AND COALESCE(je.source_type, '') IS DISTINCT FROM 'YEAR_CLOSE'
    GROUP BY c.id, c.name_ar
    HAVING ABS(COALESCE(SUM(jl.credit - jl.debit), 0)) > 0.001
  LOOP
    v_lines := v_lines || jsonb_build_object(
      'category_id', r.category_id,
      'debit', r.bal,
      'credit', 0,
      'description', 'إقفال إيراد ' || r.name_ar || ' لسنة ' || p_year
    );
  END LOOP;

  FOR r IN
    SELECT
      c.id AS category_id,
      c.name_ar,
      COALESCE(SUM(jl.debit - jl.credit), 0) AS bal
    FROM public.categories c
    JOIN public.journal_lines jl ON jl.category_id = c.id
    JOIN public.journal_entries je ON je.id = jl.journal_id
    WHERE c.type = 'EXPENSE'
      AND c.active = true
      AND je.status = 'POSTED'
      AND je.entry_date >= v_start
      AND je.entry_date <= v_end
      AND COALESCE(je.source_type, '') IS DISTINCT FROM 'YEAR_CLOSE'
    GROUP BY c.id, c.name_ar
    HAVING ABS(COALESCE(SUM(jl.debit - jl.credit), 0)) > 0.001
  LOOP
    v_lines := v_lines || jsonb_build_object(
      'category_id', r.category_id,
      'debit', 0,
      'credit', r.bal,
      'description', 'إقفال مصروف ' || r.name_ar || ' لسنة ' || p_year
    );
  END LOOP;

  SELECT
    COALESCE(SUM(CASE WHEN c.type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_rev, v_exp
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= v_start
    AND je.entry_date <= v_end
    AND c.type IN ('REVENUE', 'EXPENSE')
    AND COALESCE(je.source_type, '') IS DISTINCT FROM 'YEAR_CLOSE';

  v_net := v_rev - v_exp;

  IF jsonb_array_length(v_lines) = 0 AND ABS(v_net) < 0.001 THEN
    RAISE EXCEPTION 'لا توجد أرصدة إيراد/مصروف لإقفالها في سنة %', p_year;
  END IF;

  IF v_net >= 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_re_id,
      'debit', 0,
      'credit', v_net,
      'description', 'صافي ربح سنة ' || p_year || ' → أرباح محتجزة'
    );
  ELSE
    v_lines := v_lines || jsonb_build_object(
      'category_id', v_re_id,
      'debit', ABS(v_net),
      'credit', 0,
      'description', 'صافي خسارة سنة ' || p_year || ' → أرباح محتجزة'
    );
  END IF;

  -- افتح مؤقتاً الفترات المغلقة للسماح بالترحيل
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_was_closed
  FROM public.fiscal_periods
  WHERE end_date >= v_start
    AND start_date <= v_end
    AND is_closed = true;

  IF cardinality(v_was_closed) > 0 THEN
    UPDATE public.fiscal_periods
    SET is_closed = false
    WHERE id = ANY (v_was_closed);
  END IF;

  v_journal_id := public.post_to_ledger(
    'YEAR_CLOSE',
    v_source_id,
    v_end,
    'إقفال السنة المالية ' || p_year,
    'قيد إقفال يدوي بعد التحقق — الإيرادات والمصروفات → أرباح محتجزة',
    auth.uid(),
    v_lines
  );

  IF p_close_periods THEN
    UPDATE public.fiscal_periods
    SET
      is_closed = true,
      closed_at = now(),
      closed_by = auth.uid()
    WHERE end_date >= v_start
      AND start_date <= v_end;

    GET DIAGNOSTICS v_closed_periods = ROW_COUNT;
  ELSIF cardinality(v_was_closed) > 0 THEN
    -- استعد ما كان مغلقاً فقط — لا إغلاق تلقائي لفترات كانت مفتوحة
    UPDATE public.fiscal_periods
    SET
      is_closed = true,
      closed_at = COALESCE(closed_at, now()),
      closed_by = COALESCE(closed_by, auth.uid())
    WHERE id = ANY (v_was_closed);

    GET DIAGNOSTICS v_closed_periods = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'year', p_year,
    'journal_id', v_journal_id,
    'total_revenue', v_rev,
    'total_expense', v_exp,
    'net_income', v_net,
    'periods_closed', v_closed_periods,
    'periods_auto_closed', p_close_periods
  );
END;
$$;

-- توافق الاستدعاء القديم: close_fiscal_year(year) بدون إغلاق فترات تلقائي
DROP FUNCTION IF EXISTS public.close_fiscal_year(int);

CREATE OR REPLACE FUNCTION public.close_fiscal_year(p_year int)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.close_fiscal_year(p_year, false);
$$;

GRANT EXECUTE ON FUNCTION public.preview_fiscal_year_close(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(int, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
