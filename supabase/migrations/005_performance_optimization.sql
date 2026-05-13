-- ============================================================
-- Fluxen — Performance Optimization & Advanced Features
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ──────────────────────────────────────────────────────────────

-- For transaction filtering by date + kind (dashboard stats)
CREATE INDEX IF NOT EXISTS idx_transactions_date_kind 
  ON public.transactions (tx_date DESC, kind) 
  WHERE status = 'POSTED';

-- For contact-based transaction lookups
CREATE INDEX IF NOT EXISTS idx_transactions_contact_date 
  ON public.transactions (contact_id, tx_date DESC) 
  WHERE contact_id IS NOT NULL;

-- For category analysis (monthly reports)
CREATE INDEX IF NOT EXISTS idx_transactions_category_date 
  ON public.transactions (category_id, tx_date DESC);

-- For cashbox transaction history
CREATE INDEX IF NOT EXISTS idx_transactions_cashbox_date 
  ON public.transactions (cashbox_id, tx_date DESC);

-- For contact search (name, phone, shop_number)
CREATE INDEX IF NOT EXISTS idx_contacts_search 
  ON public.contacts USING gin(
    to_tsvector('arabic', coalesce(name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(shop_number, ''))
  );

-- Partial indexes for active records
CREATE INDEX IF NOT EXISTS idx_contacts_active_kind 
  ON public.contacts (kind, name) 
  WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────
-- 2. VIEWS FOR COMMON REPORTS
-- ──────────────────────────────────────────────────────────────

-- Monthly summary for dashboard
CREATE OR REPLACE VIEW public.monthly_summary AS
SELECT 
  DATE_TRUNC('month', tx_date) as month,
  TO_CHAR(DATE_TRUNC('month', tx_date), 'YYYY-MM') as month_label,
  COUNT(*) FILTER (WHERE kind = 'REVENUE') as revenue_count,
  COUNT(*) FILTER (WHERE kind = 'EXPENSE') as expense_count,
  COALESCE(SUM(amount) FILTER (WHERE kind = 'REVENUE'), 0) as revenue_total,
  COALESCE(SUM(amount) FILTER (WHERE kind = 'EXPENSE'), 0) as expense_total,
  COALESCE(SUM(amount) FILTER (WHERE kind = 'REVENUE'), 0) - 
  COALESCE(SUM(amount) FILTER (WHERE kind = 'EXPENSE'), 0) as net_profit
FROM public.transactions
WHERE status = 'POSTED'
  AND tx_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', tx_date)
ORDER BY month DESC;

-- Tenant rent status with balance
CREATE OR REPLACE VIEW public.tenant_rent_summary AS
SELECT 
  c.id,
  c.name,
  c.shop_number,
  c.floor,
  c.monthly_rent,
  c.phone,
  -- Current month payments
  COALESCE(
    (SELECT SUM(t.amount) 
     FROM public.transactions t 
     WHERE t.contact_id = c.id 
       AND t.kind = 'REVENUE'
       AND t.tx_date >= DATE_TRUNC('month', CURRENT_DATE)
       AND t.tx_date < DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')
    ), 0
  ) as current_month_paid,
  -- Current month status
  CASE 
    WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
    WHEN COALESCE(
      (SELECT SUM(t.amount) 
       FROM public.transactions t 
       WHERE t.contact_id = c.id 
         AND t.kind = 'REVENUE'
         AND t.tx_date >= DATE_TRUNC('month', CURRENT_DATE)
         AND t.tx_date < DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')
      ), 0
    ) >= c.monthly_rent THEN 'paid_full'
    WHEN COALESCE(
      (SELECT SUM(t.amount) 
       FROM public.transactions t 
       WHERE t.contact_id = c.id 
         AND t.kind = 'REVENUE'
         AND t.tx_date >= DATE_TRUNC('month', CURRENT_DATE)
         AND t.tx_date < DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')
      ), 0
    ) > 0 THEN 'paid_partial'
    ELSE 'unpaid'
  END as current_month_status,
  -- Last 12 months total
  COALESCE(
    (SELECT SUM(t.amount) 
     FROM public.transactions t 
     WHERE t.contact_id = c.id 
       AND t.kind = 'REVENUE'
       AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
    ), 0
  ) as last_12_months_revenue,
  -- Total balance (all time revenue - expected rent)
  COALESCE(
    (SELECT SUM(t.amount) 
     FROM public.transactions t 
     WHERE t.contact_id = c.id 
       AND t.kind = 'REVENUE'
    ), 0
  ) - (
    CASE 
      WHEN c.monthly_rent IS NOT NULL 
      THEN c.monthly_rent * GREATEST(
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, COALESCE(c.contract_start, CURRENT_DATE - INTERVAL '1 year'))) + 
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, COALESCE(c.contract_start, CURRENT_DATE - INTERVAL '1 year'))) * 12,
        0
      )
      ELSE 0 
    END
  ) as total_balance
