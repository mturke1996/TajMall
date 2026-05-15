-- ============================================================
-- Fluxen — Financial Reports & Journal Entry System
-- Complete double-entry accounting with automated reports
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. JOURNAL ENTRY VIEWS
-- ──────────────────────────────────────────────────────────────

-- View: Journal entries with totals
CREATE OR REPLACE VIEW public.journal_entries_with_totals AS
SELECT 
  je.id,
  je.number,
  je.reference,
  je.status,
  je.entry_date,
  je.description,
  je.notes,
  je.posted_at,
  je.reversed_at,
  je.created_at,
  je.updated_at,
  COALESCE(SUM(jl.debit), 0) as total_debit,
  COALESCE(SUM(jl.credit), 0) as total_credit,
  COUNT(jl.id) as line_count
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.journal_id = je.id
GROUP BY je.id, je.number, je.reference, je.status, je.entry_date, 
         je.description, je.notes, je.posted_at, je.reversed_at, je.created_at, je.updated_at;

-- View: Journal lines with category details
CREATE OR REPLACE VIEW public.journal_lines_with_categories AS
SELECT 
  jl.id,
  jl.journal_id,
  jl.category_id,
  jl.debit,
  jl.credit,
  jl.description,
  jl.sort_order,
  ac.code as category_code,
  ac.name_ar as category_name,
  ac.type as category_type,
  ac.kind as category_kind,
  ac.color as category_color
FROM public.journal_lines jl
JOIN public.categories ac ON ac.id = jl.category_id;

-- View: Journal summary statistics
CREATE OR REPLACE VIEW public.journal_summary AS
SELECT 
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE status = 'POSTED') as posted_entries,
  COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_entries,
  COUNT(*) FILTER (WHERE status = 'REVERSED') as reversed_entries,
  COALESCE(SUM(total_debit) FILTER (WHERE status = 'POSTED'), 0) as total_debit,
  COALESCE(SUM(total_credit) FILTER (WHERE status = 'POSTED'), 0) as total_credit,
  COUNT(*) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)) as current_month_entries
FROM public.journal_entries_with_totals;

-- ──────────────────────────────────────────────────────────────
-- 2. JOURNAL ENTRY RPC FUNCTIONS
-- ──────────────────────────────────────────────────────────────

-- Function: Create journal entry with lines
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
AS $$
DECLARE
  new_journal_id text;
  line jsonb;
  total_debit numeric := 0;
  total_credit numeric := 0;
BEGIN
  -- Validate lines array
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal entry requires at least 2 lines';
  END IF;

  -- Calculate totals
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    total_debit := total_debit + COALESCE((line->>'debit')::numeric, 0);
    total_credit := total_credit + COALESCE((line->>'credit')::numeric, 0);
  END LOOP;

  -- Check balance
  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
  END IF;

  IF total_debit = 0 THEN
    RAISE EXCEPTION 'Journal entry must have non-zero amounts';
  END IF;

  -- Insert journal entry
  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    p_reference,
    p_entry_date,
    p_description,
    p_notes,
    'DRAFT'
  )
  RETURNING id INTO new_journal_id;

  -- Insert journal lines
  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF COALESCE((line->>'debit')::numeric, 0) = 0 AND COALESCE((line->>'credit')::numeric, 0) = 0 THEN
      CONTINUE; -- Skip zero lines
    END IF;

    INSERT INTO public.journal_lines (
      journal_id,
      category_id,
      debit,
      credit,
      description,
      sort_order
    ) VALUES (
      new_journal_id,
      line->>'category_id',
      COALESCE((line->>'debit')::numeric, 0),
      COALESCE((line->>'credit')::numeric, 0),
      line->>'description',
      COALESCE((line->>'sort_order')::int, 0)
    );
  END LOOP;

  RETURN new_journal_id;
END;
$$;

-- Function: Post journal entry (change status to POSTED)
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_journal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  -- Check current status
  SELECT status, total_debit, total_credit 
  INTO v_status, v_total_debit, v_total_credit
  FROM public.journal_entries_with_totals 
  WHERE id = p_journal_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft entries can be posted';
  END IF;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'Cannot post unbalanced entry';
  END IF;

  -- Update status
  UPDATE public.journal_entries
  SET status = 'POSTED', posted_at = now()
  WHERE id = p_journal_id;

  -- Create corresponding transactions for each line (simplified)
  -- In a full double-entry system, this would create more complex entries
END;
$$;

-- Function: Reverse journal entry
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  original record;
  new_journal_id text;
