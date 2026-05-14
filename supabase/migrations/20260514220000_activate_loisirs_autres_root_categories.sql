-- Racines Loisirs & Sports + Autres (publication mobile/web).
-- Alimentation existe déjà (id 48, slug alimentation).

INSERT INTO public.categories (id, slug, name, parent_id, level, icon)
VALUES
  (54, 'loisirs-sports', 'Loisirs & Sports', NULL, 1, NULL),
  (55, 'autres', 'Autres', NULL, 1, NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.categories', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.categories), 55)
);
