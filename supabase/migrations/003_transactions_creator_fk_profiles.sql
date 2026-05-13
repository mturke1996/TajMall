-- ============================================================
-- PostgREST embed: transactions.creator -> profiles
-- ============================================================
-- 001 references auth.users; REST needs FK to public.profiles for:
--   creator:profiles(id,full_name_ar,full_name)
-- ============================================================

UPDATE public.transactions AS t
SET created_by = NULL
WHERE t.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = t.created_by
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
