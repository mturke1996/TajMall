-- ============================================================
-- Migration 067: expose cashbox kind on journal_lines_with_categories
-- ============================================================

DROP VIEW IF EXISTS public.journal_lines_with_categories;
CREATE VIEW public.journal_lines_with_categories AS
SELECT
  jl.id,
  jl.journal_id,
  jl.category_id,
  jl.debit,
  jl.credit,
  jl.description,
  jl.sort_order,
  ac.code AS category_code,
  ac.name_ar AS category_name,
  ac.type AS category_type,
  ac.kind AS category_kind,
  ac.color AS category_color,
  jl.contact_id,
  c.name AS contact_name,
  c.kind AS contact_kind,
  c.shop_number AS contact_shop_number,
  jl.cashbox_id,
  cb.name_ar AS cashbox_name_ar,
  cb.code AS cashbox_code,
  cb.kind AS cashbox_kind
FROM public.journal_lines jl
JOIN public.categories ac ON ac.id = jl.category_id
LEFT JOIN public.contacts c ON c.id = jl.contact_id
LEFT JOIN public.cashboxes cb ON cb.id = jl.cashbox_id;

GRANT SELECT ON public.journal_lines_with_categories TO authenticated;
