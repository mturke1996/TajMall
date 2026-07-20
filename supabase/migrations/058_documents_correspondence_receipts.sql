-- مركز الوثائق: مراسلات رسمية/اعتيادية + إيصالات قبض

CREATE TABLE IF NOT EXISTS public.correspondence_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_number text NOT NULL,
  letter_date date NOT NULL,
  letter_type text NOT NULL CHECK (letter_type IN ('official', 'routine')),
  subject text NOT NULL,
  recipient_name text NOT NULL,
  recipient_title text,
  body text NOT NULL,
  reference_number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (letter_number, letter_date)
);

CREATE INDEX IF NOT EXISTS idx_correspondence_letters_date
  ON public.correspondence_letters (letter_date DESC);
CREATE INDEX IF NOT EXISTS idx_correspondence_letters_type
  ON public.correspondence_letters (letter_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL,
  receipt_date date NOT NULL,
  payer_name text NOT NULL,
  cashbox_id uuid REFERENCES public.cashboxes(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  method payment_method NOT NULL DEFAULT 'CASH',
  bank_name text,
  account_number text,
  notes text,
  total_amount numeric(18,3) NOT NULL CHECK (total_amount > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_number, receipt_date)
);

CREATE TABLE IF NOT EXISTS public.receipt_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipt_vouchers(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  description text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_created
  ON public.receipt_vouchers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_voucher_lines_receipt
  ON public.receipt_voucher_lines (receipt_id);

ALTER TABLE public.correspondence_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_voucher_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth insert correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth update correspondence_letters" ON public.correspondence_letters;
DROP POLICY IF EXISTS "auth delete correspondence_letters" ON public.correspondence_letters;

CREATE POLICY "auth select correspondence_letters"
  ON public.correspondence_letters FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert correspondence_letters"
  ON public.correspondence_letters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update correspondence_letters"
  ON public.correspondence_letters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete correspondence_letters"
  ON public.correspondence_letters FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth select receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth insert receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth update receipt_vouchers" ON public.receipt_vouchers;
DROP POLICY IF EXISTS "auth delete receipt_vouchers" ON public.receipt_vouchers;

CREATE POLICY "auth select receipt_vouchers"
  ON public.receipt_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert receipt_vouchers"
  ON public.receipt_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update receipt_vouchers"
  ON public.receipt_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete receipt_vouchers"
  ON public.receipt_vouchers FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth select receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "auth insert receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "auth update receipt_voucher_lines" ON public.receipt_voucher_lines;
DROP POLICY IF EXISTS "auth delete receipt_voucher_lines" ON public.receipt_voucher_lines;

CREATE POLICY "auth select receipt_voucher_lines"
  ON public.receipt_voucher_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert receipt_voucher_lines"
  ON public.receipt_voucher_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update receipt_voucher_lines"
  ON public.receipt_voucher_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete receipt_voucher_lines"
  ON public.receipt_voucher_lines FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_correspondence_letters_updated ON public.correspondence_letters;
CREATE TRIGGER trg_correspondence_letters_updated
  BEFORE UPDATE ON public.correspondence_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_receipt_vouchers_updated ON public.receipt_vouchers;
CREATE TRIGGER trg_receipt_vouchers_updated
  BEFORE UPDATE ON public.receipt_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.correspondence_letters IS 'مراسلات رسمية واعتيادية — تصدير PDF';
COMMENT ON TABLE public.receipt_vouchers IS 'إيصالات قبض — مقابل إذن الصرف';
