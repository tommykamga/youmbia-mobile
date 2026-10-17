-- Garde greenfield : le dépôt ne contient pas le schéma marketplace de base
-- (categories, profiles, listings, …), créé hors de ce set de migrations.
-- Sur un projet déjà provisionné (staging/prod), ce bloc est un no-op.
-- Ne crée AUCUNE table artificielle — échoue explicitement si la baseline manque.

DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.listings') IS NULL THEN
    RAISE EXCEPTION
      'baseline_schema_missing: public.categories/profiles/listings absents. '
      'Les migrations YOUMBIA du dépôt sont des deltas (ex. 20260514220000 INSERT categories). '
      'Restaurer un dump baseline ou appliquer uniquement le périmètre lifecycle sur PG isolé (Lot 03C). '
      'Ne pas inventer de stubs de tables marketplace.';
  END IF;
END
$$;
