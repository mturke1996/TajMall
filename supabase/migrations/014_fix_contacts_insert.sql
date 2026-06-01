-- إصلاح إدراج جهات التعامل: صلاحيات API + رموز فريدة

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- رمز تلقائي فريد (تجنّب تعارض TEN-123456)
CREATE OR REPLACE FUNCTION public.generate_contact_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code :=
      UPPER(LEFT(NEW.kind::text, 3))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
