-- ربط جزء من شهر الإيجار بقيد (عدة قيود حتى اكتمال الشهر)

CREATE TABLE IF NOT EXISTS public.tenant_rent_journal_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id        uuid NOT NULL REFERENCES public.tenant_charges(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  amount           numeric(18,3) NOT NULL CHECK (amount > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (charge_id, journal_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_rent_journal_links_charge
  ON public.tenant_rent_journal_links (charge_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_strict_rbac_policies'
  ) THEN
    PERFORM public.apply_strict_rbac_policies('tenant_rent_journal_links');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.set_tenant_rent_month_status(uuid, text[], boolean, uuid);

CREATE OR REPLACE FUNCTION public.set_tenant_rent_month_status(
  p_tenant_id uuid,
  p_months text[],
  p_paid boolean DEFAULT true,
  p_journal_entry_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_due date;
  v_je_number int;
  v_je_desc text;
  v_charge_id uuid;
  v_charge_amount numeric;
  v_current_paid numeric;
  v_link_amount numeric;
  v_new_paid numeric;
  v_desc text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_months IS NULL OR cardinality(p_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهراً واحداً على الأقل';
  END IF;

  IF p_journal_entry_id IS NOT NULL THEN
    SELECT je.number, je.description
    INTO v_je_number, v_je_desc
    FROM public.journal_entries je
    WHERE je.id = p_journal_entry_id
      AND je.status IN ('POSTED', 'DRAFT');

    IF v_je_number IS NULL THEN
      RAISE EXCEPTION 'القيد غير موجود أو غير صالح للربط';
    END IF;
  ELSIF p_paid THEN
    RAISE EXCEPTION 'اختر قيد اليومية الذي دُفع به هذا الشهر';
  END IF;

  BEGIN
    PERFORM set_config('fluxen.skip_charge_posting', '1', true);

    PERFORM public.ensure_tenant_rent_charges(p_tenant_id, p_months);

    FOREACH v_month IN ARRAY p_months LOOP
      IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'صيغة شهر غير صالحة: %', v_month;
      END IF;

      v_due := (v_month || '-01')::date;

      SELECT tc.id, tc.amount, tc.total_paid
      INTO v_charge_id, v_charge_amount, v_current_paid
      FROM public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
      LIMIT 1;

      IF v_charge_id IS NULL THEN
        RAISE EXCEPTION 'لا مطالبة إيجار لشهر %', v_month;
      END IF;

      IF NOT p_paid THEN
        DELETE FROM public.tenant_rent_journal_links
        WHERE charge_id = v_charge_id;

        UPDATE public.tenant_charges
        SET
          status = 'UNPAID',
          total_paid = 0,
          journal_entry_id = NULL,
          description = 'إيجار شهر ' || v_month,
          updated_at = now()
        WHERE id = v_charge_id;

        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.tenant_rent_journal_links trjl
        INNER JOIN public.tenant_charges tc2 ON tc2.id = trjl.charge_id
        INNER JOIN public.lease_contracts lc2 ON lc2.id = tc2.contract_id
        WHERE trjl.journal_entry_id = p_journal_entry_id
          AND lc2.tenant_id = p_tenant_id
          AND tc2.due_date IS DISTINCT FROM v_due
      ) OR EXISTS (
        SELECT 1
        FROM public.tenant_charges tc3
        INNER JOIN public.lease_contracts lc3 ON lc3.id = tc3.contract_id
        WHERE lc3.tenant_id = p_tenant_id
          AND tc3.journal_entry_id = p_journal_entry_id
          AND tc3.due_date IS DISTINCT FROM v_due
      ) THEN
        RAISE EXCEPTION 'هذا القيد مربوط بشهر إيجار آخر';
      END IF;

      v_current_paid := COALESCE(v_current_paid, 0);

      IF p_amount IS NULL OR p_amount <= 0 THEN
        v_link_amount := GREATEST(v_charge_amount - v_current_paid, 0);
        IF v_link_amount <= 0 THEN
          RAISE EXCEPTION 'شهر % مسدّد بالكامل', v_month;
        END IF;
      ELSE
        v_link_amount := LEAST(p_amount, GREATEST(v_charge_amount - v_current_paid, 0));
        IF v_link_amount <= 0 THEN
          RAISE EXCEPTION 'المبلغ يتجاوز المتبقي لشهر %', v_month;
        END IF;
      END IF;

      v_new_paid := LEAST(v_current_paid + v_link_amount, v_charge_amount);

      INSERT INTO public.tenant_rent_journal_links (charge_id, journal_entry_id, amount)
      VALUES (v_charge_id, p_journal_entry_id, v_link_amount)
      ON CONFLICT (charge_id, journal_entry_id)
      DO UPDATE SET amount = EXCLUDED.amount;

      v_desc := 'إيجار شهر ' || v_month;
      IF v_new_paid < v_charge_amount THEN
        v_desc := v_desc || ' · جزئي ' || trim(to_char(v_new_paid, '999999999990.999'))
          || '/' || trim(to_char(v_charge_amount, '999999999990.999'));
      END IF;
      v_desc := v_desc || ' · قيد #' || v_je_number::text
        || COALESCE(' — ' || NULLIF(btrim(v_je_desc), ''), '');

      UPDATE public.tenant_charges
      SET
        status = CASE
          WHEN v_new_paid >= v_charge_amount THEN 'PAID'
          ELSE 'PARTIAL'
        END,
        total_paid = v_new_paid,
        journal_entry_id = p_journal_entry_id,
        description = v_desc,
        updated_at = now()
      WHERE id = v_charge_id;
    END LOOP;

    PERFORM set_config('fluxen.skip_charge_posting', '0', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
      RAISE;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'months', to_jsonb(p_months),
    'paid', p_paid,
    'journal_entry_id', p_journal_entry_id,
    'amount', p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid, text[], boolean, uuid, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
