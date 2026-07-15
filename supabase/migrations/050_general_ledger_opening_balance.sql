-- ============================================================
-- Migration 050: دفتر الأستاذ — رصيد افتتاحي + بنود الكشف
-- ============================================================
-- المشكلة: get_general_ledger_lines كان يرجع صفوفاً فقط لحركات النطاق
-- المحدد، فيبدأ الرصيد التراكمي من 0 (يتجاهل كل ما قبل تاريخ البداية).
-- الحل: إعادة تعريف الدالة لترجع كائن JSON يحوي:
--   * opening_debit / opening_credit : مجموع حركات ما قبل p_start_date
--   * lines[] : حركات النطاق المحدد (كما كانت)
-- فيستطيع دفتر الأستاذ عرض "رصيد مرحّل" افتتاحي ثم الرصيد التراكمي بعدها،
-- وحتى عند انعدام حركات النطاق يظهر الرصيد الافتتاحي/الختامي.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_general_ledger_lines(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_general_ledger_lines(
  p_category_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'opening_debit',
      COALESCE((
        SELECT SUM(jl.debit)
        FROM public.journal_lines jl
        INNER JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.category_id = p_category_id
          AND je.status::text = 'POSTED'
          AND (p_start_date IS NULL OR je.entry_date < p_start_date)
      ), 0),
    'opening_credit',
      COALESCE((
        SELECT SUM(jl.credit)
        FROM public.journal_lines jl
        INNER JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.category_id = p_category_id
          AND je.status::text = 'POSTED'
          AND (p_start_date IS NULL OR je.entry_date < p_start_date)
      ), 0),
    'lines',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'debit', jl.debit,
            'credit', jl.credit,
            'line_description', jl.description,
            'entry_date', je.entry_date,
            'journal_number', je.number,
            'journal_reference', je.reference,
            'journal_id', je.id
          )
          ORDER BY je.entry_date ASC, je.number ASC, jl.sort_order ASC
        )
        FROM public.journal_lines jl
        INNER JOIN public.journal_entries je ON je.id = jl.journal_id
        WHERE jl.category_id = p_category_id
          AND je.status::text = 'POSTED'
          AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
          AND (p_end_date IS NULL OR je.entry_date <= p_end_date)
      ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_general_ledger_lines(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