FROM public.contacts c
WHERE c.kind = 'TENANT' AND c.is_active = true;

-- Employee salary summary
CREATE OR REPLACE VIEW public.employee_summary AS
SELECT 
  c.id,
  c.name,
  c.job_title,
  c.department,
  c.salary,
  c.hire_date,
  c.phone,
  -- Calculate total salary paid
  COALESCE(
    (SELECT SUM(t.amount) 
     FROM public.transactions t 
     WHERE t.contact_id = c.id 
       AND t.kind = 'EXPENSE'
       AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
    ), 0
  ) as last_12_months_salary_paid,
  -- Months with salary payments
  (SELECT COUNT(DISTINCT DATE_TRUNC('month', t.tx_date))
   FROM public.transactions t 
   WHERE t.contact_id = c.id 
     AND t.kind = 'EXPENSE'
     AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
  ) as months_with_payment
FROM public.contacts c
WHERE c.kind = 'EMPLOYEE' AND c.is_active = true;

-- Top expense categories this year
CREATE OR REPLACE VIEW public.top_expense_categories AS
SELECT 
  cat.id,
  cat.name_ar,
  cat.color,
  COUNT(t.id) as transaction_count,
  COALESCE(SUM(t.amount), 0) as total_amount,
  ROUND(
    (SUM(t.amount) * 100.0 / NULLIF((SELECT SUM(amount) FROM public.transactions WHERE kind = 'EXPENSE' AND status = 'POSTED' AND tx_date >= DATE_TRUNC('year', CURRENT_DATE)), 0)),
    2
  ) as percentage
FROM public.categories cat
LEFT JOIN public.transactions t ON t.category_id = cat.id 
  AND t.kind = 'EXPENSE' 
  AND t.status = 'POSTED'
  AND t.tx_date >= DATE_TRUNC('year', CURRENT_DATE)
WHERE cat.kind = 'EXPENSE' AND cat.active = true
GROUP BY cat.id, cat.name_ar, cat.color
ORDER BY total_amount DESC;

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCTIONS FOR COMMON OPERATIONS
-- ──────────────────────────────────────────────────────────────

-- Function to get tenant rent status for a specific month
CREATE OR REPLACE FUNCTION public.get_tenant_rent_status(
  tenant_id uuid,
  target_month date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  monthly_rent numeric,
  amount_paid numeric,
  status text,
  payment_date date
) AS $$
DECLARE
  rent_amount numeric;
  paid_amount numeric;
  payment_status text;
  last_payment date;
