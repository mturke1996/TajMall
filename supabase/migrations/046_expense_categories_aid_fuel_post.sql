-- ============================================================
-- Seed: aid/charity, fuel/oils, postage expense categories
-- ============================================================

INSERT INTO public.categories (code, name, name_ar, kind, type, color, sort_order) VALUES
  ('EXP-AID', 'Aid & charity',   'م.مساعدات وصداقات', 'EXPENSE', 'EXPENSE', '#6B4E3D', 27),
  ('EXP-FUL', 'Fuel & oils',     'م.وقود وزيوت',       'EXPENSE', 'EXPENSE', '#8B6914', 28),
  ('EXP-POS', 'Postage & mail',  'م.بريد',              'EXPENSE', 'EXPENSE', '#3D5A6B', 29)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  name_ar = EXCLUDED.name_ar,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();
