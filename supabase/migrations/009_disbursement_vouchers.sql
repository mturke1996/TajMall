-- إذونات صرف — تخزين نموذج إذن الصرف (رأس + بنود) لعرضها في النظام وتصدير PDF
-- يُشغَّل من لوحة Supabase → SQL Editor أو عبر CLI بعد المزامنة.

CREATE TABLE IF NOT EXISTS public.disbursement_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text NOT NULL,
  voucher_date date NOT NULL,
  payee text NOT NULL,
  bank_name text,
  account_number text,
  method payment_method NOT NULL DEFAULT 'CASH',
  notes text,
  total_amount numeric(18,3) NOT NULL CHECK (total_amount > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voucher_number, voucher_date)
);

CREATE TABLE IF NOT EXISTS public.disbursement_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.disbursement_vouchers(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  description text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursement_vouchers_created
  ON public.disbursement_vouchers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disbursement_vouchers_date
  ON public.disbursement_vouchers (voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_disbursement_voucher_lines_voucher
  ON public.disbursement_voucher_lines (voucher_id);

ALTER TABLE public.disbursement_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disbursement_voucher_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select disbursement_vouchers" ON public.disbursement_vouchers;
DROP POLICY IF EXISTS "auth insert disbursement_vouchers" ON public.disbursement_vouchers;
DROP POLICY IF EXISTS "auth update disbursement_vouchers" ON public.disbursement_vouchers;
DROP POLICY IF EXISTS "auth delete disbursement_vouchers" ON public.disbursement_vouchers;

CREATE POLICY "auth select disbursement_vouchers"
  ON public.disbursement_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert disbursement_vouchers"
  ON public.disbursement_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update disbursement_vouchers"
  ON public.disbursement_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete disbursement_vouchers"
  ON public.disbursement_vouchers FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth select disbursement_voucher_lines" ON public.disbursement_voucher_lines;
DROP POLICY IF EXISTS "auth insert disbursement_voucher_lines" ON public.disbursement_voucher_lines;
DROP POLICY IF EXISTS "auth update disbursement_voucher_lines" ON public.disbursement_voucher_lines;
DROP POLICY IF EXISTS "auth delete disbursement_voucher_lines" ON public.disbursement_voucher_lines;

CREATE POLICY "auth select disbursement_voucher_lines"
  ON public.disbursement_voucher_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert disbursement_voucher_lines"
  ON public.disbursement_voucher_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update disbursement_voucher_lines"
  ON public.disbursement_voucher_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete disbursement_voucher_lines"
  ON public.disbursement_voucher_lines FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_disbursement_vouchers_updated ON public.disbursement_vouchers;
CREATE TRIGGER trg_disbursement_vouchers_updated
  BEFORE UPDATE ON public.disbursement_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
