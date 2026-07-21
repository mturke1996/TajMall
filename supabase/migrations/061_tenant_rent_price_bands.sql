-- ============================================================
-- Migration 061: جدول أسعار إيجار متغيرة حسب الشهور
-- مثال: أول 3 أشهر 1000 · ثم 1500 · ثم انخفاض لاحقاً
-- السعر الافتراضي (contacts/lease_contracts.monthly_rent) يبقى احتياطياً
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_rent_price_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  from_month text NOT NULL,
  to_month text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT tenant_rent_price_bands_from_chk
    CHECK (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT tenant_rent_price_bands_to_chk
    CHECK (to_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT tenant_rent_price_bands_range_chk
    CHECK (from_month <= to_month)
);

CREATE INDEX IF NOT EXISTS idx_tenant_rent_price_bands_tenant
  ON public.tenant_rent_price_bands (tenant_id, from_month, to_month);

ALTER TABLE public.tenant_rent_price_bands ENABLE ROW LEVEL SECURITY;

SELECT public.apply_strict_rbac_policies('tenant_rent_price_bands');

-- ── حل مبلغ الإيجار لشهر محدد ──
CREATE OR REPLACE FUNCTION public.resolve_tenant_rent_amount(
  p_tenant_id uuid,
  p_month_key text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
BEGIN
  IF p_tenant_id IS NULL
     OR p_month_key IS NULL
     OR p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RETURN 0;
  END IF;

  SELECT b.amount INTO v_amount
  FROM public.tenant_rent_price_bands b
  WHERE b.tenant_id = p_tenant_id
    AND p_month_key >= b.from_month
    AND p_month_key <= b.to_month
  ORDER BY b.from_month DESC
  LIMIT 1;

  IF v_amount IS NOT NULL AND v_amount > 0 THEN
    RETURN v_amount;
  END IF;

  SELECT COALESCE(NULLIF(lc.monthly_rent, 0), NULLIF(c.monthly_rent, 0), 0)
  INTO v_amount
  FROM public.contacts c
  LEFT JOIN LATERAL (
    SELECT lc2.monthly_rent
    FROM public.lease_contracts lc2
    WHERE lc2.tenant_id = c.id
      AND lc2.status = 'ACTIVE'
    ORDER BY lc2.start_date DESC
    LIMIT 1
  ) lc ON TRUE
  WHERE c.id = p_tenant_id;

  RETURN COALESCE(v_amount, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_rent_amount(uuid, text) TO authenticated;

-- ── مزامنة مطالبات غير المدفوعة مع الجدول ──
CREATE OR REPLACE FUNCTION public.sync_unpaid_rent_charges_to_schedule(
  p_tenant_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  r record;
  v_new numeric;
BEGIN
  FOR r IN
    SELECT tc.id, to_char(tc.due_date, 'YYYY-MM') AS month_key
    FROM public.tenant_charges tc
    INNER JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = p_tenant_id
      AND tc.type = 'RENT'
      AND tc.status = 'UNPAID'
      AND COALESCE(tc.total_paid, 0) = 0
  LOOP
    IF public.is_tenant_rent_month_exempt(p_tenant_id, r.month_key) THEN
      CONTINUE;
    END IF;
    v_new := public.resolve_tenant_rent_amount(p_tenant_id, r.month_key);
    IF v_new > 0 THEN
      UPDATE public.tenant_charges
      SET amount = v_new,
          description = 'إيجار شهر ' || r.month_key
      WHERE id = r.id
        AND amount IS DISTINCT FROM v_new;
      IF FOUND THEN
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_unpaid_rent_charges_to_schedule(uuid) TO authenticated;

-- ── استبدال جدول الأسعار بالكامل ──
CREATE OR REPLACE FUNCTION public.set_tenant_rent_price_bands(
  p_tenant_id uuid,
  p_bands jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_band jsonb;
  v_from text;
  v_to text;
  v_amount numeric;
  v_notes text;
  v_sorted jsonb;
  v_prev_to text := NULL;
  v_i int;
  v_updated int;
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

  IF p_bands IS NULL THEN
    p_bands := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_bands) <> 'array' THEN
    RAISE EXCEPTION 'صيغة الجدول غير صحيحة';
  END IF;

  -- ترتيب والتحقق من التداخل
  SELECT COALESCE(jsonb_agg(elem ORDER BY elem->>'from_month'), '[]'::jsonb)
  INTO v_sorted
  FROM jsonb_array_elements(p_bands) elem;

  FOR v_i IN 0 .. GREATEST(jsonb_array_length(v_sorted) - 1, -1) LOOP
    v_band := v_sorted -> v_i;
    v_from := NULLIF(trim(v_band->>'from_month'), '');
    v_to := NULLIF(trim(COALESCE(v_band->>'to_month', v_band->>'from_month')), '');
    v_amount := NULLIF(v_band->>'amount', '')::numeric;

    IF v_from IS NULL OR v_from !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'شهر البداية غير صالح: %', v_from;
    END IF;
    IF v_to IS NULL OR v_to !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'شهر النهاية غير صالح: %', v_to;
    END IF;
    IF v_from > v_to THEN
      RAISE EXCEPTION 'شهر البداية بعد النهاية: % → %', v_from, v_to;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
    END IF;
    IF v_prev_to IS NOT NULL AND v_from <= v_prev_to THEN
      RAISE EXCEPTION 'تداخل في الشهور بين النطاقات (% ≤ %)', v_from, v_prev_to;
    END IF;
    v_prev_to := v_to;
  END LOOP;

  DELETE FROM public.tenant_rent_price_bands WHERE tenant_id = p_tenant_id;

  FOR v_i IN 0 .. GREATEST(jsonb_array_length(v_sorted) - 1, -1) LOOP
    v_band := v_sorted -> v_i;
    v_from := trim(v_band->>'from_month');
    v_to := trim(COALESCE(v_band->>'to_month', v_band->>'from_month'));
    v_amount := (v_band->>'amount')::numeric;
    v_notes := NULLIF(trim(v_band->>'notes'), '');

    INSERT INTO public.tenant_rent_price_bands (
      tenant_id, from_month, to_month, amount, notes, created_by
    ) VALUES (
      p_tenant_id, v_from, v_to, v_amount, v_notes, auth.uid()
    );
  END LOOP;

  v_updated := public.sync_unpaid_rent_charges_to_schedule(p_tenant_id);

  RETURN jsonb_build_object(
    'ok', true,
    'bands_count', jsonb_array_length(v_sorted),
    'unpaid_charges_updated', v_updated,
    'bands', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'from_month', b.from_month,
        'to_month', b.to_month,
        'amount', b.amount,
        'notes', b.notes
      ) ORDER BY b.from_month), '[]'::jsonb)
      FROM public.tenant_rent_price_bands b
      WHERE b.tenant_id = p_tenant_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_rent_price_bands(uuid, jsonb) TO authenticated;

-- ── إنشاء المطالبات بالمبلغ المحلول لكل شهر ──
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

  FOREACH v_month IN ARRAY p_months LOOP
    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month) THEN
      CONTINUE;
    END IF;

    v_due := (v_month || '-01')::date;
    v_rent_amount := public.resolve_tenant_rent_amount(p_tenant_id, v_month);
    IF v_rent_amount IS NULL OR v_rent_amount <= 0 THEN
      v_rent_amount := 1;
    END IF;

    SELECT tc.id INTO v_existing
    FROM public.tenant_charges tc
    WHERE tc.contract_id = v_contract_id
      AND tc.type = 'RENT'
      AND tc.due_date = v_due
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_charge_id := v_existing;
      -- حدّث المبلغ فقط إذا كانت المطالبة غير مدفوعة بالكامل
      UPDATE public.tenant_charges
      SET amount = v_rent_amount,
          description = 'إيجار شهر ' || v_month
      WHERE id = v_existing
        AND status = 'UNPAID'
        AND COALESCE(total_paid, 0) = 0
        AND amount IS DISTINCT FROM v_rent_amount;
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
      jsonb_build_object(
        'month', v_month,
        'charge_id', v_charge_id,
        'amount', v_rent_amount
      )
    );
  END LOOP;

  RETURN jsonb_build_object('charges', v_created, 'contract_id', v_contract_id);
