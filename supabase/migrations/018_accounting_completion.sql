-- ============================================================
-- Migration 018: Accounting completion — reports, vouchers, allocations
-- ============================================================

-- 1. Fix profit & loss month filter (was p_month + 1, skipping January)
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  p_period text DEFAULT 'year',
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
      c.id AS category_id,
      c.code AS category_code,
      c.name_ar AS category_name,
      c.color,
      COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount
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
      c.id AS category_id,
      c.code AS category_code,
      c.name_ar AS category_name,
      c.color,
      COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount
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
      COALESCE((SELECT SUM(amount) FROM revenue_data), 0) AS total_revenue,
      COALESCE((SELECT SUM(amount) FROM expense_data), 0) AS total_expense
  )
  SELECT jsonb_build_object(
    'revenue', (
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'amount', amount,
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
        'color', color
      ) ORDER BY amount DESC)
      FROM expense_data
    ),
    'summary', jsonb_build_object(
      'total_revenue', (SELECT total_revenue FROM totals),
      'total_expense', (SELECT total_expense FROM totals),
      'net_profit', (SELECT total_revenue - total_expense FROM totals),
      'start_date', start_date,
      'end_date', end_date - 1
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Balance sheet as of a date
CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_code', category_code,
        'category_name', category_name,
        'balance', GREATEST(-balance, 0),
        'color', color
      ) ORDER BY category_code), '[]'::jsonb)
      FROM category_balances WHERE category_type = 'EQUITY' AND balance < -0.001
    ),
    'summary', jsonb_build_object(
      'total_assets', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'ASSET'), 0),
      'total_liabilities', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'LIABILITY'), 0),
      'total_equity', COALESCE((SELECT section_total FROM section_totals WHERE category_type = 'EQUITY'), 0)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. Tenant AR aging from unpaid charges
CREATE OR REPLACE FUNCTION public.get_tenant_ar_aging(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH unpaid AS (
    SELECT
      lc.tenant_id,
      tc.amount - tc.total_paid AS outstanding,
      tc.due_date
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid
  ),
  by_tenant AS (
    SELECT
      c.id AS tenant_id,
      c.name AS tenant_name,
      c.shop_number,
      c.phone,
      SUM(u.outstanding) AS total_outstanding,
      SUM(CASE WHEN u.due_date >= p_as_of THEN u.outstanding ELSE 0 END) AS bucket_current,
      SUM(CASE WHEN u.due_date < p_as_of AND u.due_date >= p_as_of - 30 THEN u.outstanding ELSE 0 END) AS bucket_30,
      SUM(CASE WHEN u.due_date < p_as_of - 30 AND u.due_date >= p_as_of - 60 THEN u.outstanding ELSE 0 END) AS bucket_60,
      SUM(CASE WHEN u.due_date < p_as_of - 60 THEN u.outstanding ELSE 0 END) AS bucket_90_plus
    FROM unpaid u
    JOIN public.contacts c ON c.id = u.tenant_id
    GROUP BY c.id, c.name, c.shop_number, c.phone
    HAVING SUM(u.outstanding) > 0
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'tenant_id', tenant_id,
        'tenant_name', tenant_name,
        'shop_number', shop_number,
        'phone', phone,
        'total_outstanding', total_outstanding,
        'bucket_current', bucket_current,
        'bucket_30', bucket_30,
        'bucket_60', bucket_60,
        'bucket_90_plus', bucket_90_plus
      ) ORDER BY total_outstanding DESC), '[]'::jsonb)
      FROM by_tenant
    ),
    'summary', jsonb_build_object(
      'total_outstanding', COALESCE((SELECT SUM(total_outstanding) FROM by_tenant), 0),
      'tenant_count', COALESCE((SELECT COUNT(*) FROM by_tenant), 0)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 4. Disbursement vouchers → journal (cashbox + expense category on header)
ALTER TABLE public.disbursement_vouchers
  ADD COLUMN IF NOT EXISTS cashbox_id uuid REFERENCES public.cashboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.process_disbursement_voucher_posting()
RETURNS TRIGGER AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_exp_cat_id uuid;
  v_desc text;
BEGIN
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_disbursement_voucher_posting ON public.disbursement_vouchers;
CREATE TRIGGER trg_process_disbursement_voucher_posting
  AFTER INSERT ON public.disbursement_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.process_disbursement_voucher_posting();

-- 5. Auto-allocate tenant rent payments to oldest unpaid charges (FIFO)
CREATE OR REPLACE FUNCTION public.auto_allocate_tenant_rent_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining numeric;
  v_charge record;
  v_alloc numeric;
BEGIN
  IF NEW.kind != 'REVENUE' OR NEW.status != 'POSTED' OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = NEW.category_id AND code IN ('REV-RNT', 'REV-SRV')
  ) THEN
    RETURN NEW;
  END IF;

  v_remaining := NEW.amount;

  FOR v_charge IN
    SELECT tc.*
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = NEW.contact_id
      AND tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid
    ORDER BY tc.due_date ASC, tc.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_alloc := LEAST(v_remaining, v_charge.amount - v_charge.total_paid);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.tenant_charge_allocations (charge_id, transaction_id, amount)
    VALUES (v_charge.id, NEW.id, v_alloc);

    UPDATE public.tenant_charges
    SET
      total_paid = total_paid + v_alloc,
      status = CASE
        WHEN total_paid + v_alloc >= amount THEN 'PAID'
        WHEN total_paid + v_alloc > 0 THEN 'PARTIAL'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_charge.id;

    v_remaining := v_remaining - v_alloc;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_allocate_tenant_payment ON public.transactions;
CREATE TRIGGER trg_auto_allocate_tenant_payment
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_allocate_tenant_rent_payment();

-- 6. Grants + schema reload
GRANT EXECUTE ON FUNCTION public.get_balance_sheet TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_ar_aging TO authenticated;

NOTIFY pgrst, 'reload schema';
