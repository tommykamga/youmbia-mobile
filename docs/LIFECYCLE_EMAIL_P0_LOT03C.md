# Lifecycle Email P0 — Lot 03C (Postgres Supabase natif Docker)

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, security, debug, qa-gate, killcritic |
| Baseline | `2f265cae7565f4ce3b170c07786be2efc50e490c` |
| Branche | `feat/lifecycle-email-p0` |

## Préflight

| Check | Résultat |
|-------|----------|
| HEAD = baseline | OK |
| Working tree initial | propre |
| Docker | OK · RAM ~3,8 Gio |
| Espace avant | **6,9 Gio** |
| Images `postgres:17.6.1.143` | présente (pas de pull PG) |
| Ports | Homebrew `5432` ; natif mappé **`54322`** |
| `project_id` | `youmbia-lifecycle-p0-03c` (≠ anivia / youmgo / youmbia-mobile) |
| Volumes protégés | anivia / youmgo / youmbia-mobile **non touchés** |

## Tentative `supabase db start`

| Étape | Résultat |
|-------|----------|
| Pull non maîtrisé | CLI a tiré `storage-api:v1.58.17` (~1,3 Go) — **hors scope db-only** |
| Migrations auto | **FAIL** `public.categories` absent (migrations greenfield incomplètes) |
| Volume créé puis pruned par CLI | `supabase_db_youmbia-lifecycle-p0-03c` (nouveau) — volumes existants intacts |
| Image pull accidentelle | retirée (`docker rmi` tag seul) pour restaurer la marge ≥ 4 Gio |
| Décision | **STOP `supabase db start`** → conteneur Postgres image Supabase **seul** |

## Environnement SQL natif réellement utilisé

| Champ | Valeur |
|-------|--------|
| Image | `public.ecr.aws/supabase/postgres:17.6.1.143` |
| Container | `supabase_db_youmbia-lifecycle-p0-03c` |
| Volume data | `youmbia_lifecycle_p0_03c_pgdata` (nouveau, isolé) |
| Endpoint | `127.0.0.1:54322` · user `postgres` |
| Cloud / `.env` | **non utilisé** |

### Extensions vérifiées (réelles)

| Extension | Version |
|-----------|---------|
| `pg_cron` | 1.6.4 |
| `pg_net` | 0.20.3 |
| `supabase_vault` | 0.3.1 |

### Preuves SQL exécutées

- Migrations `20261017150000` + `20261017160000` appliquées sur image native
- Jobs cron `enqueue-lifecycle-emails` / `dispatch-lifecycle-emails` planifiés
- Suite `lifecycle_p0_integration_tests.sql` : **PASS** (`lifecycle_p0`, `rls_outbox_denied`, `dry_run_deferred`)
- `enqueue_lifecycle_email_dispatch()` lit Vault + enqueue `net.http_post` → réponses `Couldn't connect to server` vers mock `127.0.0.1:9` (attendu, aucun email)
- Fonctions lifecycle en **SECURITY DEFINER**
- Kill switch remis à **`true`**
- `LIFECYCLE_EMAIL_ALLOW_LIVE` : **absent**

## Edge Functions

| Contrôle | Statut |
|----------|--------|
| Deno CLI | **absent** |
| `supabase functions serve` / runtime HTTP | **NON EXÉCUTÉ** (évite stack + pull) |
| Preuves unit/contract webhook/HMAC/CTA | Vitest lifecycle **52 PASS** (sous-ensemble) |

Ne pas prétendre à un E2E Edge complet.

## Auth / secrets

- `signInWithOtp` non modifié dans ce lot
- Aucun secret prod commité ; secret Vault mock local explicitement nommé `lot03c-local-…-not-for-prod`
- Aucun `db push` / `db reset --linked` / deploy / email réel

## Espace disque

| Moment | Libre approx. |
|--------|----------------|
| Avant Lot 03C | 6,9 Gio |
| Après pull storage accidentel | ~4,7 Gio |
| Après `rmi` storage + start PG | **~5,9 Gio** |
| Après IT native | **~5,9 Gio** (≥ 4 Gio respecté en fin de tests) |

## Fichiers livrés

- `supabase/config.toml` (`project_id` unique, migrations/seed **disabled** pour greenfield)
- `supabase/.gitignore`
- `supabase/scripts/lifecycle_p0_native_bootstrap.sql`
- `scripts/run-lifecycle-p0-sql-native.sh`
- ce document

## Killcritic

| Attaque | Classe | Statut |
|---------|--------|--------|
| `supabase db start` non viable sans baseline schéma complet | IMPORTANT | Avéré — contournement docker PG documenté |
| CLI tire des images hors db-only | IMPORTANT | Avéré — stop + rmi tag accidentel |
| Edge Deno non prouvé | IMPORTANT | Avéré — NO-GO E2E send |
| Homebrew stubs confondus avec natif | BLOQUANT si omis | **Écarté** — IT native séparée, extensions listées |
| Staging ALLOW_LIVE | IMPORTANT | Mitigé kill switch ON + env absent |

**Verdict :** **GO CONDITIONNEL** préparation staging SQL ; **NO-GO** activation send (Edge runtime + Vault staging + ALLOW_LIVE procédure).

## Décision staging

| Question | Décision |
|----------|----------|
| Confiance migrations / RLS / RPC / cron / vault / pg_net locaux | **GO** (preuves natives) |
| Deploy EF + kill switch OFF + ALLOW_LIVE | **NO-GO** jusqu’à runtime Edge + dry-run staging contrôlé |

## Commandes de reprise locale

```bash
docker start supabase_db_youmbia-lifecycle-p0-03c
./scripts/run-lifecycle-p0-sql-native.sh
# stop sans supprimer le volume :
docker stop supabase_db_youmbia-lifecycle-p0-03c
```
