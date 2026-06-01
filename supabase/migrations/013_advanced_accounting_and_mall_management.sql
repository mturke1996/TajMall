-- ============================================================
-- Migration: Advanced Accounting & Mall Management System
-- ============================================================

-- 1. Create fiscal_periods table
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_closed   boolean NOT NULL DEFAULT false,
  closed_at   timestamptz,
  closed_by   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Create mall_units table
CREATE TABLE IF NOT EXISTS public.mall_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number text NOT NULL UNIQUE,
  floor       text NOT NULL,
  area_sqm    numeric(10,2) NOT NULL,
  status      text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Create lease_contracts table
CREATE TABLE IF NOT EXISTS public.lease_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  unit_id         uuid NOT NULL REFERENCES public.mall_units(id) ON DELETE RESTRICT,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  monthly_rent    numeric(18,3) NOT NULL CHECK (monthly_rent >= 0),
  services_amount numeric(18,3) NOT NULL DEFAULT 0 CHECK (services_amount >= 0),
  deposit_amount  numeric(18,3) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'TERMINATED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 4. Create tenant_charges table
CREATE TABLE IF NOT EXISTS public.tenant_charges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      uuid NOT NULL REFERENCES public.lease_contracts(id) ON DELETE CASCADE,
  amount           numeric(18,3) NOT NULL CHECK (amount > 0),
  due_date         date NOT NULL,
  type             text NOT NULL CHECK (type IN ('RENT', 'SERVICE', 'FINE', 'OTHER')),
  description      text NOT NULL,
  status           text NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID')),
  total_paid       numeric(18,3) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  journal_entry_id uuid, -- references journal_entries(id) added later to avoid circular references
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 5. Create tenant_charge_allocations table
CREATE TABLE IF NOT EXISTS public.tenant_charge_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id      uuid NOT NULL REFERENCES public.tenant_charges(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount         numeric(18,3) NOT NULL CHECK (amount > 0),
  allocated_at   timestamptz NOT NULL DEFAULT now()
);