BEGIN
  -- Get original entry
  SELECT * INTO original
  FROM public.journal_entries
  WHERE id = p_journal_id AND status = 'POSTED';

  IF original IS NULL THEN
    RAISE EXCEPTION 'Posted journal entry not found';
  END IF;

  -- Mark original as reversed
  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = p_journal_id;

  -- Create reversed entry (swap debits and credits)
  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    COALESCE(original.reference, '') || ' (Reversal)',
    CURRENT_DATE,
    'Reversal of entry #' || original.number || ': ' || COALESCE(original.description, ''),
    'Auto-generated reversal',
    'POSTED'
  )
  RETURNING id INTO new_journal_id;

  -- Create reversed lines
  INSERT INTO public.journal_lines (journal_id, category_id, debit, credit, description, sort_order)
  SELECT 
    new_journal_id,
    category_id,
    credit as debit,  -- Swap
    debit as credit,  -- Swap
    'Reversal: ' || COALESCE(description, ''),
    sort_order
  FROM public.journal_lines
  WHERE journal_id = p_journal_id;

  -- Mark new entry as posted
  UPDATE public.journal_entries
  SET posted_at = now()
  WHERE id = new_journal_id;

  RETURN new_journal_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. FINANCIAL REPORT RPC FUNCTIONS
-- ──────────────────────────────────────────────────────────────

-- Function: Get Trial Balance for a specific year
CREATE OR REPLACE FUNCTION public.get_trial_balance(p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH category_balances AS (
    SELECT 
      c.id as category_id,
      c.code as category_code,
      c.name_ar as category_name,
      c.type as category_type,
      c.color,
      -- Opening balances (from before the year)
      COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM public.journal_lines jl
         JOIN public.journal_entries je ON je.id = jl.journal_id
         WHERE jl.category_id = c.id
           AND je.status = 'POSTED'
           AND je.entry_date < make_date(p_year, 1, 1)
        ), 0
      ) as opening_balance,
      -- Period movements
      COALESCE(
        (SELECT SUM(jl.debit)
         FROM public.journal_lines jl
         JOIN public.journal_entries je ON je.id = jl.journal_id
         WHERE jl.category_id = c.id
           AND je.status = 'POSTED'
           AND je.entry_date >= make_date(p_year, 1, 1)
           AND je.entry_date < make_date(p_year + 1, 1, 1)
        ), 0
      ) as period_debit,
      COALESCE(
        (SELECT SUM(jl.credit)
         FROM public.journal_lines jl
         JOIN public.journal_entries je ON je.id = jl.journal_id
         WHERE jl.category_id = c.id
           AND je.status = 'POSTED'
           AND je.entry_date >= make_date(p_year, 1, 1)
           AND je.entry_date < make_date(p_year + 1, 1, 1)
        ), 0
      ) as period_credit
    FROM public.categories c
    WHERE c.active = true
  ),
  calculated AS (
    SELECT 
      category_id,
      category_code,
      category_name,
      category_type,
      color,
      GREATEST(opening_balance, 0) as opening_debit,
      GREATEST(-opening_balance, 0) as opening_credit,
      period_debit,
      period_credit,
      opening_balance + period_debit - period_credit as closing_balance,
      GREATEST(opening_balance + period_debit - period_credit, 0) as closing_debit,
      GREATEST(-(opening_balance + period_debit - period_credit), 0) as closing_credit
    FROM category_balances
  )
  SELECT jsonb_build_object(
    'rows', (
      SELECT jsonb_agg(row_to_json(calculated.*))
      FROM calculated
      WHERE period_debit > 0 OR period_credit > 0 OR opening_debit > 0 OR opening_credit > 0
    ),
    'summary', jsonb_build_object(
      'total_opening_debit', (SELECT SUM(opening_debit) FROM calculated),
      'total_opening_credit', (SELECT SUM(opening_credit) FROM calculated),
      'total_period_debit', (SELECT SUM(period_debit) FROM calculated),
      'total_period_credit', (SELECT SUM(period_credit) FROM calculated),
      'total_closing_debit', (SELECT SUM(closing_debit) FROM calculated),
      'total_closing_credit', (SELECT SUM(closing_credit) FROM calculated)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Function: Get Profit & Loss for a period
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  p_period text DEFAULT 'year', -- 'year', 'quarter', 'month'
  p_quarter int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_date date;
  end_date date;
  result jsonb;
BEGIN
  -- Calculate date range
  IF p_period = 'year' THEN
    start_date := make_date(p_year, 1, 1);
    end_date := make_date(p_year + 1, 1, 1);
  ELSIF p_period = 'quarter' AND p_quarter IS NOT NULL THEN
    start_date := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
    end_date := start_date + INTERVAL '3 months';
  ELSIF p_period = 'month' AND p_month IS NOT NULL THEN
    start_date := make_date(p_year, p_month + 1, 1);
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
      COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) as amount  -- Revenue increases credit
    FROM public.categories c
    LEFT JOIN public.journal_lines jl ON jl.category_id = c.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date >= start_date
      AND je.entry_date < end_date
    WHERE c.type = 'REVENUE'
      AND c.active = true
    GROUP BY c.id, c.code, c.name_ar, c.color
    HAVING COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) != 0
  ),
  expense_data AS (
    SELECT 
      c.id as category_id,
      c.code as category_code,
      c.name_ar as category_name,
      c.color,
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) as amount  -- Expenses increase debit
    FROM public.categories c
    LEFT JOIN public.journal_lines jl ON jl.category_id = c.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
      AND je.status = 'POSTED'
      AND je.entry_date >= start_date
      AND je.entry_date < end_date
    WHERE c.type = 'EXPENSE'
      AND c.active = true
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
      ))
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
      ))
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

