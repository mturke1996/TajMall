-- ============================================================
-- Migration 056: أشهر إيجار بدون مطالبة (من بروفايل المستأجر)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_rent_exempt_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT tenant_rent_exempt_months_month_key_chk
    CHECK (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT tenant_rent_exempt_months_unique UNIQUE (tenant_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_rent_exempt_months_tenant
  ON public.tenant_rent_exempt_months (tenant_id);

ALTER TABLE public.tenant_rent_exempt_months ENABLE ROW LEVEL SECURITY;

SELECT public.apply_strict_rbac_policies('tenant_rent_exempt_months');

-- ── تاريخ بداية المطالبة (أقدم عقد نشط أو contract_start) ──
CREATE OR REPLACE FUNCTION public.tenant_rent_claim_start(p_tenant_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT MIN(lc.start_date)
      FROM public.lease_contracts lc
      WHERE lc.tenant_id = p_tenant_id
        AND lc.status = 'ACTIVE'
    ),
    (
      SELECT c.contract_start
      FROM public.contacts c
      WHERE c.id = p_tenant_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_rent_month_exempt(
  p_tenant_id uuid,
  p_month_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_start date;
  v_due date;
BEGIN
  IF p_month_key IS NULL OR p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_rent_exempt_months em
    WHERE em.tenant_id = p_tenant_id
      AND em.month_key = p_month_key
  ) THEN
    RETURN true;
  END IF;

  v_claim_start := public.tenant_rent_claim_start(p_tenant_id);
  IF v_claim_start IS NULL THEN
    RETURN false;
  END IF;

  v_due := (p_month_key || '-01')::date;
  RETURN v_due < DATE_TRUNC('month', v_claim_start)::date;
END;
$$;

-- ── تعيين / إلغاء أشهر بدون مطالبة ──
CREATE OR REPLACE FUNCTION public.set_tenant_rent_exempt_months(
  p_tenant_id uuid,
  p_months text[],
  p_exempt boolean DEFAULT true,
  p_claim_start date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_due date;
  v_claim_start date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'معرّف المستأجر مطلوب';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_tenant_id AND c.kind = 'TENANT'
  ) THEN
    RAISE EXCEPTION 'المستأجر غير موجود';
  END IF;

  v_claim_start := COALESCE(p_claim_start, public.tenant_rent_claim_start(p_tenant_id));

  IF p_claim_start IS NOT NULL THEN
    UPDATE public.contacts
    SET contract_start = p_claim_start
    WHERE id = p_tenant_id;

    UPDATE public.lease_contracts lc
    SET start_date = p_claim_start
    WHERE lc.tenant_id = p_tenant_id
      AND lc.status = 'ACTIVE'
      AND lc.start_date > p_claim_start;
  END IF;

  IF p_months IS NULL OR array_length(p_months, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claim_start', v_claim_start,
      'months', '[]'::jsonb
    );
  END IF;

  FOREACH v_month IN ARRAY p_months LOOP
    IF v_month IS NULL OR v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      CONTINUE;
    END IF;

    v_due := (v_month || '-01')::date;

    IF p_exempt THEN
      INSERT INTO public.tenant_rent_exempt_months (tenant_id, month_key, source, notes)
      VALUES (p_tenant_id, v_month, 'manual', 'بدون مطالبة من بروفايل المستأجر')
      ON CONFLICT (tenant_id, month_key) DO NOTHING;

      DELETE FROM public.tenant_rent_journal_links trjl
      USING public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE trjl.charge_id = tc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
        AND tc.status IN ('UNPAID', 'PARTIAL');

      DELETE FROM public.tenant_charges tc
      USING public.lease_contracts lc
      WHERE tc.contract_id = lc.id
        AND lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
        AND tc.status IN ('UNPAID', 'PARTIAL');
    ELSE
      DELETE FROM public.tenant_rent_exempt_months em
      WHERE em.tenant_id = p_tenant_id
        AND em.month_key = v_month
        AND em.source = 'manual';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'claim_start', COALESCE(p_claim_start, public.tenant_rent_claim_start(p_tenant_id)),
    'months', to_jsonb(p_months)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_rent_claim_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_rent_month_exempt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_rent_exempt_months(uuid, text[], boolean, date) TO authenticated;

-- ── منع إنشاء مطالبات لأشهر معفاة ──
CREATE OR REPLACE FUNCTION public.ensure_tenant_rent_charges(
  p_tenant_id uuid,
  p_months text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_month text;
  v_due date;
  v_charge_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_existing uuid;
  v_rent_amount numeric;
BEGIN
  v_contract_id := public.ensure_tenant_lease_contract(p_tenant_id);

  SELECT COALESCE(NULLIF(lc.monthly_rent, 0), NULLIF(c.monthly_rent, 0), 1)
  INTO v_rent_amount
  FROM public.lease_contracts lc
  JOIN public.contacts c ON c.id = lc.tenant_id
  WHERE lc.id = v_contract_id;

  FOREACH v_month IN ARRAY p_months LOOP
    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month) THEN
      CONTINUE;
    END IF;

    v_due := (v_month || '-01')::date;

    SELECT tc.id INTO v_existing
    FROM public.tenant_charges tc
    WHERE tc.contract_id = v_contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_charge_id := v_existing;
    ELSE
      INSERT INTO public.tenant_charges (
        contract_id, amount, due_date, type, description, status, total_paid
      ) VALUES (
        v_contract_id,
        v_rent_amount,
        v_due,
        'RENT',
        'إيجار شهر ' || v_month,
        'UNPAID',
        0
      )
      RETURNING id INTO v_charge_id;
    END IF;

    v_created := v_created || jsonb_build_array(
      jsonb_build_object('month', v_month, 'charge_id', v_charge_id)
    );
  END LOOP;

  RETURN jsonb_build_object('charges', v_created, 'contract_id', v_contract_id);
END;
$$;

-- ── تقويم الإيجار: حالة exempt ──
CREATE OR REPLACE FUNCTION public.get_tenant_rent_calendar(
  p_tenant_id uuid,
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly numeric;
  v_contract_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_m int;
  v_month_key text;
  v_due date;
  v_charge_id uuid;
  v_charge_status text;
  v_status text;
  v_paid numeric;
  v_amount numeric;
  v_desc text;
BEGIN
  SELECT c.monthly_rent INTO v_monthly
  FROM public.contacts c
  WHERE c.id = p_tenant_id AND c.kind = 'TENANT';

  SELECT lc.id INTO v_contract_id
  FROM public.lease_contracts lc
  WHERE lc.tenant_id = p_tenant_id AND lc.status = 'ACTIVE'
  ORDER BY lc.start_date DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    SELECT lc.id INTO v_contract_id
    FROM public.lease_contracts lc
    WHERE lc.tenant_id = p_tenant_id
    ORDER BY lc.start_date DESC
    LIMIT 1;
  END IF;

  FOR v_m IN 1..12 LOOP
    v_month_key := p_year::text || '-' || LPAD(v_m::text, 2, '0');
    v_due := (v_month_key || '-01')::date;

    v_charge_id := NULL;
    v_desc := NULL;
    v_charge_status := NULL;
    v_amount := NULL;
    v_paid := NULL;

    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month_key) THEN
      v_status := 'exempt';
      v_amount := COALESCE(v_monthly, 0);
      v_paid := 0;
      v_charge_id := NULL;
    ELSE
      SELECT tc.id, tc.status, tc.amount, tc.total_paid, tc.description
      INTO v_charge_id, v_charge_status, v_amount, v_paid, v_desc
      FROM public.tenant_charges tc
      INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
      WHERE lc.tenant_id = p_tenant_id
        AND tc.type = 'RENT'
        AND tc.due_date = v_due
      ORDER BY
        CASE
          WHEN tc.status = 'PAID' OR tc.total_paid >= tc.amount THEN 0
          WHEN tc.total_paid > 0 OR tc.status = 'PARTIAL' THEN 1
          ELSE 2
        END,
        tc.total_paid DESC
      LIMIT 1;

      IF v_charge_id IS NOT NULL THEN
        IF v_charge_status = 'PAID' OR v_paid >= v_amount THEN
          v_status := 'paid';
        ELSIF v_paid > 0 OR v_charge_status = 'PARTIAL' THEN
          v_status := 'partial';
        ELSE
          v_status := 'unpaid';
        END IF;
      ELSIF v_monthly IS NOT NULL AND v_monthly > 0 AND v_contract_id IS NOT NULL THEN
        v_status := 'no_charge';
        v_amount := v_monthly;
        v_paid := 0;
        v_charge_id := NULL;
      ELSE
        v_status := 'na';
        v_amount := 0;
        v_paid := 0;
        v_charge_id := NULL;
      END IF;
    END IF;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'month', v_month_key,
        'status', v_status,
        'amount', COALESCE(v_amount, 0),
        'paid', COALESCE(v_paid, 0),
        'charge_id', v_charge_id,
        'description', v_desc
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'year', p_year,
    'tenant_id', p_tenant_id,
    'monthly_rent', COALESCE(v_monthly, 0),
    'contract_id', v_contract_id,
    'claim_start', public.tenant_rent_claim_start(p_tenant_id),
    'months', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_rent_calendar(uuid, int) TO authenticated;

-- ── ملخص المستأجر: استبعاد الأشهر المعفاة من المطالبات المفتوحة ──
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
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM')) THEN 'no_rent_set'
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
  COALESCE(open_ar.open_count, 0)::int AS open_charges_count,
  public.tenant_rent_claim_start(c.id) AS rent_claim_start
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
    AND NOT public.is_tenant_rent_month_exempt(
      c.id,
      to_char(tc.due_date, 'YYYY-MM')
    )
) open_ar ON TRUE
WHERE c.kind = 'TENANT' AND c.is_active = true;

GRANT SELECT ON public.tenant_rent_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
