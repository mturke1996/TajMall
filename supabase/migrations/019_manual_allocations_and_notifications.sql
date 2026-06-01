-- ============================================================
-- Migration 019: Manual charge allocation, notifications, reminders
-- ============================================================

-- 1. Skip auto FIFO when manual allocation is requested
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS auto_allocate_charges boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.auto_allocate_tenant_rent_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining numeric;
  v_charge record;
  v_alloc numeric;
BEGIN
  IF NEW.kind != 'REVENUE' OR NEW.status != 'POSTED' OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.auto_allocate_charges, true) = false THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = NEW.category_id AND code IN ('REV-RNT', 'REV-SRV')
  ) THEN
    RETURN NEW;
  END IF;

  v_remaining := NEW.amount;

  FOR v_charge IN
    SELECT tc.*
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = NEW.contact_id
      AND tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid
    ORDER BY tc.due_date ASC, tc.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_alloc := LEAST(v_remaining, v_charge.amount - v_charge.total_paid);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.tenant_charge_allocations (charge_id, transaction_id, amount)
    VALUES (v_charge.id, NEW.id, v_alloc);

    UPDATE public.tenant_charges
    SET
      total_paid = total_paid + v_alloc,
      status = CASE
        WHEN total_paid + v_alloc >= amount THEN 'PAID'
        WHEN total_paid + v_alloc > 0 THEN 'PARTIAL'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_charge.id;

    v_remaining := v_remaining - v_alloc;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Manual allocation RPC (after transaction insert with auto_allocate_charges = false)
CREATE OR REPLACE FUNCTION public.apply_charge_allocations(
  p_transaction_id uuid,
  p_allocations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx record;
  v_item jsonb;
  v_charge record;
  v_alloc numeric;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المعاملة غير موجودة';
  END IF;

  IF v_tx.status != 'POSTED' THEN
    RAISE EXCEPTION 'المعاملة غير مرحّلة';
  END IF;

  IF v_tx.contact_id IS NULL THEN
    RAISE EXCEPTION 'المعاملة غير مرتبطة بمستأجر';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_charge_allocations
    WHERE transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'تم تخصيص هذه المعاملة مسبقاً';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_alloc := COALESCE((v_item->>'amount')::numeric, 0);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    v_total := v_total + v_alloc;

    SELECT tc.* INTO v_charge
    FROM public.tenant_charges tc
    JOIN public.lease_contracts lc ON lc.id = tc.contract_id
    WHERE tc.id = (v_item->>'charge_id')::uuid
      AND lc.tenant_id = v_tx.contact_id
      AND tc.status IN ('UNPAID', 'PARTIAL')
      AND tc.amount > tc.total_paid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'مطالبة غير صالحة أو مغلقة للمستأجر';
    END IF;

    IF (v_charge.amount - v_charge.total_paid) < v_alloc THEN
      RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على المطالبة';
    END IF;

    INSERT INTO public.tenant_charge_allocations (charge_id, transaction_id, amount)
    VALUES (v_charge.id, p_transaction_id, v_alloc);

    UPDATE public.tenant_charges
    SET
      total_paid = total_paid + v_alloc,
      status = CASE
        WHEN total_paid + v_alloc >= amount THEN 'PAID'
        WHEN total_paid + v_alloc > 0 THEN 'PARTIAL'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_charge.id;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'يجب تخصيص مبلغ واحد على الأقل';
  END IF;

  IF v_total > v_tx.amount THEN
    RAISE EXCEPTION 'مجموع التخصيص يتجاوز مبلغ المعاملة';
  END IF;
END;
$$;

-- 3. In-app notifications (reminders for overdue charges, etc.)
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'SYSTEM',
  title_ar    text NOT NULL,
  body_ar     text,
  href        text,
  severity    text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'danger', 'success')),
  entity_type text,
  entity_id   uuid,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_unread
  ON public.app_notifications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_notifications_entity
  ON public.app_notifications (entity_type, entity_id);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth select app_notifications" ON public.app_notifications;
DROP POLICY IF EXISTS "auth insert app_notifications" ON public.app_notifications;
DROP POLICY IF EXISTS "auth update app_notifications" ON public.app_notifications;

CREATE POLICY "auth select app_notifications"
  ON public.app_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert app_notifications"
  ON public.app_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update app_notifications"
  ON public.app_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4. Generate reminders for overdue tenant charges (dedupe unread per charge)
CREATE OR REPLACE FUNCTION public.sync_overdue_charge_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_created int;
BEGIN
  INSERT INTO public.app_notifications (kind, title_ar, body_ar, href, severity, entity_type, entity_id)
  SELECT
    'OVERDUE_CHARGE',
    'مطالبة متأخرة — ' || c.name,
    tc.description || ' · مستحق ' || to_char(tc.due_date, 'YYYY-MM-DD')
      || ' · متبقي ' || (tc.amount - tc.total_paid)::text || ' د.ل',
    '/mall?tab=charges',
    CASE
      WHEN tc.due_date < CURRENT_DATE - INTERVAL '60 days' THEN 'danger'
      WHEN tc.due_date < CURRENT_DATE - INTERVAL '30 days' THEN 'warning'
      ELSE 'info'
    END,
    'tenant_charge',
    tc.id
  FROM public.tenant_charges tc
  JOIN public.lease_contracts lc ON lc.id = tc.contract_id
  JOIN public.contacts c ON c.id = lc.tenant_id
  WHERE tc.status IN ('UNPAID', 'PARTIAL')
    AND tc.due_date < CURRENT_DATE
    AND tc.amount > tc.total_paid
    AND NOT EXISTS (
      SELECT 1 FROM public.app_notifications n
      WHERE n.entity_type = 'tenant_charge'
        AND n.entity_id = tc.id
        AND n.is_read = false
    );

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'created', v_created,
    'synced_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_charge_allocations TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_overdue_charge_notifications TO authenticated;

NOTIFY pgrst, 'reload schema';
