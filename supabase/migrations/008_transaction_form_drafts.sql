-- ============================================================
-- مسودات نماذج المعاملات (مصروف / إيراد) قبل الترحيل النهائي
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transaction_form_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        tx_kind NOT NULL,
  label       text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_form_drafts_user_kind
  ON public.transaction_form_drafts (user_id, kind, updated_at DESC);

DROP TRIGGER IF EXISTS trg_transaction_form_drafts_updated ON public.transaction_form_drafts;
CREATE TRIGGER trg_transaction_form_drafts_updated
  BEFORE UPDATE ON public.transaction_form_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transaction_form_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts select own" ON public.transaction_form_drafts;
DROP POLICY IF EXISTS "drafts insert own" ON public.transaction_form_drafts;
DROP POLICY IF EXISTS "drafts update own" ON public.transaction_form_drafts;
DROP POLICY IF EXISTS "drafts delete own" ON public.transaction_form_drafts;

CREATE POLICY "drafts select own"
  ON public.transaction_form_drafts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "drafts insert own"
  ON public.transaction_form_drafts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts update own"
  ON public.transaction_form_drafts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts delete own"
  ON public.transaction_form_drafts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
