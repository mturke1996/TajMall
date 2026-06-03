-- إيراد الإيجار: ربط الشهور بقيد المعاملة (بدون تخصيص مطالبات منفصل)
-- نفس القيد يمكن ربطه بعدة أشهر لنفس المستأجر

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
  v_month_count int;
  v_payment_pool numeric;
  v_sorted_months text[];
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_months IS NULL OR cardinality(p_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهراً واحداً على الأقل';
  END IF;

  v_month_count := cardinality(p_months);

  SELECT array_agg(m ORDER BY m)
  INTO v_sorted_months
  FROM unnest(p_months) AS m;

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

  IF p_paid AND p_amount IS NOT NULL AND p_amount > 0 THEN
    v_payment_pool := p_amount;
  ELSE
    v_payment_pool := NULL;
  END IF;

  BEGIN
    PERFORM set_config('fluxen.skip_charge_posting', '1', true);

    PERFORM public.ensure_tenant_rent_charges(p_tenant_id, v_sorted_months);

    FOREACH v_month IN ARRAY v_sorted_months LOOP
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
          AND lc2.tenant_id IS DISTINCT FROM p_tenant_id
      ) THEN
        RAISE EXCEPTION 'هذا القيد مربوط بمستأجر آخر';
      END IF;

      v_current_paid := COALESCE(v_current_paid, 0);

      IF v_payment_pool IS NULL THEN
        v_link_amount := GREATEST(v_charge_amount - v_current_paid, 0);
        IF v_link_amount <= 0 THEN
          RAISE EXCEPTION 'شهر % مسدّد بالكامل', v_month;
        END IF;
      ELSE
        v_link_amount := LEAST(
          v_payment_pool,
          GREATEST(v_charge_amount - v_current_paid, 0)
        );
        IF v_link_amount <= 0 THEN
          CONTINUE;
        END IF;
        v_payment_pool := v_payment_pool - v_link_amount;
      END IF;

      v_new_paid := LEAST(v_current_paid + v_link_amount, v_charge_amount);

      INSERT INTO public.tenant_rent_journal_links (charge_id, journal_entry_id, amount)
      VALUES (v_charge_id, p_journal_entry_id, v_link_amount)
      ON CONFLICT (charge_id, journal_entry_id)
      DO UPDATE SET amount = EXCLUDED.amount;

      v_desc := 'إيجار شهر ' || v_month;
      IF v_month_count > 1 THEN
        v_desc := v_desc || ' (ضمن ' || v_month_count::text || ' أشهر)';
      END IF;
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
    'months', to_jsonb(v_sorted_months),
    'paid', p_paid,
    'journal_entry_id', p_journal_entry_id,
    'amount', p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rent_payment(
  tenant_id uuid,
  amount numeric,
  payment_date date DEFAULT CURRENT_DATE,
  cashbox_id uuid DEFAULT NULL,
  description text DEFAULT NULL,
  rent_months text[] DEFAULT NULL,
  payment_method text DEFAULT 'CASH'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tx_id uuid;
  effective_cashbox_id uuid;
  rent_category_id uuid;
  v_desc text;
  v_method text;
  v_journal_id uuid;
BEGIN
  v_method := upper(trim(coalesce(payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'CHEQUE', 'TRANSFER', 'CARD') THEN
    v_method := 'CASH';
  END IF;

  IF rent_months IS NULL OR cardinality(rent_months) < 1 THEN
    RAISE EXCEPTION 'حدّد شهر إيجار واحداً على الأقل';
  END IF;

  IF cashbox_id IS NULL THEN
    SELECT c.id INTO effective_cashbox_id
    FROM public.cashboxes c
    WHERE c.active = true
    ORDER BY c.created_at
    LIMIT 1;
  ELSE
    effective_cashbox_id := cashbox_id;
  END IF;

  SELECT cat.id INTO rent_category_id
  FROM public.categories cat
  WHERE cat.code = 'REV-RNT'
  LIMIT 1;

  v_desc := COALESCE(
    description,
    'تحصيل إيجار: ' || array_to_string(rent_months, '، ')
  );

  INSERT INTO public.transactions (
    kind, status, method, amount, currency, tx_date, description,
    category_id, cashbox_id, contact_id, contact_type, posted_at,
    auto_allocate_charges
  ) VALUES (
    'REVENUE', 'POSTED', v_method, amount, 'LYD', payment_date, v_desc,
    rent_category_id, effective_cashbox_id, tenant_id, 'PAYER', now(),
    false
  )
  RETURNING id INTO new_tx_id;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.source_type = 'TRANSACTION'
    AND je.source_id = new_tx_id
    AND je.status IN ('POSTED', 'DRAFT')
  ORDER BY je.created_at DESC
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'لم يُنشأ قيد للمعاملة — تحقق من ترحيل اليومية';
  END IF;

  PERFORM public.set_tenant_rent_month_status(
    tenant_id,
    rent_months,
    true,
    v_journal_id,
    amount
  );

  RETURN jsonb_build_object(
    'transaction_id', new_tx_id,
    'journal_entry_id', v_journal_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid, text[], boolean, uuid, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rent_payment(uuid, numeric, date, uuid, text, text[], text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
