-- ============================================================
-- Migration 053: سلامة محاسبية + أمن الصلاحيات
-- ============================================================
-- 1) محرّك العكس: إبطال فقط (REVERSED) دون قيد معاكس يفسد الدفاتر
-- 2) إصلاح تاريخي للقيود العكسية الخاطئة
-- 3) قفل الفترة على المسارات اليدوية
-- 4) فحص أدوار داخل SECURITY DEFINER
-- 5) ميزانية: إدراج صافي ربح الفترة ضمن حقوق الملكية
-- 6) قيود CHECK على أسطر القيد
-- 7) منع admin→owner الذاتي + بوابة المستأجر + إشعارات
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- (أ) مساعدو الصلاحيات والفترات
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_may_manage_journals()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR public.get_my_role() IN ('owner', 'admin', 'accountant');
$$;

CREATE OR REPLACE FUNCTION public.auth_may_manage_accounts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR public.get_my_role() IN ('owner', 'admin', 'accountant');
$$;

GRANT EXECUTE ON FUNCTION public.auth_may_manage_journals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_may_manage_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_fiscal_period_open(p_entry_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_is_closed boolean;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.assert_fiscal_period_open(date) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (ب) إصلاح تاريخي: إبطال القيود العكسية المضاعِفة
-- ────────────────────────────────────────────────────────────
-- النموذج الخاطئ السابق: الأصل REVERSED + قيد معاكس POSTED
-- → استبعاد الأصل من التقارير وترك أثر العكس = سالب الأصل.
-- الإصلاح: إبطال كل القيود المعاكسة المرتبطة بأصل مُبطَل.

UPDATE public.journal_entries AS rev
SET
  status = 'REVERSED',
  reversed_at = COALESCE(rev.reversed_at, now()),
  notes = TRIM(BOTH FROM COALESCE(rev.notes, '') || ' [053: إبطال قيد عكسي مضاعِف]')
FROM public.journal_entries AS orig
WHERE rev.status = 'POSTED'
  AND rev.reversal_of_entry_id IS NOT NULL
  AND orig.id = rev.reversal_of_entry_id
  AND orig.status = 'REVERSED';

-- قيود عكسية يدوية بلا رابط لكن بعلامات نصية واضحة وأصل مُبطَل بنفس المرجع
UPDATE public.journal_entries AS rev
SET
  status = 'REVERSED',
  reversed_at = COALESCE(rev.reversed_at, now()),
  notes = TRIM(BOTH FROM COALESCE(rev.notes, '') || ' [053: إبطال قيد عكسي مضاعِف]')
WHERE rev.status = 'POSTED'
  AND rev.reversal_of_entry_id IS NULL
  AND (
    rev.notes ILIKE '%Auto-generated reversal%'
    OR rev.notes ILIKE '%عكس تلقائي%'
    OR rev.reference ILIKE '%(Reversal)%'
    OR rev.reference ILIKE '%(عكسي)%'
  )
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries orig
    WHERE orig.status = 'REVERSED'
      AND orig.id IS DISTINCT FROM rev.id
      AND (
        rev.reference ILIKE (COALESCE(orig.reference, '') || '%')
        OR rev.description ILIKE ('%' || COALESCE(orig.number::text, '') || '%')
      )
  );

