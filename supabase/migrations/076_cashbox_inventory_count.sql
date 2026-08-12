-- ============================================================
-- Migration 076: جرد الخزائن — عدّ فعلي + قيد تسوية محمي برقم سري
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_secrets FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cashbox_inventory_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cashbox_inventory_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.cashbox_inventory_runs(id) ON DELETE CASCADE,
  cashbox_id uuid NOT NULL REFERENCES public.cashboxes(id) ON DELETE RESTRICT,
  book_balance numeric(18,3) NOT NULL,
  counted_amount numeric(18,3) NOT NULL,
  difference numeric(18,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashbox_inventory_runs_created_idx
  ON public.cashbox_inventory_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS cashbox_inventory_lines_run_idx
  ON public.cashbox_inventory_lines (run_id);

ALTER TABLE public.cashbox_inventory_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashbox_inventory_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashbox_inventory_runs_select ON public.cashbox_inventory_runs;
CREATE POLICY cashbox_inventory_runs_select
  ON public.cashbox_inventory_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cashbox_inventory_lines_select ON public.cashbox_inventory_lines;
CREATE POLICY cashbox_inventory_lines_select
  ON public.cashbox_inventory_lines FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.cashbox_inventory_runs TO authenticated;
GRANT SELECT ON public.cashbox_inventory_lines TO authenticated;

INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order, active)
SELECT 'EXP-CSHADJ', 'Cash count shortage', 'عجز جرد خزائن',
  'ADJUSTMENT'::tx_kind, 'EXPENSE'::account_type, '#B42318', 910, true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE code = 'EXP-CSHADJ');

INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order, active)
SELECT 'REV-CSHADJ', 'Cash count surplus', 'فائض جرد خزائن',
  'ADJUSTMENT'::tx_kind, 'REVENUE'::account_type, '#067647', 911, true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE code = 'REV-CSHADJ');

CREATE OR REPLACE FUNCTION public._assert_inventory_pin_format(p_pin text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'الرقم السري يجب أن يكون 4 إلى 8 أرقام';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cashbox_inventory_pin_is_set()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_secrets WHERE key = 'cashbox_inventory_pin'
  );
$$;

