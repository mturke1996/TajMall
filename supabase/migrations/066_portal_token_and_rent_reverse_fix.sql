-- ============================================================
-- Migration 066: أمن portal_token + إصلاح عكس الإيجار بلا روابط
-- ============================================================
-- 1) إخفاء contacts.portal_token عن anon/authenticated عبر صلاحيات أعمدة
--    (REVOKE على العمود وحده لا يكفي إن وُجد GRANT SELECT على الجدول).
-- 2) عند عكس قيد: إعادة حساب المطالبات المرتبطة بالروابط أو journal_entry_id.
-- ============================================================

-- ---- 1) Column privileges: portal_token ----------------------
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name <> 'portal_token';

  IF cols IS NULL OR length(cols) < 3 THEN
    RAISE EXCEPTION 'contacts columns not found';
  END IF;

  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE public.contacts FROM authenticated';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE UPDATE ON TABLE public.contacts FROM authenticated';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM PUBLIC';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM anon';
  EXECUTE 'REVOKE INSERT ON TABLE public.contacts FROM authenticated';

  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.contacts TO anon, authenticated',
    cols
  );
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.contacts TO authenticated',
    cols
  );
  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.contacts TO authenticated',
    cols
  );
  EXECUTE 'GRANT DELETE ON TABLE public.contacts TO authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.contacts TO service_role';
  EXECUTE 'GRANT ALL ON TABLE public.contacts TO postgres';
END $$;

COMMENT ON COLUMN public.contacts.portal_token IS
  'Bearer secret لبوابة المستأجر. غير قابل للقراءة/التعديل عبر Data API للمصادقين — فقط service_role / SECURITY DEFINER.';

-- ---- 2) purge_rent_links_for_journal: شمل charges بالـ JE id --
CREATE OR REPLACE FUNCTION public.purge_rent_links_for_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge_id uuid;
  v_charge_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT x.charge_id)
  INTO v_charge_ids
  FROM (
    SELECT trjl.charge_id
    FROM public.tenant_rent_journal_links trjl
    WHERE trjl.journal_entry_id = p_journal_id
    UNION
    SELECT tc.id AS charge_id
    FROM public.tenant_charges tc
    WHERE tc.type = 'RENT'
      AND tc.journal_entry_id = p_journal_id
  ) x;

  IF v_charge_ids IS NULL OR cardinality(v_charge_ids) < 1 THEN
    RETURN;
  END IF;

  DELETE FROM public.tenant_rent_journal_links
  WHERE journal_entry_id = p_journal_id;

  FOREACH v_charge_id IN ARRAY v_charge_ids LOOP
    PERFORM public.recalc_tenant_charge_rent_paid(v_charge_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.purge_rent_links_for_journal(uuid) IS
  'يزيل روابط الإيجار للقيد المعكوس ويعيد حساب المطالبات — يشمل journal_entry_id المباشر.';