-- ────────────────────────────────────────────────────────────
-- (ج) محرّك العكس: إبطال فقط
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_ledger_entry(
  p_source_type text,
  p_source_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_entry record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL
     AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكن عكس قيد تلقائي بدون صلاحية كتابة.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_original_entry
  FROM public.journal_entries
  WHERE source_type = p_source_type
    AND source_id = p_source_id
    AND status = 'POSTED'
  ORDER BY posting_version DESC
  LIMIT 1;

  IF v_original_entry IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.assert_fiscal_period_open(v_original_entry.entry_date);

  -- إبطال فقط — بدون قيد معاكس (يتجنب مضاعفة الأثر في التقارير)
  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = v_original_entry.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original record;
BEGIN
  IF NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: عكس القيود يتطلب دور محاسب أو مدير.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO original
  FROM public.journal_entries
  WHERE id = p_journal_id::uuid AND status = 'POSTED'
  FOR UPDATE;

  IF original IS NULL THEN
    RAISE EXCEPTION 'Posted journal entry not found';
  END IF;

  PERFORM public.assert_fiscal_period_open(original.entry_date);

  -- معاملة مالية: حذفها يعكس القيد عبر reverse_ledger_entry ويحدّث الخزينة
  IF original.source_type = 'TRANSACTION' AND original.source_id IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE id = original.source_id AND status = 'POSTED';

    IF FOUND THEN
      PERFORM public.purge_rent_links_for_journal(original.id);
      RETURN original.id::text;
    END IF;
  END IF;

  PERFORM public.purge_rent_links_for_journal(original.id);

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = original.id
    AND status = 'POSTED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعذّر عكس القيد — ربما عُكس مسبقاً.';
  END IF;

  RETURN original.id::text;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (د) إنشاء / تحديث / ترحيل القيود — صلاحيات + فترة + ترحيل ذري
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_reference text DEFAULT NULL,
  p_entry_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_journal_id uuid;
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
  v_reference text;
  v_period_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: إنشاء القيود يتطلب دور محاسب أو مدير.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry requires at least 2 lines';
  END IF;

  v_period_id := public.assert_fiscal_period_open(COALESCE(p_entry_date, CURRENT_DATE));

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((line->>'debit')::numeric, 0);
    v_credit := COALESCE((line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'مبالغ السطر يجب أن تكون غير سالبة';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يجوز أن يحتوي السطر على مدين ودائن معاً';
    END IF;
    total_debit := total_debit + v_debit;
    total_credit := total_credit + v_credit;
  END LOOP;

  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
  END IF;

  IF total_debit = 0 THEN
    RAISE EXCEPTION 'Journal entry must have non-zero amounts';
  END IF;

  v_reference := NULLIF(trim(p_reference), '');
  IF v_reference IS NULL THEN
    v_reference := public.generate_journal_reference(p_entry_date);
  END IF;

  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status,
    period_id
  ) VALUES (
    v_reference,
    p_entry_date,
    p_description,
    p_notes,
    'DRAFT',
    v_period_id
  )
  RETURNING id INTO new_journal_id;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((line->>'debit')::numeric, 0);
    v_credit := COALESCE((line->>'credit')::numeric, 0);
    IF v_debit = 0 AND v_credit = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order,
      contact_id,
      cashbox_id
    ) VALUES (
      new_journal_id,
      (line->>'category_id')::uuid,
      v_debit,
      v_credit,
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0),
      NULLIF(line->>'contact_id', '')::uuid,
      NULLIF(line->>'cashbox_id', '')::uuid
    );
  END LOOP;

  RETURN new_journal_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_journal_entry(
  p_journal_id uuid,
  p_reference text DEFAULT NULL,
  p_entry_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
  v_status journal_status;
  v_period_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: تعديل القيود يتطلب دور محاسب أو مدير.'
      USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.journal_entries
  WHERE id = p_journal_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft entries can be updated';
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry requires at least 2 lines';
  END IF;

  v_period_id := public.assert_fiscal_period_open(COALESCE(p_entry_date, CURRENT_DATE));

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((line->>'debit')::numeric, 0);
    v_credit := COALESCE((line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'مبالغ السطر يجب أن تكون غير سالبة';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يجوز أن يحتوي السطر على مدين ودائن معاً';
    END IF;
    total_debit := total_debit + v_debit;
    total_credit := total_credit + v_credit;
  END LOOP;

  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
  END IF;

  IF total_debit = 0 THEN
    RAISE EXCEPTION 'Journal entry must have non-zero amounts';
  END IF;

  UPDATE public.journal_entries
  SET
    reference = p_reference,
    entry_date = p_entry_date,
    description = p_description,
    notes = p_notes,
    period_id = v_period_id,
    updated_at = now()
  WHERE id = p_journal_id;

  DELETE FROM public.journal_lines WHERE journal_id = p_journal_id;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((line->>'debit')::numeric, 0);
    v_credit := COALESCE((line->>'credit')::numeric, 0);
    IF v_debit = 0 AND v_credit = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order,
      contact_id,
      cashbox_id
    ) VALUES (
      p_journal_id,
      (line->>'category_id')::uuid,
      v_debit,
      v_credit,
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0),
      NULLIF(line->>'contact_id', '')::uuid,
      NULLIF(line->>'cashbox_id', '')::uuid
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(p_journal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status journal_status;
  v_total_debit numeric;
  v_total_credit numeric;
  v_entry_date date;
  v_period_id uuid;
  v_updated int;
BEGIN
  IF NOT public.auth_may_manage_journals() THEN
    RAISE EXCEPTION 'غير مصرح: ترحيل القيود يتطلب دور محاسب أو مدير.'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, entry_date
  INTO v_status, v_entry_date
  FROM public.journal_entries
  WHERE id = p_journal_id::uuid
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  SELECT total_debit, total_credit
  INTO v_total_debit, v_total_credit
  FROM public.journal_entries_with_totals
  WHERE id = p_journal_id::uuid;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft entries can be posted';
  END IF;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'Cannot post unbalanced entry';
  END IF;

  IF COALESCE(v_total_debit, 0) = 0 THEN
    RAISE EXCEPTION 'Cannot post zero-amount entry';
  END IF;

  v_period_id := public.assert_fiscal_period_open(v_entry_date);

  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now(), period_id = v_period_id
  WHERE id = p_journal_id::uuid
    AND status = 'DRAFT';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'تعذّر الترحيل — القيد ليس مسودة أو رُحّل مسبقاً.';
  END IF;
END;
$$;

-- post_to_ledger: التوقيع الحي = (…, p_user_id uuid, p_lines jsonb)
DROP FUNCTION IF EXISTS public.post_to_ledger(text, uuid, date, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.post_to_ledger(
  p_source_type text,
  p_source_id uuid,
  p_entry_date date,
  p_description text,
  p_notes text,
  p_user_id uuid,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_journal_id uuid;
  v_version int := 1;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL
     AND NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكن الترحيل التلقائي بدون صلاحية كتابة.'
      USING ERRCODE = '42501';
  END IF;

  v_period_id := public.assert_fiscal_period_open(p_entry_date);

  SELECT COALESCE(MAX(posting_version), 0) + 1 INTO v_version
  FROM public.journal_entries
  WHERE source_type = p_source_type AND source_id = p_source_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'مبالغ السطر يجب أن تكون غير سالبة';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يجوز أن يحتوي السطر على مدين ودائن معاً';
    END IF;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين % != الدائن %', v_total_debit, v_total_credit;
  END IF;

  IF v_total_debit = 0 THEN
    RAISE EXCEPTION 'يجب أن يحتوي القيد على مبالغ أكبر من الصفر.';
  END IF;

  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status,
    period_id,
    source_type,
    source_id,
    posting_version,
    created_by_user_id,
    posted_at
  ) VALUES (
    COALESCE(p_source_type || ' #' || SUBSTR(p_source_id::text, 1, 8), 'AUTO'),
    p_entry_date,
    p_description,
    p_notes,
    'POSTED',
    v_period_id,
    p_source_type,
    p_source_id,
    v_version,
    p_user_id,
    now()
  )
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit = 0 AND v_credit = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order,
      contact_id,
      cashbox_id
    ) VALUES (
      v_journal_id,
      (v_line->>'category_id')::uuid,
      v_debit,
      v_credit,
      v_line->>'description',
      COALESCE((v_line->>'sort_order')::int, 0),
      (v_line->>'contact_id')::uuid,
      (v_line->>'cashbox_id')::uuid
    );
  END LOOP;

  RETURN v_journal_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (هـ) ميزانية: صافي ربح الفترة حتى تاريخ التقرير ضمن Equity
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH category_balances AS (
    SELECT
      c.id AS category_id,
      c.code AS category_code,
      c.name_ar AS category_name,
      c.type AS category_type,
      c.color,
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance
    FROM public.categories c
    LEFT JOIN public.journal_lines jl ON jl.category_id = c.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date <= p_as_of
    WHERE c.active = true
      AND c.type IN ('ASSET', 'LIABILITY', 'EQUITY')
    GROUP BY c.id, c.code, c.name_ar, c.type, c.color
    HAVING ABS(COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)) > 0.001
  ),
  pnl AS (
    SELECT
      COALESCE((
        SELECT SUM(jl.credit) - SUM(jl.debit)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        JOIN public.categories c ON c.id = jl.category_id
        WHERE je.status = 'POSTED'
          AND je.entry_date <= p_as_of
          AND c.type = 'REVENUE'
          AND c.active = true
      ), 0)
      -
      COALESCE((
        SELECT SUM(jl.debit) - SUM(jl.credit)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        JOIN public.categories c ON c.id = jl.category_id
        WHERE je.status = 'POSTED'
          AND je.entry_date <= p_as_of
          AND c.type = 'EXPENSE'
          AND c.active = true
      ), 0) AS net_income
  ),
  section_totals AS (
    SELECT
      category_type,
      SUM(
        CASE
          WHEN category_type = 'ASSET' THEN GREATEST(balance, 0)
          WHEN category_type IN ('LIABILITY', 'EQUITY') THEN GREATEST(-balance, 0)
          ELSE 0
        END
      ) AS section_total
    FROM category_balances
    GROUP BY category_type
  ),
  equity_total AS (
    SELECT
      COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'EQUITY'), 0)
      + COALESCE((SELECT net_income FROM pnl), 0) AS total_equity_with_ni
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'assets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'balance', GREATEST(balance, 0),
        'color', color
      ) ORDER BY category_code), '[]'::jsonb)
      FROM category_balances WHERE category_type = 'ASSET' AND balance > 0.001
    ),
    'liabilities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'balance', GREATEST(-balance, 0),
        'color', color
      ) ORDER BY category_code), '[]'::jsonb)
      FROM category_balances WHERE category_type = 'LIABILITY' AND balance < -0.001
    ),
    'equity', (
      SELECT COALESCE(jsonb_agg(row_obj ORDER BY ord, code), '[]'::jsonb)
      FROM (
        SELECT
          1 AS ord,
          category_code AS code,
          jsonb_build_object(
            'category_id', category_id,
            'category_code', category_code,
            'category_name', category_name,
            'balance', GREATEST(-balance, 0),
            'color', color
          ) AS row_obj
        FROM category_balances
        WHERE category_type = 'EQUITY' AND balance < -0.001
        UNION ALL
        SELECT
          2 AS ord,
          'NI-CY' AS code,
          jsonb_build_object(
            'category_id', '00000000-0000-0000-0000-0000000000ni',
            'category_code', 'NI-CY',
            'category_name', 'صافي ربح / (خسارة) الفترة الجارية',
            'balance', net_income,
            'color', NULL,
            'is_net_income', true
          ) AS row_obj
        FROM pnl
        WHERE ABS(net_income) > 0.001
      ) equity_rows
    ),
    'summary', jsonb_build_object(
      'total_assets', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'ASSET'), 0),
      'total_liabilities', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'LIABILITY'), 0),
      'total_equity', (SELECT total_equity_with_ni FROM equity_total),
      'net_income', COALESCE((SELECT net_income FROM pnl), 0)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (و) قيود CHECK على أسطر القيد + تصحيح kind لدليل الحسابات
