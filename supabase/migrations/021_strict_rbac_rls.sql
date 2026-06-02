-- ============================================================
-- Migration 021: Strict RBAC — المشاهد (viewer) قراءة فقط
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'viewer'
  )));
$$;

CREATE OR REPLACE FUNCTION public.auth_is_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() = 'viewer';
$$;

CREATE OR REPLACE FUNCTION public.auth_role_may_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_viewer();
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() IN ('owner', 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_may_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_org() TO authenticated;

-- ── profiles: القراءة للجميع؛ التعديل للنفس أو المدير/المالك ──
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
DROP POLICY IF EXISTS "self update profiles" ON public.profiles;
DROP POLICY IF EXISTS "self insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "rbac_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "rbac_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "rbac_insert_profiles" ON public.profiles;

CREATE POLICY "rbac_select_profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "rbac_insert_profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "rbac_update_profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.auth_can_manage_org())
  WITH CHECK (auth.uid() = id OR public.auth_can_manage_org());

-- ── جداول مشتركة: SELECT للجميع؛ كتابة لغير المشاهد ──
CREATE OR REPLACE FUNCTION public.apply_strict_rbac_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = p_table
  ) THEN
    RAISE NOTICE 'تخطي RLS: الجدول public.% غير موجود', p_table;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS "auth select %1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "auth insert %1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "auth update %1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "auth delete %1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "rbac_select_%1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "rbac_insert_%1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "rbac_update_%1$s" ON public.%1$I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "rbac_delete_%1$s" ON public.%1$I', p_table);

  EXECUTE format(
    'CREATE POLICY "rbac_select_%1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY "rbac_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.auth_role_may_write())',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY "rbac_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.auth_role_may_write()) WITH CHECK (public.auth_role_may_write())',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY "rbac_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.auth_role_may_write())',
    p_table
  );
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches',
    'categories',
    'cashboxes',
    'transactions',
    'contacts',
    'journal_entries',
    'journal_lines',
    'disbursement_vouchers',
    'disbursement_voucher_lines',
    'transaction_form_drafts',
    'journal_form_drafts',
    'journal_reference_sequences',
    'mall_units',
    'lease_contracts',
    'tenant_charges',
    'tenant_charge_allocations',
    'fiscal_periods',
    'account_mappings'
  ]
  LOOP
    PERFORM public.apply_strict_rbac_policies(t);
  END LOOP;
END $$;

-- إشعارات (إن وُجد الجدول — هجرة 019)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_notifications'
  ) THEN
    DROP POLICY IF EXISTS "auth select app_notifications" ON public.app_notifications;
    DROP POLICY IF EXISTS "auth insert app_notifications" ON public.app_notifications;
    DROP POLICY IF EXISTS "auth update app_notifications" ON public.app_notifications;
    DROP POLICY IF EXISTS "rbac_select_app_notifications" ON public.app_notifications;
    DROP POLICY IF EXISTS "rbac_insert_app_notifications" ON public.app_notifications;
    DROP POLICY IF EXISTS "rbac_update_app_notifications" ON public.app_notifications;

    ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "rbac_select_app_notifications"
      ON public.app_notifications FOR SELECT TO authenticated USING (true);
    CREATE POLICY "rbac_insert_app_notifications"
      ON public.app_notifications FOR INSERT TO authenticated
      WITH CHECK (public.auth_role_may_write());
    CREATE POLICY "rbac_update_app_notifications"
      ON public.app_notifications FOR UPDATE TO authenticated
      USING (true) WITH CHECK (true);
  ELSE
    RAISE NOTICE 'تخطي RLS: الجدول public.app_notifications غير موجود';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
