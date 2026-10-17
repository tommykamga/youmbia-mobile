# Baseline marketplace YOUMBIA — inventaire Lot 04A

## Sources vérifiées (lecture locale uniquement)

| Source | Chemin | Rôle |
|--------|--------|------|
| Schéma d’origine | `Youmbia-web/supabase/schema.sql` | `CREATE` profiles, categories, listings, listing_images, reports, admin_users + trigger `set_updated_at` |
| RLS d’origine | `Youmbia-web/supabase/rls.sql` | policies + `is_admin()` |
| Seed catégories | `Youmbia-web/supabase/seed.sql` | inserts catégories (pas de PII) |
| Migrations web | `Youmbia-web/supabase/migrations/*.sql` (~39) | deltas taxonomy, trust, messages, drafts, … |
| Miroir backup git | `BackUps/GitHub/youmbia-main/supabase/schema.sql` | identique à schema.sql web |
| Dump local | `BackUps/Supabase/backup_youmbia.sql` | **pg_dump 17.6 avec COPY de données utilisateurs** — **ne pas** importer tel quel ni committer |

## Cause du trou « categories » (mobile)

Le dépôt `youmbia-mobile` démarre ses migrations à `20260514220000` (INSERT categories) : **aucune** `CREATE TABLE categories` dans mobile. La création est dans **Youmbia-web `schema.sql`**, puis colonnes `parent_id` / `level` via migrations taxonomy web (`2026_taxonomy_*`).

## Objets nécessaires (chaîne logique)

### Extensions
`pgcrypto` (schema.sql) ; pour lifecycle : `pg_net`, `pg_cron`, `supabase_vault` (image Supabase / migrations lifecycle).

### Tables cœur (origine → évolutions)
- `public.profiles` (+ `is_banned`, trust, phone_verified via migrations web/mobile)
- `public.categories` (+ `parent_id`, `level`, `deprecated`, `form_profile`)
- `public.listings` (status évolue vers enum `listing_status` : active/draft/…)
- + listing_images, reports, conversations, messages, shops, … selon migrations ultérieures

### Lifecycle P0 (mobile, déjà dans le dépôt)
`20261017150000` + `20261017160000` + garde `20260514100000_require_marketplace_baseline.sql`

## Compatibilité production

- Les migrations **déjà appliquées** en prod ne doivent **pas** être réécrites.
- La garde baseline est un **no-op** si `categories`/`profiles`/`listings` existent.
- Ne pas rejouer `schema.sql` sur un projet déjà provisionné (IF NOT EXISTS aide, mais l’historique prod ≠ greenfield).

## Stratégie bootstrap reproductible (sans modifier les deltas déployés)

### Option A — Staging / greenfield contrôlé (recommandée)
1. Projet Supabase **neuf** (staging), jamais lié à la prod.
2. Appliquer dans l’ordre documenté :
   - `Youmbia-web/supabase/schema.sql`
   - `Youmbia-web/supabase/rls.sql`
   - migrations web nécessaires jusqu’à l’état « marketplace » (taxonomy `parent_id`/`level` **avant** INSERT mobile loisirs)
   - migrations `youmbia-mobile/supabase/migrations/` dans l’ordre chronologique (garde → … → lifecycle)
3. Seed **fictif uniquement** (pas de COPY du dump).

### Option B — Lifecycle-only (déjà Lot 03C)
Postgres image Supabase + bootstrap minimal lifecycle (profiles/listings) **sans** prétendre rejouer tout le marketplace. Suffisant pour QA lifecycle, **insuffisant** pour `supabase db start` greenfield complet.

### Option C — Extraction schéma distant (NON exécutée)
Procédure lecture seule — **approbation séparée requise** :

```text
1. Autorisation écrite du propriétaire projet + confirmation projet ≠ production.
2. supabase db dump --schema-only -f schema_staging_readonly.sql
   (ou Dashboard → SQL → export DDL only)
3. Revue humaine : aucun COPY / INSERT de PII.
4. Stockage hors git ou git-crypt ; jamais commit de données utilisateurs.
5. Comparer DDL à Youmbia-web/schema.sql + migrations ; documenter écarts.
```

**Lot 04A : procédure documentée, non exécutée.**

## Interdit

- Inventer une baseline fictive « complète » non sourcée.
- Utiliser `backup_youmbia.sql` (données) comme seed staging.
- `db push` / migrate linked vers prod.
