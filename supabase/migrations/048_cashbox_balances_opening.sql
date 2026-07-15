-- ============================================================
-- Migration 048: إصلاح عرض أرصدة الخزائن (cashbox_balances)
-- ============================================================
-- المشكلة: عرض cashbox_balances لا يُعرّف عمود opening_balance، بينما:
--   1) دالة get_cash_flow(p_year) تستدعي SUM(opening_balance) من العرض →
--      تنفجر صفحة "التدفقات النقدية" بخطأ: column "opening_balance" does not exist.
--   2) نوع CashboxBalanceRow في الواجهة يتوقع opening_balance لكنه يرجع undefined.
-- الحل: إعادة بناء العرض مع إضافة عمود opening_balance (قيمته c.opening_balance)
-- قبل عمود balance، مع الحفاظ على كل الأعمدة الحالية وأسمائها وأنواعها.
-- ============================================================

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
    + COALESCE(tx.rev, 0)
    - COALESCE(tx.exp, 0)
    + COALESCE(tin.in_amt, 0)
    - COALESCE(tout.out_amt, 0) AS balance,
  COALESCE(tx.tx_count_month, 0) + COALESCE(tin.month_in_cnt, 0) + COALESCE(tout.month_out_cnt, 0) AS tx_count_month,
  COALESCE(tx.month_inflow, 0) + COALESCE(tin.month_in_amt, 0) AS month_inflow,
  COALESCE(tx.month_outflow, 0) + COALESCE(tout.month_out_amt, 0) AS month_outflow
FROM public.cashboxes c
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN t.kind = 'REVENUE' THEN t.amount ELSE 0 END) AS rev,
    SUM(CASE WHEN t.kind = 'EXPENSE'  THEN t.amount ELSE 0 END) AS exp,
    COUNT(t.id) FILTER (WHERE t.tx_date >= date_trunc('month', CURRENT_DATE)) AS tx_count_month,
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'REVENUE' AND t.tx_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_inflow,
    COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'EXPENSE'  AND t.tx_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_outflow
  FROM public.transactions t
  WHERE t.cashbox_id = c.id AND t.status = 'POSTED'
) tx ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(ct.amount), 0) AS in_amt,
    COALESCE(SUM(ct.amount) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_in_amt,
    COUNT(*) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)) AS month_in_cnt
  FROM public.cash_transfers ct
  WHERE ct.to_cashbox_id = c.id
) tin ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(ct.amount), 0) AS out_amt,
    COALESCE(SUM(ct.amount) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)), 0) AS month_out_amt,
    COUNT(*) FILTER (WHERE ct.transfer_date >= date_trunc('month', CURRENT_DATE)) AS month_out_cnt
  FROM public.cash_transfers ct
  WHERE ct.from_cashbox_id = c.id
) tout ON true;

GRANT SELECT ON public.cashbox_balances TO authenticated, anon;
