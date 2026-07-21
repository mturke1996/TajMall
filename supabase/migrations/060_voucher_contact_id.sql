-- ربط إذونات الصرف بجهة اتصال (مورد عادةً) مع الإبقاء على payee كنص للعرض/PDF
ALTER TABLE public.disbursement_vouchers
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disbursement_vouchers_contact
  ON public.disbursement_vouchers (contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN public.disbursement_vouchers.contact_id IS
  'اختياري: جهة الاتصال المرتبطة (غالباً VENDOR). payee يبقى نص العرض.';
