-- ============================================================
-- Migration 072: إصلاح روابط الإيجار + استحقاقات مبالغ فيها
--               + قيد الفترة بلا سقف إجمالي + مواءمة CHARGE
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- (أ) تصحيح قيود CHARGE التي لا تطابق مبلغ المطالبة
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_rec uuid;
  v_rev uuid;
BEGIN
  PERFORM set_config('fluxen.skip_charge_posting', '1', true);

  SELECT id INTO v_rec FROM public.categories WHERE code = 'AST-REC' LIMIT 1;
  SELECT id INTO v_rev FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;

  FOR r IN
    SELECT je.id AS je_id, tc.amount
    FROM public.journal_entries je
    JOIN public.tenant_charges tc ON tc.id = je.source_id
    WHERE je.source_type = 'CHARGE'
      AND je.status = 'POSTED'
      AND EXISTS (
        SELECT 1
        FROM public.journal_lines jl
        JOIN public.categories cat ON cat.id = jl.category_id
        WHERE jl.journal_id = je.id
          AND cat.code = 'REV-RNT'
          AND jl.credit > tc.amount + 0.01
      )
  LOOP
    UPDATE public.journal_lines
    SET debit = r.amount, credit = 0
    WHERE journal_id = r.je_id AND category_id = v_rec;

    UPDATE public.journal_lines
    SET debit = 0, credit = r.amount
    WHERE journal_id = r.je_id AND category_id = v_rev;

    UPDATE public.journal_entries
    SET notes = COALESCE(notes || ' | ', '') || '072 align accrual to charge amount',
        updated_at = now()
    WHERE id = r.je_id;
  END LOOP;

  PERFORM set_config('fluxen.skip_charge_posting', '0', true);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (ب) set_tenant_rent_month_status: تراكم الروابط + رفض التغطية الناقصة
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
      v_remaining := GREATEST(v_charge_amount - v_current_paid, 0);

      IF v_payment_pool IS NULL THEN
        v_link_amount := v_remaining;
        IF v_link_amount <= 0 THEN
          RAISE EXCEPTION 'شهر % مسدّد بالكامل', v_month;
        END IF;
      ELSE
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
      END IF;

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

-- ────────────────────────────────────────────────────────────
-- (ج) محفّز CHARGE: لا تتخطَّ إن مبلغ الاستحقاق لا يطابق المطالبة
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_tenant_charge_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  v_rec_cat_id uuid;
  v_rev_cat_id uuid;
  v_tenant_id uuid;
  v_journal_id uuid;
  v_has_charge_accrual boolean := false;
  v_keep_existing_link boolean := false;
  v_accrual_credit numeric := 0;