-- Function: Get Cash Flow Statement
CREATE OR REPLACE FUNCTION public.get_cash_flow(p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_date date := make_date(p_year, 1, 1);
  end_date date := make_date(p_year + 1, 1, 1);
  result jsonb;
  v_opening_balance numeric;
  v_closing_balance numeric;
  v_operating_in numeric;
  v_operating_out numeric;
  v_investing_in numeric;
  v_investing_out numeric;
  v_financing_in numeric;
  v_financing_out numeric;
BEGIN
  -- Calculate cashbox balances
  SELECT 
    COALESCE(SUM(opening_balance), 0),
    COALESCE(SUM(balance), 0)
  INTO v_opening_balance, v_closing_balance
  FROM public.cashbox_balances;

  -- For now, categorize based on transaction types and categories
  -- Operating: Regular revenue and expense transactions
  SELECT 
    COALESCE(SUM(CASE WHEN kind = 'REVENUE' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN kind = 'EXPENSE' THEN amount ELSE 0 END), 0)
  INTO v_operating_in, v_operating_out
  FROM public.transactions
  WHERE status = 'POSTED'
    AND tx_date >= start_date
    AND tx_date < end_date
    AND kind IN ('REVENUE', 'EXPENSE');

  -- Investing: Asset purchases (simplified - based on category type)
  SELECT 
    COALESCE(SUM(CASE WHEN jl.debit > jl.credit THEN jl.debit - jl.credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jl.credit > jl.debit THEN jl.credit - jl.debit ELSE 0 END), 0)
  INTO v_investing_out, v_investing_in
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= start_date
    AND je.entry_date < end_date
    AND c.type = 'ASSET';

  -- Financing: Equity changes (simplified)
  SELECT 
    COALESCE(SUM(CASE WHEN jl.credit > jl.debit THEN jl.credit - jl.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jl.debit > jl.credit THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_financing_in, v_financing_out
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.categories c ON c.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date >= start_date
    AND je.entry_date < end_date
    AND c.type IN ('EQUITY', 'LIABILITY');

  SELECT jsonb_build_object(
    'operating', jsonb_build_array(
      jsonb_build_object('category', 'الإيرادات', 'description', 'إيرادات النشاط التشغيلي', 'amount', v_operating_in::text, 'is_positive', true),
      jsonb_build_object('category', 'المصروفات', 'description', 'مصروفات النشاط التشغيلي', 'amount', v_operating_out::text, 'is_positive', false)
    ),
    'investing', jsonb_build_array(
      jsonb_build_object('category', 'تصريف أصول', 'description', 'شراء أو بيع أصول ثابتة', 'amount', v_investing_out::text, 'is_positive', false),
      jsonb_build_object('category', 'إيراد أصول', 'description', 'بيع أصول ثابتة', 'amount', v_investing_in::text, 'is_positive', true)
    ),
    'financing', jsonb_build_array(
      jsonb_build_object('category', 'تمويل داخل', 'description', 'قروض واستثمارات', 'amount', v_financing_in::text, 'is_positive', true),
      jsonb_build_object('category', 'تمويل خارج', 'description', 'سداد قروض', 'amount', v_financing_out::text, 'is_positive', false)
    ),
    'summary', jsonb_build_object(
      'opening_balance', v_opening_balance::text,
      'operating_inflow', v_operating_in::text,
      'operating_outflow', v_operating_out::text,
      'net_operating', (v_operating_in - v_operating_out)::text,
      'investing_inflow', v_investing_in::text,
      'investing_outflow', v_investing_out::text,
      'net_investing', (v_investing_in - v_investing_out)::text,
      'financing_inflow', v_financing_in::text,
      'financing_outflow', v_financing_out::text,
      'net_financing', (v_financing_in - v_financing_out)::text,
      'net_change', (v_closing_balance - v_opening_balance)::text,
      'closing_balance', v_closing_balance::text
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. GRANT PERMISSIONS
-- ──────────────────────────────────────────────────────────────

GRANT SELECT ON public.journal_entries_with_totals TO authenticated;
GRANT SELECT ON public.journal_lines_with_categories TO authenticated;
GRANT SELECT ON public.journal_summary TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_journal_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profit_loss TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_flow TO authenticated;