-- 6. Create account_mappings table
CREATE TABLE IF NOT EXISTS public.account_mappings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  text NOT NULL UNIQUE CHECK (source_type IN ('RENT_REVENUE', 'SERVICE_REVENUE', 'DEPOSIT_LIABILITY', 'EXPENSE_CASH_ASSET', 'REVENUE_CASH_ASSET')),
  category_id  uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 7. Alter journal_entries to support automations
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.fiscal_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS posting_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reversal_of_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- Now add foreign key constraint to tenant_charges referencing journal_entries
ALTER TABLE public.tenant_charges
  DROP CONSTRAINT IF EXISTS fk_tenant_charges_journal_entry,
  ADD CONSTRAINT fk_tenant_charges_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 8. Add unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_version 
  ON public.journal_entries (source_type, source_id, posting_version) 
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- 9. Exclusion constraints via Triggers for overlapping periods & contracts
CREATE OR REPLACE FUNCTION public.check_fiscal_period_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE id != NEW.id
      AND (
        (NEW.start_date BETWEEN start_date AND end_date) OR
        (NEW.end_date BETWEEN start_date AND end_date) OR
        (start_date BETWEEN NEW.start_date AND NEW.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'فترة صلاحية التواريخ تتداخل مع فترة مالية موجودة بالفعل.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_period_overlap ON public.fiscal_periods;
CREATE TRIGGER trg_fiscal_period_overlap
  BEFORE INSERT OR UPDATE ON public.fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_period_overlap();

CREATE OR REPLACE FUNCTION public.check_lease_contract_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM public.lease_contracts
    WHERE id != NEW.id
      AND unit_id = NEW.unit_id
      AND status = 'ACTIVE'
      AND (
        (NEW.start_date BETWEEN start_date AND end_date) OR
        (NEW.end_date BETWEEN start_date AND end_date) OR
        (start_date BETWEEN NEW.start_date AND NEW.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'هذه الوحدة مؤجرة بعقد نشط آخر خلال نفس الفترة المحددة.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lease_contract_overlap ON public.lease_contracts;
CREATE TRIGGER trg_lease_contract_overlap
  BEFORE INSERT OR UPDATE ON public.lease_contracts
  FOR EACH ROW EXECUTE FUNCTION public.check_lease_contract_overlap();

-- 10. Seed standard asset/liability/revenue accounts
INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  ('AST-CSH', 'Assets - Cash & Banks', 'الأصول - الخزائن والبنوك', 'REVENUE', 'ASSET', '#2F3D27', 80),
  ('AST-REC', 'Assets - Tenants Receivables', 'الأصول - ذمم المستأجرين', 'REVENUE', 'ASSET', '#4A6B5D', 81),
  ('LIA-DEP', 'Liabilities - Tenant Deposits', 'الخصوم - تأمينات المستأجرين', 'EXPENSE', 'LIABILITY', '#9C5B3F', 82),
  ('EQ-OPB', 'Equity - Opening Balances', 'حقوق الملكية - أرصدة افتتاحية', 'REVENUE', 'EQUITY', '#5A4C70', 83),
  ('REV-RNT', 'Rent Revenue', 'إيرادات الإيجارات', 'REVENUE', 'REVENUE', '#2F3D27', 5),
  ('REV-SRV', 'Service Revenue', 'إيرادات الخدمات والاشتراكات', 'REVENUE', 'REVENUE', '#3E5C4E', 6)
ON CONFLICT (code) DO NOTHING;

-- Seed account mappings
INSERT INTO public.account_mappings (source_type, category_id, description) VALUES
  ('RENT_REVENUE', (SELECT id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1), 'حساب إيرادات إيجارات المحلات'),
  ('SERVICE_REVENUE', (SELECT id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1), 'حساب إيرادات الخدمات المشتركة والاشتراكات'),
  ('DEPOSIT_LIABILITY', (SELECT id FROM public.categories WHERE code = 'LIA-DEP' LIMIT 1), 'حساب التزامات تأمينات المستأجرين مستحقة الرد'),
  ('EXPENSE_CASH_ASSET', (SELECT id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1), 'الحساب الرئيسي للصناديق والبنوك للمصروفات'),
  ('REVENUE_CASH_ASSET', (SELECT id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1), 'الحساب الرئيسي للصناديق والبنوك للإيرادات')
ON CONFLICT (source_type) DO NOTHING;

-- 11. AUTOMATED POSTING ENGINE
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
AS $$
DECLARE
  v_period_id uuid;
  v_is_closed boolean;
  v_journal_id uuid;
  v_version int := 1;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  -- 1. Determine & check fiscal period
  SELECT id, is_closed INTO v_period_id, v_is_closed
  FROM public.fiscal_periods
  WHERE p_entry_date BETWEEN start_date AND end_date;

  IF v_period_id IS NULL THEN
    -- Auto-create open monthly period
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
    RAISE EXCEPTION 'لا يمكن ترحيل القيد في فترة مالية مغلقة.';
  END IF;

  -- 2. Determine version
  SELECT COALESCE(MAX(posting_version), 0) + 1 INTO v_version
  FROM public.journal_entries
  WHERE source_type = p_source_type AND source_id = p_source_id;

  -- 3. Calculate and validate balance
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين % != الدائن %', v_total_debit, v_total_credit;
  END IF;

  IF v_total_debit = 0 THEN
    RAISE EXCEPTION 'يجب أن يحتوي القيد على مبالغ أكبر من الصفر.';
  END IF;

  -- 4. Insert Journal Entry Header
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

  -- 5. Insert Journal Lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF COALESCE((v_line->>'debit')::numeric, 0) = 0 AND COALESCE((v_line->>'credit')::numeric, 0) = 0 THEN
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
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      v_line->>'description',
      COALESCE((v_line->>'sort_order')::int, 0),
      (v_line->>'contact_id')::uuid,
      (v_line->>'cashbox_id')::uuid
    );
  END LOOP;

  RETURN v_journal_id;
END;
$$;

-- 12. REVERSAL ENGINE
CREATE OR REPLACE FUNCTION public.reverse_ledger_entry(
  p_source_type text,
  p_source_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original_entry record;
  v_reversed_id uuid;
  v_version int;
BEGIN
  -- Find the latest active posted entry
  SELECT * INTO v_original_entry
  FROM public.journal_entries
  WHERE source_type = p_source_type AND source_id = p_source_id AND status = 'POSTED'
  ORDER BY posting_version DESC
  LIMIT 1;

  IF v_original_entry IS NULL THEN
    RETURN; -- Nothing to reverse
  END IF;

  -- Mark original as reversed
  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = v_original_entry.id;

  -- Increment version for the reversal entry
  SELECT COALESCE(MAX(posting_version), 0) + 1 INTO v_version
  FROM public.journal_entries
  WHERE source_type = p_source_type AND source_id = p_source_id;

  -- Create reversal entry header
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
    reversal_of_entry_id,
    created_by_user_id,
    posted_at
  ) VALUES (
    v_original_entry.reference || ' (عكسي)',
    CURRENT_DATE,
    'إلغاء وعكس القيد رقم #' || v_original_entry.number || ': ' || COALESCE(v_original_entry.description, ''),
    'عكس تلقائي بسبب تعديل أو حذف المعاملة',
    'POSTED',
    v_original_entry.period_id,
    p_source_type,
    p_source_id,
    v_version,
    v_original_entry.id,
    p_user_id,
    now()
  )
  RETURNING id INTO v_reversed_id;

  -- Insert reversed lines (swap debit and credit)
  INSERT INTO public.journal_lines (
    journal_id,
    category_id,
    debit,
    credit,
    description,
    sort_order,
    contact_id,
    cashbox_id
  )
  SELECT 
    v_reversed_id,
    category_id,
    credit as debit, -- Swap
    debit as credit, -- Swap
    'عكس: ' || COALESCE(description, ''),
    sort_order,
    contact_id,
    cashbox_id
  FROM public.journal_lines
  WHERE journal_id = v_original_entry.id;
END;
$$;

-- 13. TRANSACTION TRIGGER FUNCTION
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

DROP TRIGGER IF EXISTS trg_process_transaction_posting ON public.transactions;
CREATE TRIGGER trg_process_transaction_posting
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.process_transaction_posting();

-- 14. TENANT CHARGES TRIGGER FUNCTION (Rent Accrual)
CREATE OR REPLACE FUNCTION public.process_tenant_charge_posting()
RETURNS TRIGGER AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_rec_cat_id uuid;
  v_rev_cat_id uuid;
  v_tenant_id uuid;
  v_journal_id uuid;
BEGIN
  -- Get Rec category AST-REC
  SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
  
  -- Get Rent category REV-RNT or Service category REV-SRV
  IF NEW.type = 'SERVICE' THEN
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;
  ELSE
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  END IF;

  -- Get Tenant ID from contract
  SELECT tenant_id INTO v_tenant_id FROM public.lease_contracts WHERE id = NEW.contract_id;

  -- Reverse old entry if updated/deleted
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  -- Build Journal Lines (Accrual Method)
  -- Debit: Tenants Receivables (AST-REC)
  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rec_cat_id,
    'debit', NEW.amount,
    'credit', 0,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  -- Credit: Revenue Category (REV-RNT or REV-SRV)
  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rev_cat_id,
    'debit', 0,
    'credit', NEW.amount,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  -- Post the Journal Entry
  v_journal_id := public.post_to_ledger(
    'CHARGE',
    NEW.id,
    NEW.due_date,
    NEW.description,
    NULL,
    NULL,
    v_lines
  );

  -- Link the journal entry back to the charge row (using UPDATE WITHOUT trigger loop)
  -- To avoid firing trigger again, check if journal_entry_id is already set
  IF NEW.journal_entry_id IS DISTINCT FROM v_journal_id THEN
    UPDATE public.tenant_charges
    SET journal_entry_id = v_journal_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_tenant_charge_posting ON public.tenant_charges;
CREATE TRIGGER trg_process_tenant_charge_posting
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.process_tenant_charge_posting();

-- 15. BACKFILL FUNCTION FOR EXISTING TRANSACTIONS
CREATE OR REPLACE FUNCTION public.backfill_existing_transactions_to_ledger()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx record;
  v_count int := 0;
BEGIN
  -- Find all transactions that do not have a posted journal entry in public.journal_entries
  FOR v_tx IN 
    SELECT t.* 
    FROM public.transactions t
    LEFT JOIN public.journal_entries je ON je.source_type = 'TRANSACTION' AND je.source_id = t.id AND je.status = 'POSTED'
    WHERE t.status = 'POSTED' AND je.id IS NULL
    ORDER BY t.tx_date ASC, t.number ASC
  Loop
    -- Trigger will handle the posting if we force an update
    UPDATE public.transactions
    SET status = 'POSTED', updated_at = now()
    WHERE id = v_tx.id;
    
    v_count := v_count + 1;
  END LOOP;

  RETURN 'تم ترحيل عدد ' || v_count || ' معاملة سابقة بنجاح إلى قيود اليومية.';
END;
$$;

-- Grant permissions for new triggers and functions
GRANT EXECUTE ON FUNCTION public.post_to_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_ledger_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_existing_transactions_to_ledger TO authenticated;

-- DONE