CREATE OR REPLACE FUNCTION public.set_cashbox_inventory_pin(
  p_new_pin text,
  p_current_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  PERFORM public._assert_inventory_pin_format(p_new_pin);

  SELECT hash INTO v_hash
  FROM public.app_secrets
  WHERE key = 'cashbox_inventory_pin';

  IF v_hash IS NULL THEN
    INSERT INTO public.app_secrets (key, hash, updated_by)
    VALUES (
      'cashbox_inventory_pin',
      extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)),
      auth.uid()
    );
  ELSE
    IF p_current_pin IS NULL OR extensions.crypt(p_current_pin, v_hash) IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'الرقم السري الحالي غير صحيح';
    END IF;
    UPDATE public.app_secrets
    SET
      hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE key = 'cashbox_inventory_pin';
  END IF;

  RETURN jsonb_build_object('ok', true, 'has_pin', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_cashbox_inventory(
  p_pin text,
  p_counts jsonb,
  p_notes text DEFAULT NULL,
  p_count_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_item jsonb;
  v_cashbox_id uuid;
  v_counted numeric;
  v_book numeric;
  v_diff numeric;
  v_name text;
  v_cash_cat uuid;
  v_exp_cat uuid;
  v_rev_cat uuid;
  v_lines jsonb := '[]'::jsonb;
  v_run_id uuid;
  v_journal_id uuid;
  v_adjusted int := 0;
  v_net numeric := 0;
  v_desc text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;
  IF NOT public.auth_role_may_write() THEN
    RAISE EXCEPTION 'صلاحية التعديل مطلوبة';
  END IF;

  PERFORM public._assert_inventory_pin_format(p_pin);

  SELECT hash INTO v_hash
  FROM public.app_secrets
  WHERE key = 'cashbox_inventory_pin';

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'اضبط الرقم السري للجرد أولاً من الإعدادات';
  END IF;
  IF extensions.crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'الرقم السري غير صحيح';
  END IF;

  IF p_counts IS NULL OR jsonb_typeof(p_counts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_counts) < 1 THEN
    RAISE EXCEPTION 'أدخل عدّاً لخزينة واحدة على الأقل';
  END IF;

  SELECT id INTO v_cash_cat FROM public.categories WHERE code = 'AST-CSH' LIMIT 1;
  SELECT id INTO v_exp_cat FROM public.categories WHERE code = 'EXP-CSHADJ' LIMIT 1;
  SELECT id INTO v_rev_cat FROM public.categories WHERE code = 'REV-CSHADJ' LIMIT 1;

  IF v_cash_cat IS NULL OR v_exp_cat IS NULL OR v_rev_cat IS NULL THEN
    RAISE EXCEPTION 'حسابات تسوية الجرد غير معرّفة (AST-CSH / EXP-CSHADJ / REV-CSHADJ)';
  END IF;

  INSERT INTO public.cashbox_inventory_runs (run_date, notes, created_by)
  VALUES (COALESCE(p_count_date, CURRENT_DATE), NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid())
  RETURNING id INTO v_run_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_counts)
  LOOP
    BEGIN
      v_cashbox_id := (v_item->>'cashbox_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'معرّف خزينة غير صالح';
    END;

    BEGIN
      v_counted := (v_item->>'counted')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'مبلغ العدّ غير صالح';
    END;

    IF v_counted IS NULL OR v_counted < 0 THEN
      RAISE EXCEPTION 'مبلغ العدّ لا يمكن أن يكون سالباً';
    END IF;

    SELECT c.name_ar, public.get_cashbox_balance(c.id)
    INTO v_name, v_book
    FROM public.cashboxes c
    WHERE c.id = v_cashbox_id AND c.active = true;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'خزينة غير موجودة أو غير نشطة';
    END IF;

    v_book := COALESCE(v_book, 0);
    v_diff := round(v_counted - v_book, 3);

    INSERT INTO public.cashbox_inventory_lines (
      run_id, cashbox_id, book_balance, counted_amount, difference
    ) VALUES (
      v_run_id, v_cashbox_id, v_book, v_counted, v_diff
    );

    IF abs(v_diff) < 0.005 THEN
      CONTINUE;
    END IF;

    v_adjusted := v_adjusted + 1;
    v_net := v_net + v_diff;
    v_desc := 'جرد خزائن — ' || v_name;

    IF v_diff > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_cash_cat,
        'debit', v_diff,
        'credit', 0,
        'description', v_desc || ' · فائض',
        'cashbox_id', v_cashbox_id
      );
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_rev_cat,
        'debit', 0,
        'credit', v_diff,
        'description', v_desc || ' · فائض'
      );
    ELSE
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_exp_cat,
        'debit', abs(v_diff),
        'credit', 0,
        'description', v_desc || ' · عجز'
      );
      v_lines := v_lines || jsonb_build_object(
        'category_id', v_cash_cat,
        'debit', 0,
        'credit', abs(v_diff),
        'description', v_desc || ' · عجز',
        'cashbox_id', v_cashbox_id
      );
    END IF;
  END LOOP;

  IF v_adjusted > 0 THEN
    v_journal_id := public.post_to_ledger(
      'CASHBOX_COUNT',
      v_run_id,
      COALESCE(p_count_date, CURRENT_DATE),
      'جرد خزائن — تسوية العدّ الفعلي',
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      auth.uid(),
      v_lines
    );

    UPDATE public.cashbox_inventory_runs
    SET journal_id = v_journal_id
    WHERE id = v_run_id;
  END IF;

  PERFORM public.write_audit_log(
    'INSERT',
    'cashbox_inventory',
    v_run_id,
    'جرد خزائن',
    CASE
      WHEN v_adjusted = 0 THEN 'جرد خزائن بدون فروقات'
      ELSE 'جرد خزائن: تسوية ' || v_adjusted::text || ' خزينة — صافي ' || v_net::text || ' د.ل'
    END,
    COALESCE(p_count_date, CURRENT_DATE),
    v_net,
    NULL,
    CASE WHEN v_adjusted = 0 THEN 'info' ELSE 'warning' END,
    jsonb_build_object('adjusted', v_adjusted, 'journal_id', v_journal_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'journal_id', v_journal_id,
    'adjusted', v_adjusted,
    'net', v_net
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashbox_inventory_pin_is_set() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashbox_inventory_pin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cashbox_inventory(text, jsonb, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