BEGIN
  -- Get tenant's monthly rent
  SELECT c.monthly_rent INTO rent_amount
  FROM public.contacts c
  WHERE c.id = tenant_id AND c.kind = 'TENANT';

  -- Get amount paid for target month
  SELECT 
    COALESCE(SUM(t.amount), 0),
    MAX(t.tx_date)
  INTO paid_amount, last_payment
  FROM public.transactions t
  WHERE t.contact_id = tenant_id
    AND t.kind = 'REVENUE'
    AND t.tx_date >= DATE_TRUNC('month', target_month)
    AND t.tx_date < DATE_TRUNC('month', target_month + INTERVAL '1 month');

  -- Determine status
  IF rent_amount IS NULL OR rent_amount = 0 THEN
    payment_status := 'no_rent_set';
  ELSIF paid_amount >= rent_amount THEN
    payment_status := 'paid_full';
  ELSIF paid_amount > 0 THEN
    payment_status := 'paid_partial';
  ELSE
    payment_status := 'unpaid';
  END IF;

  RETURN QUERY SELECT rent_amount, paid_amount, payment_status, last_payment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record bulk rent payments
CREATE OR REPLACE FUNCTION public.record_rent_payment(
  tenant_id uuid,
  amount numeric,
  payment_date date DEFAULT CURRENT_DATE,
  cashbox_id uuid DEFAULT NULL,
  description text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  new_tx_id uuid;
  effective_cashbox_id uuid;
  rent_category_id uuid;
BEGIN
  -- Get default cashbox if not provided
  IF cashbox_id IS NULL THEN
    SELECT c.id INTO effective_cashbox_id
    FROM public.cashboxes c
    WHERE c.active = true
    ORDER BY c.created_at
    LIMIT 1;
  ELSE
    effective_cashbox_id := cashbox_id;
  END IF;

  -- Get rent category
  SELECT cat.id INTO rent_category_id
  FROM public.categories cat
  WHERE cat.code = 'REV-RNT'
  LIMIT 1;

  -- Insert transaction
  INSERT INTO public.transactions (
    kind,
    status,
    method,
    amount,
    currency,
    tx_date,
    description,
    category_id,
    cashbox_id,
    contact_id,
    contact_type,
    posted_at
  ) VALUES (
    'REVENUE',
    'POSTED',
    'CASH',
    amount,
    'LYD',
    payment_date,
    COALESCE(description, 'إيجار'),
    rent_category_id,
    effective_cashbox_id,
    tenant_id,
    'PAYER',
    now()
  )
  RETURNING id INTO new_tx_id;

  RETURN new_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- 4. REALTIME ENABLEMENT
-- ──────────────────────────────────────────────────────────────

-- Enable realtime for contacts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;

-- Enable realtime for transactions (filtered)
-- Note: We add the table but applications should filter by user/branch
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ──────────────────────────────────────────────────────────────
-- 5. DATA INTEGRITY TRIGGERS
-- ──────────────────────────────────────────────────────────────

-- Auto-generate contact code
CREATE OR REPLACE FUNCTION public.generate_contact_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := UPPER(LEFT(NEW.kind, 3)) || '-' || EXTRACT(EPOCH FROM now())::bigint % 1000000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_code ON public.contacts;
CREATE TRIGGER trg_contacts_code
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_contact_code();

-- Auto-update transaction posted_at when status changes to POSTED
CREATE OR REPLACE FUNCTION public.set_transaction_posted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'POSTED' AND OLD.status != 'POSTED' THEN
    NEW.posted_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_posted ON public.transactions;
CREATE TRIGGER trg_transaction_posted
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.set_transaction_posted();

-- ──────────────────────────────────────────────────────────────
-- 6. ADD SALARY EXPENSE CATEGORY
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  ('EXP-SLR', 'Salaries & Wages', 'المرتبات والأجور', 'EXPENSE', 'EXPENSE', '#6B4C7A', 27)
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 7. GRANT PERMISSIONS FOR DATA API
-- ──────────────────────────────────────────────────────────────

GRANT SELECT ON public.monthly_summary TO authenticated;
GRANT SELECT ON public.tenant_rent_summary TO authenticated;
GRANT SELECT ON public.employee_summary TO authenticated;
GRANT SELECT ON public.top_expense_categories TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_rent_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rent_payment TO authenticated;