-- ────────────────────────────────────────────────────────────

-- تنظيف أسطر صفرية نادرة قبل فرض القيود
DELETE FROM public.journal_lines WHERE debit = 0 AND credit = 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_lines WHERE debit < 0 OR credit < 0) THEN
    RAISE NOTICE '053: توجد أسطر بمبالغ سالبة — تُتخطى قيود CHECK السالبة';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_nonneg_amounts'
  ) THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_nonneg_amounts
      CHECK (debit >= 0 AND credit >= 0);
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_lines WHERE debit > 0 AND credit > 0) THEN
    RAISE NOTICE '053: توجد أسطر بمدين ودائن معاً — تُتخطى قيد not_both_sides';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_not_both_sides'
  ) THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_not_both_sides
      CHECK (NOT (debit > 0 AND credit > 0));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_has_amount'
  ) THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_has_amount
      CHECK (debit > 0 OR credit > 0);
  END IF;
END $$;

-- kind في categories من نوع tx_kind — للأصول/الخصوم/حقوق الملكية نستخدم OPENING/ADJUSTMENT
-- حتى لا تظهر في قوائم الإيراد/المصروف المفلترة بـ kind.
UPDATE public.categories
SET kind = 'OPENING'::tx_kind
WHERE type = 'ASSET' AND kind = 'EXPENSE';

