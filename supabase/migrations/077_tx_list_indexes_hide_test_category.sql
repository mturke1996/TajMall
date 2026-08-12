-- ============================================================
-- Migration 077: فهارس قائمة المعاملات + إخفاء بند تجريبي غير مستخدم
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transactions_kind_created
  ON public.transactions (kind, created_at DESC, number DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_by
  ON public.transactions (created_by);

CREATE INDEX IF NOT EXISTS cashbox_inventory_lines_cashbox_idx
  ON public.cashbox_inventory_lines (cashbox_id);

CREATE INDEX IF NOT EXISTS cashbox_inventory_runs_journal_idx
  ON public.cashbox_inventory_runs (journal_id);

UPDATE public.categories
SET active = false
WHERE code = 'EXP-TEST'
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.category_id = categories.id
  );