END;
$$;

-- ── تقويم الإيجار يستخدم السعر المحلول ──
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
  v_resolved numeric;
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
    v_resolved := public.resolve_tenant_rent_amount(p_tenant_id, v_month_key);

    v_charge_id := NULL;
    v_desc := NULL;
    v_charge_status := NULL;
    v_amount := NULL;
    v_paid := NULL;

    IF public.is_tenant_rent_month_exempt(p_tenant_id, v_month_key) THEN
      v_status := 'exempt';
      v_amount := 0;
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
      ELSIF v_resolved > 0 AND v_contract_id IS NOT NULL THEN
        v_status := 'no_charge';
        v_amount := v_resolved;
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
        'description', v_desc,
        'scheduled_amount', v_resolved
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

-- ── الملخصات: COALESCE(charge, schedule, monthly_rent) ──
CREATE OR REPLACE FUNCTION public.tenant_rent_summary_for_month(p_month_key text)
RETURNS TABLE (
  id uuid,
  name text,
  shop_number text,
  floor text,
  monthly_rent numeric,
  phone text,
  current_month_key text,
  current_month_amount numeric,
  current_month_paid numeric,
  current_month_status text,
  total_rent_paid numeric,
  rent_linked_journals_count int,
  journal_entries_count int,
  last_12_months_revenue numeric,
  total_balance numeric,
  open_charges_total numeric,
  open_charges_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.shop_number,
    c.floor,
    c.monthly_rent,
    c.phone,
    p_month_key AS current_month_key,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 0::numeric
      ELSE COALESCE(
        cur.month_amount,
        public.resolve_tenant_rent_amount(c.id, p_month_key),
        c.monthly_rent,
        0
      )
    END AS current_month_amount,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 0::numeric
      ELSE COALESCE(cur.paid, 0)
    END AS current_month_paid,
    CASE
      WHEN public.is_tenant_rent_month_exempt(c.id, p_month_key) THEN 'exempt'
      WHEN COALESCE(
        cur.month_amount,
        public.resolve_tenant_rent_amount(c.id, p_month_key),
        c.monthly_rent,
        0
      ) <= 0 THEN 'no_rent_set'
      WHEN cur.charge_status = 'PAID'
        OR (
          COALESCE(cur.month_amount, public.resolve_tenant_rent_amount(c.id, p_month_key), c.monthly_rent, 0) > 0
          AND COALESCE(cur.paid, 0) >= COALESCE(
            cur.month_amount,
            public.resolve_tenant_rent_amount(c.id, p_month_key),
            c.monthly_rent,
            0
          )
        )
        THEN 'paid_full'
      WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
      WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
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
      AND to_char(tc.due_date, 'YYYY-MM') = p_month_key
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
$$;

GRANT EXECUTE ON FUNCTION public.tenant_rent_summary_for_month(text) TO authenticated;

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
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM'))
      THEN 0::numeric
    ELSE COALESCE(
      cur.month_amount,
      public.resolve_tenant_rent_amount(c.id, to_char(CURRENT_DATE, 'YYYY-MM')),
      c.monthly_rent,
      0
    )
  END AS current_month_amount,
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM'))
      THEN 0::numeric
    ELSE COALESCE(cur.paid, 0)
  END AS current_month_paid,
  CASE
    WHEN public.is_tenant_rent_month_exempt(c.id, to_char(CURRENT_DATE, 'YYYY-MM')) THEN 'exempt'
    WHEN COALESCE(
      cur.month_amount,
      public.resolve_tenant_rent_amount(c.id, to_char(CURRENT_DATE, 'YYYY-MM')),
      c.monthly_rent,
      0
    ) <= 0 THEN 'no_rent_set'
    WHEN cur.charge_status = 'PAID'
      OR (
        COALESCE(cur.month_amount, public.resolve_tenant_rent_amount(c.id, to_char(CURRENT_DATE, 'YYYY-MM')), c.monthly_rent, 0) > 0
        AND COALESCE(cur.paid, 0) >= COALESCE(
          cur.month_amount,
          public.resolve_tenant_rent_amount(c.id, to_char(CURRENT_DATE, 'YYYY-MM')),
          c.monthly_rent,
          0
        )
      )
      THEN 'paid_full'
    WHEN cur.charge_status = 'PARTIAL' OR COALESCE(cur.paid, 0) > 0 THEN 'paid_partial'
    WHEN cur.charge_status IN ('UNPAID', 'OVERDUE') THEN 'unpaid'
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
