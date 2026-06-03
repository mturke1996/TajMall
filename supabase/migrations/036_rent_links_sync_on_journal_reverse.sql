-- عند عكس أو حذف قيد الإيجار: إزالة الربط وإعادة حساب مطالبة الشهر
-- يصلح حالات مثل مايو يظهر «جزئي» بعد حذف/عكس القيد بالخطأ

CREATE OR REPLACE FUNCTION public.recalc_tenant_charge_rent_paid(p_charge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_paid numeric;
  v_due date;
  v_month text;
  v_primary_je uuid;
  v_je_number int;
  v_je_desc text;
  v_desc text;
BEGIN
  SELECT tc.amount, tc.due_date
  INTO v_amount, v_due
  FROM public.tenant_charges tc
  WHERE tc.id = p_charge_id AND tc.type = 'RENT';

  IF v_amount IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(trjl.amount), 0)
  INTO v_paid
  FROM public.tenant_rent_journal_links trjl
  INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
  WHERE trjl.charge_id = p_charge_id
    AND je.status IN ('POSTED', 'DRAFT');

  v_paid := LEAST(GREATEST(COALESCE(v_paid, 0), 0), v_amount);
  v_month := to_char(v_due, 'YYYY-MM');

  SELECT trjl.journal_entry_id
  INTO v_primary_je
  FROM public.tenant_rent_journal_links trjl
  INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
  WHERE trjl.charge_id = p_charge_id
    AND je.status IN ('POSTED', 'DRAFT')
  ORDER BY trjl.created_at DESC
  LIMIT 1;

  IF v_paid <= 0 THEN
    v_desc := 'إيجار شهر ' || v_month;
    v_primary_je := NULL;
  ELSIF v_paid >= v_amount THEN
    v_desc := 'إيجار شهر ' || v_month;
    IF v_primary_je IS NOT NULL THEN
      SELECT je.number, je.description
      INTO v_je_number, v_je_desc
      FROM public.journal_entries je
      WHERE je.id = v_primary_je;
      v_desc := v_desc || ' · قيد #' || v_je_number::text
        || COALESCE(' — ' || NULLIF(btrim(v_je_desc), ''), '');
    END IF;
  ELSE
    v_desc := 'إيجار شهر ' || v_month
      || ' · جزئي ' || trim(to_char(v_paid, '999999999990.999'))
      || '/' || trim(to_char(v_amount, '999999999990.999'));
    IF v_primary_je IS NOT NULL THEN
      SELECT je.number, je.description
      INTO v_je_number, v_je_desc
      FROM public.journal_entries je
      WHERE je.id = v_primary_je;
      v_desc := v_desc || ' · قيد #' || v_je_number::text
        || COALESCE(' — ' || NULLIF(btrim(v_je_desc), ''), '');
    END IF;
  END IF;

  PERFORM set_config('fluxen.skip_charge_posting', '1', true);

  UPDATE public.tenant_charges
  SET
    total_paid = v_paid,
    status = CASE
      WHEN v_paid >= v_amount THEN 'PAID'
      WHEN v_paid > 0 THEN 'PARTIAL'
      ELSE 'UNPAID'
    END,
    journal_entry_id = v_primary_je,
    description = v_desc,
    updated_at = now()
  WHERE id = p_charge_id;

  PERFORM set_config('fluxen.skip_charge_posting', '0', true);
END;
$$;

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
  SELECT array_agg(DISTINCT charge_id)
  INTO v_charge_ids
  FROM public.tenant_rent_journal_links
  WHERE journal_entry_id = p_journal_id;

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

CREATE OR REPLACE FUNCTION public.trg_journal_rent_links_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'REVERSED' AND OLD.status IS DISTINCT FROM 'REVERSED' THEN
    PERFORM public.purge_rent_links_for_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_rent_links_on_status ON public.journal_entries;
CREATE TRIGGER journal_rent_links_on_status
  AFTER UPDATE OF status ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_journal_rent_links_on_status();