BEGIN
  IF current_setting('fluxen.skip_charge_posting', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_rec_cat_id FROM public.categories WHERE code = 'AST-REC' LIMIT 1;

  IF NEW.type = 'SERVICE' THEN
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-SRV' LIMIT 1;
  ELSE
    SELECT id INTO v_rev_cat_id FROM public.categories WHERE code = 'REV-RNT' LIMIT 1;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.lease_contracts
  WHERE id = NEW.contract_id;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'PAID'
      AND NEW.journal_entry_id IS NOT NULL
      AND OLD.amount IS NOT DISTINCT FROM NEW.amount
      AND OLD.due_date IS NOT DISTINCT FROM NEW.due_date
      AND OLD.contract_id IS NOT DISTINCT FROM NEW.contract_id
    THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.source_type = 'CHARGE'
          AND je.source_id = NEW.id
          AND je.status = 'POSTED'
      ) INTO v_has_charge_accrual;

      IF v_has_charge_accrual THEN
        SELECT COALESCE(SUM(jl.credit), 0)
        INTO v_accrual_credit
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.journal_id = je.id
        JOIN public.categories cat ON cat.id = jl.category_id
        WHERE je.source_type = 'CHARGE'
          AND je.source_id = NEW.id
          AND je.status = 'POSTED'
          AND cat.code IN ('REV-RNT', 'REV-SRV');

        IF v_accrual_credit IS NOT DISTINCT FROM NEW.amount THEN
          RETURN NEW;
        END IF;

        PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
      END IF;
    ELSE
      PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.reverse_ledger_entry('CHARGE', OLD.id, NULL);
    RETURN OLD;
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rec_cat_id,
    'debit', NEW.amount,
    'credit', 0,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_lines := v_lines || jsonb_build_object(
    'category_id', v_rev_cat_id,
    'debit', 0,
    'credit', NEW.amount,
    'description', NEW.description,
    'contact_id', v_tenant_id
  );

  v_journal_id := public.post_to_ledger(
    'CHARGE',
    NEW.id,
    NEW.due_date,
    NEW.description,
    NULL,
    NULL,
    v_lines
  );

  IF NEW.journal_entry_id IS DISTINCT FROM v_journal_id THEN
    IF NEW.journal_entry_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.id = NEW.journal_entry_id
          AND (
            je.source_type IS DISTINCT FROM 'CHARGE'
            OR je.source_id IS DISTINCT FROM NEW.id
          )
      ) INTO v_keep_existing_link;
    END IF;

    IF NOT v_keep_existing_link THEN
      PERFORM set_config('fluxen.skip_charge_posting', '1', true);
      UPDATE public.tenant_charges
      SET journal_entry_id = v_journal_id
      WHERE id = NEW.id;
      PERFORM set_config('fluxen.skip_charge_posting', '0', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- (د) قيد الفترة: ترقيم بلا سقف إجمالي على الدفعة
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_journal_entries_for_period(
  p_start_date date,
  p_end_date date,
  p_status text DEFAULT 'POSTED',
  p_limit integer DEFAULT 5000,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.journal_entries_with_totals
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  RETURN QUERY
  SELECT je.*
  FROM public.journal_entries_with_totals je
  WHERE
    je.entry_date >= p_start_date
    AND je.entry_date <= p_end_date
    AND (
      p_status IS NULL
      OR btrim(p_status) = ''
      OR btrim(p_status) = 'ALL'
      OR je.status::text = p_status
    )
  ORDER BY je.entry_date ASC, je.number ASC
  LIMIT GREATEST(1, COALESCE(NULLIF(p_limit, 0), 5000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

DROP FUNCTION IF EXISTS public.get_journal_lines_for_period(date, date, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_journal_lines_for_period(
  p_start_date date,
  p_end_date date,
  p_status text DEFAULT 'POSTED',
  p_category_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  journal_id uuid,
  journal_number bigint,
  entry_date date,
  journal_reference text,
  journal_description text,
  journal_status text,
  line_id uuid,
  category_id uuid,
  category_code text,
  category_name text,
  category_type text,
  debit numeric,
  credit numeric,
  description text,
  sort_order integer,
  cashbox_id uuid,
  cashbox_name_ar text,
  cashbox_code text,
  cashbox_kind text,
  contact_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;

  RETURN QUERY
  WITH period_journals AS (
    SELECT je.id
    FROM public.journal_entries je
    WHERE je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND (
        p_status IS NULL
        OR btrim(p_status) = ''
        OR btrim(p_status) = 'ALL'
        OR je.status::text = p_status
      )
      AND (
        p_category_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.journal_lines jl0
          WHERE jl0.journal_id = je.id
            AND jl0.category_id = p_category_id
        )
      )
  )
  SELECT
    je.id AS journal_id,
    je.number AS journal_number,
    je.entry_date,
    je.reference AS journal_reference,
    je.description AS journal_description,
    je.status::text AS journal_status,
    jl.id AS line_id,
    jl.category_id,
    ac.code AS category_code,
    ac.name_ar AS category_name,
    ac.type::text AS category_type,
    jl.debit,
    jl.credit,
    jl.description,
    jl.sort_order,
    jl.cashbox_id,
    cb.name_ar AS cashbox_name_ar,
    cb.code AS cashbox_code,
    cb.kind::text AS cashbox_kind,
    c.name AS contact_name
  FROM period_journals pj
  JOIN public.journal_entries je ON je.id = pj.id
  JOIN public.journal_lines jl ON jl.journal_id = je.id
  JOIN public.categories ac ON ac.id = jl.category_id
  LEFT JOIN public.cashboxes cb ON cb.id = jl.cashbox_id
  LEFT JOIN public.contacts c ON c.id = jl.contact_id
  ORDER BY je.entry_date ASC, je.number ASC, jl.sort_order ASC
  LIMIT GREATEST(1, COALESCE(NULLIF(p_limit, 0), 5000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_entries_for_period(date, date, text, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date, date, text, uuid, integer, integer)
  TO authenticated;

-- توافق: استدعاء قديم بـ 5 وسائط (بدون offset)
CREATE OR REPLACE FUNCTION public.get_journal_lines_for_period(
  p_start_date date,
  p_end_date date,
  p_status text DEFAULT 'POSTED',
  p_category_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  journal_id uuid,
  journal_number bigint,
  entry_date date,
  journal_reference text,
  journal_description text,
  journal_status text,
  line_id uuid,
  category_id uuid,
  category_code text,
  category_name text,
  category_type text,
  debit numeric,
  credit numeric,
  description text,
  sort_order integer,
  cashbox_id uuid,
  cashbox_name_ar text,
  cashbox_code text,
  cashbox_kind text,
  contact_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.get_journal_lines_for_period(
    p_start_date, p_end_date, p_status, p_category_id, p_limit, 0
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_journal_lines_for_period(date, date, text, uuid, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';