-- ============================================================
-- Migration 054:
--  1) توحيد رصيد/سجل الخزينة مع دفتر الأستاذ (journal_lines.cashbox_id)
--  2) ترحيل التحويلات النقدية إلى القيود
--  3) إقفال سنوي: قيود إقفال الإيراد/المصروف → أرباح محتجزة (EQ-RE)
-- ============================================================

-- حساب أرباح محتجزة
INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order, active)
SELECT
  'EQ-RE',
  'Retained Earnings',
  'أرباح محتجزة / نتائج مدوّرة',
  'OPENING'::tx_kind,
  'EQUITY'::account_type,
  '#4A5D4E',
  84,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE code = 'EQ-RE');

UPDATE public.categories
SET
  name_ar = 'أرباح محتجزة / نتائج مدوّرة',
  type = 'EQUITY',
  kind = 'OPENING',
  active = true
WHERE code = 'EQ-RE';

-- ────────────────────────────────────────────────────────────
-- رصيد الخزينة من الدفتر + الافتتاحي
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cashbox_balance(p_cashbox_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(c.opening_balance, 0)
    + COALESCE((
        SELECT SUM(jl.debit - jl.credit)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.cashbox_id = c.id
          AND je.status = 'POSTED'
      ), 0)
  FROM public.cashboxes c
  WHERE c.id = p_cashbox_id;
$$;

DROP VIEW IF EXISTS public.cashbox_balances;

CREATE VIEW public.cashbox_balances AS
SELECT
  c.id,
  c.code,
  c.name_ar,
  c.kind,
  c.bank_name,
  c.color,
  c.currency,
  c.opening_balance,
  c.opening_balance
    + COALESCE(gl.gl_net, 0) AS balance,
  COALESCE(gl.tx_count_month, 0) AS tx_count_month,
  COALESCE(gl.month_inflow, 0) AS month_inflow,
  COALESCE(gl.month_outflow, 0) AS month_outflow
FROM public.cashboxes c
LEFT JOIN LATERAL (
  SELECT
    SUM(jl.debit - jl.credit) AS gl_net,
    COUNT(*) FILTER (
      WHERE je.entry_date >= date_trunc('month', CURRENT_DATE)::date
    ) AS tx_count_month,
    COALESCE(SUM(jl.debit) FILTER (
      WHERE je.entry_date >= date_trunc('month', CURRENT_DATE)::date
    ), 0) AS month_inflow,
    COALESCE(SUM(jl.credit) FILTER (
      WHERE je.entry_date >= date_trunc('month', CURRENT_DATE)::date
    ), 0) AS month_outflow
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE jl.cashbox_id = c.id
    AND je.status = 'POSTED'
) gl ON true;

GRANT SELECT ON public.cashbox_balances TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- تحويل نقدي → قيد في الدفتر
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_cashbox_transfer(
  p_from_cashbox_id uuid,
  p_to_cashbox_id uuid,
  p_amount numeric,
  p_transfer_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_name text;
  v_to_name text;
  v_balance numeric;
  v_ref text;
  v_id uuid;
  v_currency text := 'LYD';
  v_cash_cat_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_desc text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تنفيذ التحويل';
  END IF;

  IF p_from_cashbox_id IS NULL OR p_to_cashbox_id IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد الخزينة المصدر والوجهة';
  END IF;

  IF p_from_cashbox_id = p_to_cashbox_id THEN
    RAISE EXCEPTION 'لا يمكن التحويل لنفس الخزينة';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
  END IF;

  SELECT c.name_ar, c.currency INTO v_from_name, v_currency
  FROM public.cashboxes c
  WHERE c.id = p_from_cashbox_id AND c.active = true;

  IF v_from_name IS NULL THEN
    RAISE EXCEPTION 'الخزينة المصدر غير موجودة أو غير نشطة';
  END IF;

  SELECT c.name_ar INTO v_to_name
  FROM public.cashboxes c
  WHERE c.id = p_to_cashbox_id AND c.active = true;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'الخزينة الوجهة غير موجودة أو غير نشطة';
  END IF;

  v_balance := public.get_cashbox_balance(p_from_cashbox_id);
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'رصيد الخزينة المصدر (%) غير كافٍ — الرصيد الحالي: %', v_from_name, v_balance;
  END IF;

  SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  IF v_cash_cat_id IS NULL THEN
    RAISE EXCEPTION 'حساب النقد AST-CSH غير معرّف';
  END IF;

  v_ref := public.generate_cash_transfer_reference(p_transfer_date);
  v_desc := COALESCE(
    NULLIF(trim(p_description), ''),
    'تحويل من ' || v_from_name || ' إلى ' || v_to_name
  );

  INSERT INTO public.cash_transfers (
    reference,
    from_cashbox_id,
    to_cashbox_id,
    amount,
    currency,
    transfer_date,
    description,
    notes,
    created_by
  ) VALUES (
    v_ref,
    p_from_cashbox_id,
    p_to_cashbox_id,
    p_amount,
    v_currency,
    p_transfer_date,
    v_desc,
    NULLIF(trim(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  -- مدين الوجهة / دائن المصدر (نفس حساب النقد، خزينتان مختلفتان)
  v_lines := v_lines || jsonb_build_object(
    'category_id', v_cash_cat_id,
    'debit', p_amount,
    'credit', 0,
    'description', v_desc,
    'cashbox_id', p_to_cashbox_id
  );
  v_lines := v_lines || jsonb_build_object(
    'category_id', v_cash_cat_id,
    'debit', 0,
    'credit', p_amount,
    'description', v_desc,
    'cashbox_id', p_from_cashbox_id
  );

  PERFORM public.post_to_ledger(
    'CASH_TRANSFER',
    v_id,
    p_transfer_date,
    v_desc,
    NULLIF(trim(p_notes), ''),
    auth.uid(),
    v_lines
  );

  PERFORM public.write_audit_log(
    'INSERT', 'cash_transfer', v_id, v_ref,
    'تحويل: ' || v_from_name || ' → ' || v_to_name || ' — ' || p_amount::text || ' ' || v_currency,
    p_transfer_date, -p_amount, p_from_cashbox_id, 'info',
    jsonb_build_object(
      'from_cashbox_id', p_from_cashbox_id,
      'to_cashbox_id', p_to_cashbox_id,
      'amount', p_amount
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'reference', v_ref,
    'from_cashbox_id', p_from_cashbox_id,
    'to_cashbox_id', p_to_cashbox_id,
    'amount', p_amount,
    'transfer_date', p_transfer_date
  );
END;
$$;

-- Backfill: تحويلات قديمة بلا قيد
DO $$
DECLARE
  r record;
  v_cash_cat_id uuid;
  v_lines jsonb;
  v_desc text;
BEGIN
  SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  IF v_cash_cat_id IS NULL THEN
    RAISE NOTICE '054: تخطي backfill التحويلات — AST-CSH غير موجود';
    RETURN;
  END IF;

  FOR r IN
    SELECT ct.*
    FROM public.cash_transfers ct
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.source_type = 'CASH_TRANSFER'
        AND je.source_id = ct.id
        AND je.status = 'POSTED'
    )
  LOOP
    v_desc := COALESCE(r.description, 'تحويل نقدي ' || COALESCE(r.reference, ''));
    v_lines := '[]'::jsonb
      || jsonb_build_object(
        'category_id', v_cash_cat_id,
        'debit', r.amount,
        'credit', 0,
        'description', v_desc,
        'cashbox_id', r.to_cashbox_id
      )
      || jsonb_build_object(
        'category_id', v_cash_cat_id,
        'debit', 0,
        'credit', r.amount,
        'description', v_desc,
        'cashbox_id', r.from_cashbox_id
      );

    PERFORM public.post_to_ledger(
      'CASH_TRANSFER',
      r.id,
      r.transfer_date,
      v_desc,
      r.notes,
      r.created_by,
      v_lines
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- سجل الخزينة من أسطر الدفتر (الأحدث أولاً مثل المصروفات)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cashbox_ledger(
  p_cashbox_id uuid,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric;
  v_currency text;
  v_name_ar text;
  v_code text;
  v_kind text;
  v_balance numeric;
  v_rows jsonb;
BEGIN
  SELECT c.opening_balance, c.currency, c.name_ar, c.code, c.kind::text
  INTO v_opening, v_currency, v_name_ar, v_code, v_kind
  FROM public.cashboxes c
  WHERE c.id = p_cashbox_id;

  IF v_name_ar IS NULL THEN
    RAISE EXCEPTION 'الخزينة غير موجودة';
  END IF;

  v_balance := public.get_cashbox_balance(p_cashbox_id);

  WITH events AS (
    SELECT
      je.id::text AS event_id,
      COALESCE(je.source_type, 'JOURNAL') AS source_type,
      CASE
        WHEN je.source_type = 'TRANSACTION' THEN COALESCE(t.kind::text, 'TRANSACTION')
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.debit > 0 THEN 'TRANSFER_IN'
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.credit > 0 THEN 'TRANSFER_OUT'
        WHEN je.source_type = 'VOUCHER' THEN 'VOUCHER'
        WHEN jl.debit > 0 THEN 'IN'
        ELSE 'OUT'
      END AS event_kind,
      je.entry_date AS event_date,
      je.created_at,
      je.reference,
      je.number::text AS seq_label,
      COALESCE(jl.description, je.description) AS description,
      (jl.debit - jl.credit) AS signed_amount,
      CASE WHEN jl.debit > 0 THEN 'in' ELSE 'out' END AS direction,
      CASE
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.debit > 0 THEN ct.from_cashbox_id
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.credit > 0 THEN ct.to_cashbox_id
        ELSE NULL
      END AS counter_cashbox_id,
      CASE
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.debit > 0 THEN fc.name_ar
        WHEN je.source_type = 'CASH_TRANSFER' AND jl.credit > 0 THEN tc.name_ar
        ELSE NULL
      END AS counter_name_ar,
      COALESCE(t.reconciled_at, ct.reconciled_at) AS reconciled_at,
      je.source_id
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_id
    LEFT JOIN public.transactions t
      ON t.id = je.source_id AND je.source_type = 'TRANSACTION'
    LEFT JOIN public.cash_transfers ct
      ON ct.id = je.source_id AND je.source_type = 'CASH_TRANSFER'
    LEFT JOIN public.cashboxes fc ON fc.id = ct.from_cashbox_id
    LEFT JOIN public.cashboxes tc ON tc.id = ct.to_cashbox_id
    WHERE jl.cashbox_id = p_cashbox_id
      AND je.status = 'POSTED'
      AND (jl.debit > 0 OR jl.credit > 0)
  ),
  chron AS (
    SELECT
      e.*,
      SUM(e.signed_amount) OVER (
        ORDER BY e.event_date ASC, e.created_at ASC, e.event_id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) + v_opening AS balance_after
    FROM events e
  ),
  paged AS (
    SELECT *
    FROM chron
    ORDER BY event_date DESC, created_at DESC, event_id DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'event_id', COALESCE(source_id::text, event_id),
      'journal_id', event_id,
      'source_type', CASE
        WHEN source_type = 'TRANSACTION' THEN 'transaction'
        WHEN source_type = 'CASH_TRANSFER' THEN 'cash_transfer'
        ELSE 'journal'
      END,
      'event_kind', event_kind,
      'event_date', event_date,
      'reference', reference,
      'seq_label', seq_label,
      'description', description,
      'signed_amount', signed_amount,
      'direction', direction,
      'balance_after', balance_after,
      'counter_cashbox_id', counter_cashbox_id,
      'counter_name_ar', counter_name_ar,
      'reconciled_at', reconciled_at
    )
    ORDER BY event_date DESC, created_at DESC, event_id DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM paged;

  RETURN jsonb_build_object(
    'cashbox_id', p_cashbox_id,
    'code', v_code,
    'name_ar', v_name_ar,
    'kind', v_kind,
    'currency', v_currency,
    'opening_balance', v_opening,
    'current_balance', v_balance,
    'rows', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cashbox_ledger(uuid, int, int) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- إقفال السنة المالية → أرباح محتجزة
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.year_close_source_id(p_year int)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5('fluxen:YEAR_CLOSE:' || p_year::text), 1, 8) || '-' ||
    substr(md5('fluxen:YEAR_CLOSE:' || p_year::text), 9, 4) || '-' ||
    '4' || substr(md5('fluxen:YEAR_CLOSE:' || p_year::text), 13, 3) || '-' ||
    'a' || substr(md5('fluxen:YEAR_CLOSE:' || p_year::text), 17, 3) || '-' ||
    substr(md5('fluxen:YEAR_CLOSE:' || p_year::text), 21, 12)
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION public.close_fiscal_year(p_year int)
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

  -- اسمح بالترحيل حتى لو كانت فترة ديسمبر مغلقة
  UPDATE public.fiscal_periods
  SET is_closed = false
  WHERE end_date >= v_start
    AND start_date <= v_end
    AND is_closed = true;

  v_journal_id := public.post_to_ledger(
    'YEAR_CLOSE',
    v_source_id,
    v_end,
    'إقفال السنة المالية ' || p_year,
    'قيد إقفال تلقائي للإيرادات والمصروفات',
    auth.uid(),
    v_lines
  );

  UPDATE public.fiscal_periods
  SET
    is_closed = true,
    closed_at = now(),
    closed_by = auth.uid()
  WHERE end_date >= v_start
    AND start_date <= v_end;

  GET DIAGNOSTICS v_closed_periods = ROW_COUNT;

  RETURN jsonb_build_object(
    'year', p_year,
    'journal_id', v_journal_id,
    'total_revenue', v_rev,
    'total_expense', v_exp,
    'net_income', v_net,
    'periods_closed', v_closed_periods
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.year_close_source_id(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashbox_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cashbox_transfer(uuid, uuid, numeric, date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
