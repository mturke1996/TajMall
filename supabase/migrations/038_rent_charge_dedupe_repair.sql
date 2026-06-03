-- دمج مطالبات إيجار مكررة (نفس العقد + نفس الشهر) وإعادة حساب المدفوع

CREATE OR REPLACE FUNCTION public.dedupe_rent_charges_data()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
  v_keeper uuid;
  v_loser uuid;
  v_merged int := 0;
  v_i int;
  v_n int;
BEGIN
  FOR v_group IN
    SELECT
      tc.contract_id,
      to_char(tc.due_date, 'YYYY-MM') AS rent_month,
      array_agg(tc.id ORDER BY tc.total_paid DESC NULLS LAST, tc.created_at ASC) AS charge_ids
    FROM public.tenant_charges tc
    WHERE tc.type = 'RENT'
    GROUP BY tc.contract_id, to_char(tc.due_date, 'YYYY-MM')
    HAVING COUNT(*) > 1
  LOOP
    v_keeper := v_group.charge_ids[1];
    v_n := coalesce(array_length(v_group.charge_ids, 1), 0);

    FOR v_i IN 2..v_n LOOP
      v_loser := v_group.charge_ids[v_i];

      UPDATE public.tenant_rent_journal_links trjl
      SET charge_id = v_keeper
      WHERE trjl.charge_id = v_loser
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_rent_journal_links existing
          WHERE existing.charge_id = v_keeper
            AND existing.journal_entry_id = trjl.journal_entry_id
        );

      DELETE FROM public.tenant_rent_journal_links trjl
      WHERE trjl.charge_id = v_loser;

      UPDATE public.tenant_charge_allocations tca
      SET charge_id = v_keeper
      WHERE tca.charge_id = v_loser
        AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_charge_allocations kept
          WHERE kept.charge_id = v_keeper
            AND kept.transaction_id = tca.transaction_id
        );

      DELETE FROM public.tenant_charge_allocations tca
      WHERE tca.charge_id = v_loser;

      DELETE FROM public.tenant_charges WHERE id = v_loser;
      v_merged := v_merged + 1;
    END LOOP;

    PERFORM public.recalc_tenant_charge_rent_paid(v_keeper);
  END LOOP;

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedupe_rent_charges_data() TO authenticated;

SELECT public.dedupe_rent_charges_data() AS merged_duplicate_rent_charges;

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

NOTIFY pgrst, 'reload schema';