CREATE OR REPLACE FUNCTION public.trg_rent_link_recalc_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_tenant_charge_rent_paid(OLD.charge_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS rent_link_recalc_charge ON public.tenant_rent_journal_links;
CREATE TRIGGER rent_link_recalc_charge
  AFTER DELETE ON public.tenant_rent_journal_links
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rent_link_recalc_charge();

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original record;
  new_journal_id uuid;
BEGIN
  SELECT * INTO original
  FROM public.journal_entries
  WHERE id = p_journal_id::uuid AND status = 'POSTED';

  IF original IS NULL THEN
    RAISE EXCEPTION 'Posted journal entry not found';
  END IF;

  PERFORM public.purge_rent_links_for_journal(original.id);

  UPDATE public.journal_entries
  SET status = 'REVERSED', reversed_at = now()
  WHERE id = p_journal_id::uuid;

  INSERT INTO public.journal_entries (
    reference,
    entry_date,
    description,
    notes,
    status
  ) VALUES (
    COALESCE(original.reference, '') || ' (Reversal)',
    CURRENT_DATE,
    'Reversal of entry #' || original.number || ': ' || COALESCE(original.description, ''),
    'Auto-generated reversal',
    'POSTED'
  )
  RETURNING id INTO new_journal_id;

  INSERT INTO public.journal_lines (
    journal_id,
    category_id,
    debit,
    credit,
    description,
    sort_order,
    contact_id,
    cashbox_id
  )
  SELECT
    new_journal_id,
    category_id,
    credit AS debit,
    debit AS credit,
    'Reversal: ' || COALESCE(description, ''),
    sort_order,
    contact_id,
    cashbox_id
  FROM public.journal_lines
  WHERE journal_id = p_journal_id::uuid;

  UPDATE public.journal_entries
  SET posted_at = now()
  WHERE id = new_journal_id;

  RETURN new_journal_id::text;
END;
$$;

-- إصلاح البيانات الحالية (مثلاً مايو يظهر جزئياً بعد عكس قيد)
DO $$
DECLARE
  v_charge_id uuid;
BEGIN
  FOR v_charge_id IN
    SELECT id FROM public.tenant_charges WHERE type = 'RENT'
  LOOP
    PERFORM public.recalc_tenant_charge_rent_paid(v_charge_id);
  END LOOP;
END $$;

DROP VIEW IF EXISTS public.tenant_rent_summary;

CREATE VIEW public.tenant_rent_summary AS
SELECT
  c.id,
  c.name,
  c.shop_number,
  c.floor,
  c.monthly_rent,
  c.phone,
  to_char(CURRENT_DATE, 'YYYY-MM') AS current_month_key,
  COALESCE(cur.month_amount, c.monthly_rent, 0) AS current_month_amount,
  COALESCE(cur.paid, 0) AS current_month_paid,
  CASE
    WHEN c.monthly_rent IS NULL OR c.monthly_rent = 0 THEN 'no_rent_set'
    WHEN cur.charge_status = 'PAID'
      OR (COALESCE(cur.month_amount, c.monthly_rent, 0) > 0
        AND COALESCE(cur.paid, 0) >= COALESCE(cur.month_amount, c.monthly_rent, 0))
      THEN 'paid_full'
    WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
    WHEN COALESCE(cur.paid, 0) >= COALESCE(c.monthly_rent, 0) AND COALESCE(c.monthly_rent, 0) > 0
      THEN 'paid_full'
    WHEN COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    ELSE 'unpaid'
  END AS current_month_status,
  COALESCE(rent_paid.total_rent_paid, 0) AS total_rent_paid,
  COALESCE(rent_je.cnt, 0)::int AS rent_linked_journals_count,
  COALESCE(all_je.cnt, 0)::int AS journal_entries_count,
  COALESCE(
    (
      SELECT SUM(t.amount)
      FROM public.transactions t
      INNER JOIN public.categories cat ON cat.id = t.category_id
      WHERE t.contact_id = c.id
        AND t.kind = 'REVENUE'
        AND t.status = 'POSTED'
        AND cat.code LIKE 'REV-RNT%'
        AND t.tx_date >= CURRENT_DATE - INTERVAL '12 months'
    ),
    0
  ) AS last_12_months_revenue,
  (
    COALESCE(
      (
        SELECT SUM(t.amount)
        FROM public.transactions t
        INNER JOIN public.categories cat ON cat.id = t.category_id
        WHERE t.contact_id = c.id
          AND t.kind = 'REVENUE'
          AND t.status = 'POSTED'
          AND cat.code LIKE 'REV-RNT%'
      ),
      0
    )
    - COALESCE(
      (
        SELECT SUM(tc.amount)
        FROM public.tenant_charges tc
        INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
        WHERE lc.tenant_id = c.id
          AND tc.type = 'RENT'
          AND tc.status = 'PAID'
      ),
      0
    )
  ) AS total_balance,
  COALESCE(open_ar.open_total, 0) AS open_charges_total,
  COALESCE(open_ar.open_count, 0)::int AS open_charges_count
FROM public.contacts c
LEFT JOIN LATERAL (
  SELECT
    tc.status AS charge_status,
    tc.total_paid AS paid,
    tc.amount AS month_amount
  FROM public.tenant_charges tc
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = c.id
    AND tc.type = 'RENT'
    AND tc.due_date >= DATE_TRUNC('month', CURRENT_DATE)::date
    AND tc.due_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
  ORDER BY tc.due_date DESC
  LIMIT 1
) cur ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(tc.total_paid) AS total_rent_paid
  FROM public.tenant_charges tc
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = c.id
    AND tc.type = 'RENT'
) rent_paid ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT trjl.journal_entry_id) AS cnt
  FROM public.tenant_rent_journal_links trjl
  INNER JOIN public.tenant_charges tc ON tc.id = trjl.charge_id
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  INNER JOIN public.journal_entries je ON je.id = trjl.journal_entry_id
  WHERE lc.tenant_id = c.id
    AND je.status IN ('POSTED', 'DRAFT')
) rent_je ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT jl.journal_id) AS cnt
  FROM public.journal_lines jl
  INNER JOIN public.journal_entries je ON je.id = jl.journal_id
  WHERE jl.contact_id = c.id
    AND je.status IN ('POSTED', 'DRAFT')
) all_je ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(GREATEST(tc.amount - tc.total_paid, 0)) AS open_total,
    COUNT(*)::int AS open_count
  FROM public.tenant_charges tc
  INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = c.id
    AND tc.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
    AND tc.amount > tc.total_paid
) open_ar ON TRUE
WHERE c.kind = 'TENANT' AND c.is_active = true;

GRANT SELECT ON public.tenant_rent_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_tenant_charge_rent_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rent_links_for_journal(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