UPDATE public.categories
SET kind = 'ADJUSTMENT'::tx_kind
WHERE type = 'LIABILITY' AND kind IN ('EXPENSE', 'REVENUE');

UPDATE public.categories
SET kind = 'OPENING'::tx_kind
WHERE type = 'EQUITY' AND kind IN ('REVENUE', 'EXPENSE');

-- ────────────────────────────────────────────────────────────
-- (ز) RLS أدق: القيود والحسابات للمحاسب+ فقط
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journal_entries', 'journal_lines', 'categories', 'account_mappings', 'fiscal_periods']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "rbac_insert_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rbac_update_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rbac_delete_%1$s" ON public.%1$I', t);

    EXECUTE format(
      'CREATE POLICY "rbac_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.auth_may_manage_journals())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "rbac_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.auth_may_manage_journals()) WITH CHECK (public.auth_may_manage_journals())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "rbac_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.auth_may_manage_journals())',
      t
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- (ح) منع admin من ترقية نفسه إلى owner
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    -- لا أحد يغيّر دوره الخاص
    IF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'غير مصرح: لا يمكنك تغيير دورك الخاص.'
        USING ERRCODE = '42501';
    END IF;

    -- تعيين owner: فقط owner حالي (وليس الهدف نفسه)
    IF NEW.role = 'owner' AND public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'غير مصرح: تعيين دور المالك يتطلب مالك النظام الحالي.'
        USING ERRCODE = '42501';
    END IF;

    -- باقي تغييرات الأدوار: owner أو admin
    IF NOT public.auth_can_manage_org() THEN
      RAISE EXCEPTION 'غير مصرح: لا يمكنك تغيير أدوار المستخدمين.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.role IS DISTINCT FROM 'viewer' THEN
      NEW.role := 'viewer';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (ط) بوابة المستأجر: رمز عبر RPC فقط (لا يظهر في SELECT العام)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_tenant_portal_token(p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_kind text;
BEGIN
  IF NOT (
    public.auth_can_manage_org()
    OR public.get_my_role() = 'accountant'
  ) THEN
    RAISE EXCEPTION 'غير مصرح: إدارة رابط بوابة المستأجر تتطلب مدير أو محاسب.'
      USING ERRCODE = '42501';
  END IF;

  SELECT kind, portal_token INTO v_kind, v_token
  FROM public.contacts
  WHERE id = p_contact_id
  FOR UPDATE;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'جهة الاتصال غير موجودة';
  END IF;

  IF v_kind IS DISTINCT FROM 'TENANT' THEN
    RAISE EXCEPTION 'رابط البوابة متاح للمستأجرين فقط';
  END IF;

  IF v_token IS NOT NULL AND length(v_token) >= 32 THEN
    RETURN v_token;
  END IF;

  -- بدون اعتماد على pgcrypto: UUID مزدوج → 64 حرف hex
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  UPDATE public.contacts
  SET portal_token = v_token, updated_at = now()
  WHERE id = p_contact_id;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_portal_token(uuid) TO authenticated;

-- إخفاء portal_token من SELECT المباشر عبر عمود محمي بـ view اختياري غير ضروري —
-- التطبيق لن يطلب العمود؛ الـ RPC أعلاه للوصول الآمن.

-- ملاحظة: app_notifications بثّ مشترك بلا user_id — تحديث is_read يبقى مفتوحاً
-- للمصادقين (سلوك منتج). حماية المحتوى عبر عدم منح DELETE للعامة.

-- سحب backfill من authenticated إن وُجد
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'backfill_existing_transactions_to_ledger'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.backfill_existing_transactions_to_ledger FROM authenticated;
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.create_journal_entry(text, date, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_journal_entry(uuid, text, date, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_to_ledger(text, uuid, date, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
