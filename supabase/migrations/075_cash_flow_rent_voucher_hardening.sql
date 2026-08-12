-- ============================================================
-- Migration 075: تدفق نقدي من دفتر الخزينة + تحصين الإيجار + حذف إذن الصرف
-- ============================================================
-- 1) get_cash_flow من أسطر الخزينة المرحّلة (لا من جدول transactions)
-- 2) قيد فريد لمطالبة إيجار/خدمة واحدة لكل عقد وشهر
-- 3) set_tenant_rent_month_status لا يتجاوز مبلغ القيد غير المربوط
-- 4) generate_monthly_charges على الخادم (شرائح سعر + إعفاء)
-- 5) ترحيل الإذن يفشل بوضوح إن نقص الحساب؛ RPC لحذف الإذن مع عكس القيد
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- (أ) مطالبة إيجار/خدمة واحدة لكل عقد وشهر
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS tenant_charges_one_rent_or_service_per_month
  ON public.tenant_charges (contract_id, due_date, type)
  WHERE type IN ('RENT', 'SERVICE');

-- ────────────────────────────────────────────────────────────
-- (ب) التدفق النقدي من قيود الخزينة
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cash_flow(
  p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date := make_date(p_year, 1, 1);
  end_date date := make_date(p_year + 1, 1, 1);
  v_opening numeric := 0;
  v_closing numeric := 0;
  v_operating_in numeric := 0;
  v_operating_out numeric := 0;
  v_investing_in numeric := 0;
  v_investing_out numeric := 0;
  v_financing_in numeric := 0;
  v_financing_out numeric := 0;
  v_base_opening numeric := 0;
BEGIN
  SELECT COALESCE(SUM(cb.opening_balance), 0)
  INTO v_base_opening
  FROM public.cashboxes cb;

  SELECT v_base_opening + COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_opening
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE je.status = 'POSTED'
    AND jl.cashbox_id IS NOT NULL
    AND je.entry_date < start_date;

  SELECT v_base_opening + COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_closing
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE je.status = 'POSTED'
    AND jl.cashbox_id IS NOT NULL
    AND je.entry_date < end_date;

  WITH cash_move AS (
    SELECT
      je.id AS journal_id,
      je.source_type,
      jl.debit,
      jl.credit,
      (
        SELECT c.type::text
        FROM public.journal_lines jl2
        JOIN public.categories c ON c.id = jl2.category_id
        WHERE jl2.journal_id = je.id
          AND jl2.cashbox_id IS NULL
        ORDER BY GREATEST(jl2.debit, jl2.credit) DESC
        LIMIT 1
      ) AS other_type,
      (
        SELECT c.code
        FROM public.journal_lines jl2
        JOIN public.categories c ON c.id = jl2.category_id
        WHERE jl2.journal_id = je.id
          AND jl2.cashbox_id IS NULL
        ORDER BY GREATEST(jl2.debit, jl2.credit) DESC
        LIMIT 1
      ) AS other_code
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_id
    WHERE je.status = 'POSTED'
      AND jl.cashbox_id IS NOT NULL
      AND je.entry_date >= start_date
      AND je.entry_date < end_date
      AND je.source_type IS DISTINCT FROM 'CASH_TRANSFER'
  )
  SELECT
    COALESCE(SUM(CASE
      WHEN other_type IN ('EQUITY', 'LIABILITY') THEN debit ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN other_type IN ('EQUITY', 'LIABILITY') THEN credit ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN other_type = 'ASSET' AND other_code IS DISTINCT FROM 'AST-CSH'
        AND other_code IS DISTINCT FROM 'AST-REC'
      THEN debit ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN other_type = 'ASSET' AND other_code IS DISTINCT FROM 'AST-CSH'
        AND other_code IS DISTINCT FROM 'AST-REC'
      THEN credit ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(other_type, 'REVENUE') NOT IN ('EQUITY', 'LIABILITY')
        AND NOT (
          other_type = 'ASSET'
          AND other_code IS DISTINCT FROM 'AST-CSH'
          AND other_code IS DISTINCT FROM 'AST-REC'
        )
      THEN debit ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(other_type, 'EXPENSE') NOT IN ('EQUITY', 'LIABILITY')
        AND NOT (
          other_type = 'ASSET'
          AND other_code IS DISTINCT FROM 'AST-CSH'
          AND other_code IS DISTINCT FROM 'AST-REC'
        )
      THEN credit ELSE 0 END), 0)
  INTO
    v_financing_in, v_financing_out,
    v_investing_in, v_investing_out,
    v_operating_in, v_operating_out
  FROM cash_move;

  RETURN jsonb_build_object(
    'operating', jsonb_build_array(
      jsonb_build_object(
        'category', 'مقبوضات تشغيلية',
        'description', 'تحصيلات وإيرادات نقدية من دفتر الخزينة',
        'amount', v_operating_in::text,
        'is_positive', true
      ),
      jsonb_build_object(
        'category', 'مدفوعات تشغيلية',
        'description', 'مصروفات وأذونات صرف نقدية',
        'amount', v_operating_out::text,
        'is_positive', false
      )
    ),
    'investing', jsonb_build_array(
      jsonb_build_object(
        'category', 'شراء أصول',
        'description', 'مدفوعات نقدية مقابل أصول غير نقدية',
        'amount', v_investing_out::text,
        'is_positive', false
      ),
      jsonb_build_object(
        'category', 'بيع أصول',
        'description', 'مقبوضات نقدية من أصول غير نقدية',
        'amount', v_investing_in::text,
        'is_positive', true
      )
    ),
    'financing', jsonb_build_array(
      jsonb_build_object(
        'category', 'تمويل داخل',
        'description', 'قروض ورأس مال وحقوق ملكية',
        'amount', v_financing_in::text,
        'is_positive', true
      ),
      jsonb_build_object(
        'category', 'تمويل خارج',
        'description', 'سداد قروض أو توزيعات',
        'amount', v_financing_out::text,
        'is_positive', false
      )
    ),
    'summary', jsonb_build_object(
      'opening_balance', v_opening::text,
      'operating_inflow', v_operating_in::text,
      'operating_outflow', v_operating_out::text,
      'net_operating', (v_operating_in - v_operating_out)::text,
      'investing_inflow', v_investing_in::text,
      'investing_outflow', v_investing_out::text,
      'net_investing', (v_investing_in - v_investing_out)::text,
      'financing_inflow', v_financing_in::text,
      'financing_outflow', v_financing_out::text,
      'net_financing', (v_financing_in - v_financing_out)::text,
      'net_change', (v_closing - v_opening)::text,
      'closing_balance', v_closing::text
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_flow(integer) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (ج) ربط الأشهر لا يتجاوز المتبقي على القيد
-- ────────────────────────────────────────────────────────────
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
  v_remaining numeric;
  v_je_debit numeric;
  v_already_linked numeric;
  v_available numeric;
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

  IF p_paid THEN
    SELECT COALESCE(SUM(jl.debit), 0)
    INTO v_je_debit
    FROM public.journal_lines jl
    WHERE jl.journal_id = p_journal_entry_id;

    SELECT COALESCE(SUM(trjl.amount), 0)
    INTO v_already_linked
    FROM public.tenant_rent_journal_links trjl
    WHERE trjl.journal_entry_id = p_journal_entry_id;

    v_available := GREATEST(v_je_debit - v_already_linked, 0);

    IF p_amount IS NOT NULL AND p_amount > 0 THEN
      IF p_amount > v_available + 0.01 THEN
        RAISE EXCEPTION
          'المبلغ أكبر من المتبقي غير المربوط على هذا القيد (% د.ل)',
          trim(to_char(v_available, '999999999990.999'));
      END IF;
      v_payment_pool := p_amount;
    ELSE
      v_payment_pool := v_available;
    END IF;

    IF v_payment_pool <= 0 THEN
      RAISE EXCEPTION 'لا يتبقى مبلغ غير مربوط على هذا القيد';
    END IF;
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
      v_remaining := GREATEST(v_charge_amount - v_current_paid, 0);

      IF v_remaining <= 0 THEN
        CONTINUE;
      END IF;
      IF v_payment_pool <= 0 THEN
        RAISE EXCEPTION
          'المبلغ لا يكفي لتغطية كل الأشهر المحددة (توقف عند %)',
          v_month;
      END IF;
      v_link_amount := LEAST(v_payment_pool, v_remaining);
      v_payment_pool := v_payment_pool - v_link_amount;

      v_new_paid := LEAST(v_current_paid + v_link_amount, v_charge_amount);

      INSERT INTO public.tenant_rent_journal_links (charge_id, journal_entry_id, amount)
      VALUES (v_charge_id, p_journal_entry_id, v_link_amount)
      ON CONFLICT (charge_id, journal_entry_id)
      DO UPDATE SET amount = public.tenant_rent_journal_links.amount + EXCLUDED.amount;

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

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_month_status(uuid, text[], boolean, uuid, numeric)
  TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (د) توليد مطالبات الشهر على الخادم
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_monthly_charges(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_due date;
  v_rent_before int;
  v_rent_after int;
  v_rent int := 0;
  v_svc int := 0;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'صيغة شهر غير صالحة';
  END IF;

  v_due := (p_month || '-01')::date;

  FOR r IN
    SELECT lc.id AS contract_id, lc.tenant_id, lc.services_amount
    FROM public.lease_contracts lc
    WHERE lc.status = 'ACTIVE'
  LOOP
    SELECT COUNT(*)::int INTO v_rent_before
    FROM public.tenant_charges tc
    WHERE tc.contract_id = r.contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due;

    PERFORM public.ensure_tenant_rent_charges(r.tenant_id, ARRAY[p_month]);

    SELECT COUNT(*)::int INTO v_rent_after
    FROM public.tenant_charges tc
    WHERE tc.contract_id = r.contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due;

    IF v_rent_before = 0 AND v_rent_after > 0 THEN
      v_rent := v_rent + 1;
    END IF;

    IF COALESCE(r.services_amount, 0) > 0 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_charges tc
        WHERE tc.contract_id = r.contract_id
          AND tc.type = 'SERVICE'
          AND tc.due_date = v_due
      ) THEN
        INSERT INTO public.tenant_charges (
          contract_id, amount, due_date, type, description, status, total_paid
        ) VALUES (
          r.contract_id,
          r.services_amount,
          v_due,
          'SERVICE',
          'رسوم خدمات وصيانة شهر ' || p_month,
          'UNPAID',
          0
        );
        v_svc := v_svc + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'month', p_month,
    'rent_created', v_rent,
    'service_created', v_svc,
    'created', v_rent + v_svc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_charges(text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (هـ) ترحيل الإذن: لا صمت عند نقص الحساب
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_disbursement_voucher_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_cash_cat_id uuid;
  v_exp_cat_id uuid;
  v_desc text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'APPROVED' THEN
    PERFORM public.reverse_ledger_entry('VOUCHER', OLD.id, OLD.created_by);
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit_log(
      'DELETE', 'disbursement_voucher', OLD.id,
      'إذن صرف #' || OLD.voucher_number,
      'حذف إذن صرف #' || OLD.voucher_number || ' — ' || OLD.total_amount::text || ' د.ل',
      OLD.voucher_date, OLD.total_amount, OLD.cashbox_id, 'danger',
      jsonb_build_object('deleted_record', row_to_json(OLD))
    );
    RETURN OLD;
  END IF;

  IF NEW.status <> 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cash_cat_id FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  v_exp_cat_id := COALESCE(
    NEW.category_id,
    (SELECT id FROM public.categories WHERE type = 'EXPENSE' AND active = true ORDER BY sort_order LIMIT 1)
  );

  IF v_cash_cat_id IS NULL OR v_exp_cat_id IS NULL THEN
    RAISE EXCEPTION
      'تعذّر ترحيل إذن الصرف: حساب الخزينة (AST-CSH) أو بند المصروف غير معرّف';
  END IF;

  v_desc := 'إذن صرف #' || NEW.voucher_number || ' — ' || NEW.payee;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_exp_cat_id,
    'debit', NEW.total_amount,
    'credit', 0,
    'description', v_desc
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_cash_cat_id,
    'debit', 0,
    'credit', NEW.total_amount,
    'description', v_desc,
    'cashbox_id', NEW.cashbox_id
  );

  PERFORM public.post_to_ledger(
    'VOUCHER',
    NEW.id,
    NEW.voucher_date,
    v_desc,
    NEW.notes,
    NEW.created_by,
    v_lines
  );

  PERFORM public.write_audit_log(
    'INSERT', 'disbursement_voucher', NEW.id,
    'إذن #' || NEW.voucher_number,
    'اعتماد وترحيل إذن صرف #' || NEW.voucher_number || ' — ' || NEW.payee || ' — −' || NEW.total_amount::text || ' د.ل',
    NEW.voucher_date, -NEW.total_amount, NEW.cashbox_id, 'warning',
    jsonb_build_object('payee', NEW.payee, 'amount', NEW.total_amount, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_disbursement_voucher(p_voucher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_status text;
BEGIN
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  IF p_voucher_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الإذن مطلوب';
  END IF;

  SELECT voucher_number, status::text
  INTO v_number, v_status
  FROM public.disbursement_vouchers
  WHERE id = p_voucher_id;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'إذن الصرف غير موجود';
  END IF;

  DELETE FROM public.disbursement_vouchers
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_voucher_id,
    'voucher_number', v_number,
    'was_status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_disbursement_voucher(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
