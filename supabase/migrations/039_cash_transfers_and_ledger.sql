-- تحويلات بين الخزائن + سجل حركات الخزينة + تحديث أرصدة الخزائن

-- ── جدول التحويلات ──
CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          bigserial UNIQUE,
  reference       text,
  from_cashbox_id uuid NOT NULL REFERENCES public.cashboxes(id) ON DELETE RESTRICT,
  to_cashbox_id   uuid NOT NULL REFERENCES public.cashboxes(id) ON DELETE RESTRICT,
  amount          numeric(18,3) NOT NULL CHECK (amount > 0),
  currency        text NOT NULL DEFAULT 'LYD',
  transfer_date   date NOT NULL DEFAULT CURRENT_DATE,
  description     text,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_transfers_distinct_boxes CHECK (from_cashbox_id <> to_cashbox_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_transfers_from ON public.cash_transfers (from_cashbox_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_to ON public.cash_transfers (to_cashbox_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_date ON public.cash_transfers (transfer_date DESC);

DO $$ BEGIN
  CREATE TRIGGER trg_cash_transfers_updated
    BEFORE UPDATE ON public.cash_transfers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;
SELECT public.apply_strict_rbac_policies('cash_transfers');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transfers TO authenticated;

-- ── مرجع التحويل ──
CREATE OR REPLACE FUNCTION public.generate_cash_transfer_reference(p_transfer_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM p_transfer_date)::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq
  FROM public.cash_transfers
  WHERE EXTRACT(YEAR FROM transfer_date) = v_year;
  RETURN 'TR-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_cash_transfer_reference(date) TO authenticated;

-- ── تحديث عرض أرصدة الخزائن (يشمل التحويلات) ──
CREATE OR REPLACE VIEW public.cashbox_balances AS
SELECT
  c.id,
  c.code,
  c.name_ar,
  c.kind,
  c.bank_name,
  c.color,
  c.currency,
  c.opening_balance
    + COALESCE(tx.rev, 0)
    - COALESCE(tx.exp, 0)
    + COALESCE(tin.in_amt, 0)
    - COALESCE(tout.out_amt, 0)
    AS balance,
  COALESCE(tx.tx_count_month, 0)
    + COALESCE(tin.month_in_cnt, 0)
    + COALESCE(tout.month_out_cnt, 0) AS tx_count_month,
  COALESCE(tx.month_inflow, 0) + COALESCE(tin.month_in_amt, 0) AS month_inflow,
  COALESCE(tx.month_outflow, 0) + COALESCE(tout.month_out_amt, 0) AS month_outflow
FROM public.cashboxes c
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN t.kind = 'REVENUE' THEN t.amount ELSE 0 END) AS rev,
    SUM(CASE WHEN t.kind = 'EXPENSE' THEN t.amount ELSE 0 END) AS exp,
    COUNT(t.id) FILTER (WHERE t.tx_date >= date_trunc('month', CURRENT_DATE)) AS tx_count_month,
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.kind = 'REVENUE' AND t.tx_date >= date_trunc('month', CURRENT_DATE)
    ), 0) AS month_inflow,
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.kind = 'EXPENSE' AND t.tx_date >= date_trunc('month', CURRENT_DATE)
    ), 0) AS month_outflow
  FROM public.transactions t
  WHERE t.cashbox_id = c.id AND t.status = 'POSTED'
) tx ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(ct.amount), 0) AS in_amt,
    COALESCE(SUM(ct.amount) FILTER (
      WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)
    ), 0) AS month_in_amt,
    COUNT(*) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)) AS month_in_cnt
  FROM public.cash_transfers ct
  WHERE ct.to_cashbox_id = c.id
) tin ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(ct.amount), 0) AS out_amt,
    COALESCE(SUM(ct.amount) FILTER (
      WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)
    ), 0) AS month_out_amt,
    COUNT(*) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)) AS month_out_cnt
  FROM public.cash_transfers ct
  WHERE ct.from_cashbox_id = c.id
) tout ON true;

