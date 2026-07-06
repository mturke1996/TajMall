-- ============================================================
-- Migration 042: تسوية بنكية (Bank Reconciliation)
-- ============================================================
-- يضيف عمود reconciled_at على transactions وcash_transfers، ويُظهره في
-- get_cashbox_ledger حتى تستطيع صفحة الخزينة عرض/تبديل حالة "مطابَق مع
-- كشف الحساب" لكل حركة على خزينة من نوع BANK.
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

ALTER TABLE public.cash_transfers
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transactions_reconciled
  ON public.transactions (cashbox_id, reconciled_at);

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
      NULL::text AS counter_name_ar,
      t.reconciled_at AS reconciled_at
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
      tc.name_ar,
      ct.reconciled_at
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
      fc.name_ar,
      ct.reconciled_at
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

-- تبديل حالة "مطابَق" لحركة واحدة — يُستدعى من واجهة التسوية البنكية.
-- محروس بنفس صلاحية الكتابة العادية (auth_role_may_write) بدل الاعتماد
-- على RLS الجدول فقط، لأن الدالة SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.set_ledger_event_reconciled(
  p_source_type text,
  p_event_id uuid,
  p_reconciled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'غير مصرح: القراءة فقط' USING ERRCODE = '42501';
  END IF;

  IF p_source_type = 'transaction' THEN
    UPDATE public.transactions
    SET reconciled_at = CASE WHEN p_reconciled THEN now() ELSE NULL END
    WHERE id = p_event_id;
  ELSIF p_source_type = 'cash_transfer' THEN
    UPDATE public.cash_transfers
    SET reconciled_at = CASE WHEN p_reconciled THEN now() ELSE NULL END
    WHERE id = p_event_id;
  ELSE
    RAISE EXCEPTION 'source_type غير معروف: %', p_source_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ledger_event_reconciled(text, uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