GRANT SELECT ON public.cashbox_balances TO authenticated, anon;

-- ── تنفيذ تحويل ──
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

  v_ref := public.generate_cash_transfer_reference(p_transfer_date);

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
    COALESCE(NULLIF(trim(p_description), ''), 'تحويل من ' || v_from_name || ' إلى ' || v_to_name),
    NULLIF(trim(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    'INSERT', 'cash_transfer', v_id, v_ref,
    'تحويل: ' || v_from_name || ' → ' || v_to_name || ' — ' || p_amount::text || ' ' || v_currency,
    p_transfer_date, -p_amount, p_from_cashbox_id, 'info',
    jsonb_build_object(
      'from_cashbox_id', p_from_cashbox_id,
      'to_cashbox_id', p_to_cashbox_id,
      'from_name_ar', v_from_name,
      'to_name_ar', v_to_name,
      'amount', p_amount
    )
  );

  PERFORM public.write_audit_log(
    'INSERT', 'cash_transfer', v_id, v_ref,
    'استلام تحويل: ' || v_from_name || ' → ' || v_to_name || ' — +' || p_amount::text || ' ' || v_currency,
    p_transfer_date, p_amount, p_to_cashbox_id, 'success',
    jsonb_build_object(
      'from_cashbox_id', p_from_cashbox_id,
      'to_cashbox_id', p_to_cashbox_id,
      'from_name_ar', v_from_name,
      'to_name_ar', v_to_name,
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

GRANT EXECUTE ON FUNCTION public.record_cashbox_transfer(uuid, uuid, numeric, date, text, text) TO authenticated;

-- ── سجل حركات خزينة واحدة ──
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
      t.id::text AS event_id,
      'transaction'::text AS source_type,
      t.kind::text AS event_kind,
      t.tx_date AS event_date,
      t.created_at,
      t.reference,
      t.number::text AS seq_label,
      t.description,
      CASE WHEN t.kind = 'REVENUE' THEN t.amount ELSE -t.amount END AS signed_amount,
      CASE WHEN t.kind = 'REVENUE' THEN 'in' ELSE 'out' END AS direction,
      NULL::uuid AS counter_cashbox_id,
      NULL::text AS counter_name_ar
    FROM public.transactions t
    WHERE t.cashbox_id = p_cashbox_id AND t.status = 'POSTED' AND t.kind IN ('REVENUE', 'EXPENSE')

    UNION ALL

    SELECT
      ct.id::text,
      'cash_transfer',
      'TRANSFER_OUT',
      ct.transfer_date,
      ct.created_at,
      ct.reference,
      ct.number::text,
      ct.description,
      -ct.amount,
      'out',
      ct.to_cashbox_id,
      tc.name_ar
    FROM public.cash_transfers ct
    JOIN public.cashboxes tc ON tc.id = ct.to_cashbox_id
    WHERE ct.from_cashbox_id = p_cashbox_id

    UNION ALL

    SELECT
      ct.id::text,
      'cash_transfer',
      'TRANSFER_IN',
      ct.transfer_date,
      ct.created_at,
      ct.reference,
      ct.number::text,
      ct.description,
      ct.amount,
      'in',
      ct.from_cashbox_id,
      fc.name_ar
    FROM public.cash_transfers ct
    JOIN public.cashboxes fc ON fc.id = ct.from_cashbox_id
    WHERE ct.to_cashbox_id = p_cashbox_id
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
      'event_id', event_id,
      'source_type', source_type,
      'event_kind', event_kind,
      'event_date', event_date,
      'reference', reference,
      'seq_label', seq_label,
      'description', description,
      'signed_amount', signed_amount,
      'direction', direction,
      'balance_after', balance_after,
      'counter_cashbox_id', counter_cashbox_id,
      'counter_name_ar', counter_name_ar
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

NOTIFY pgrst, 'reload schema';
