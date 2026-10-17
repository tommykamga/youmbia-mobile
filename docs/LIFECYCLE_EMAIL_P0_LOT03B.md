# Lifecycle Email P0 — Lot 03B (reprise sécurisée)

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** (emailing, RLS, secrets, endpoints publics, staging prep) |
| Skills | tsk-orchestrator, tsk-security, tsk-build, tsk-debug, tsk-qa-gate, tsk-killcritic |
| QA_POLICY / tested_state.sh | **Absents** du dépôt (limite outillage TSK local) |
| Baseline | `078a93154c054d77970a506c0f9480c4783e54e3` |
| Branche | `feat/lifecycle-email-p0` (ahead 3 → origin/main) |

## Contrat de contrôle (fixé avant exécution)

| Contrôle | Statut requis | Motif |
|----------|---------------|-------|
| Préflight Git baseline + tree propre | Requis | STOP si écart |
| docker info + df + images | Requis | Stratégie disque |
| `supabase start` stack complète | **Non lancé** | Espace < 12 Gio (politique Étape 2) |
| Harness SQL Homebrew (stubs) | Requis (indépendant) | ≠ pg_net/pg_cron/Vault réels |
| Vitest + typecheck + lint | Requis | Non-régression |
| Edge Deno runtime local | Non exécuté | Dépend stack |
| Vault / pg_net / pg_cron réels | Non exécuté | Dépend stack |
| Email réel / ALLOW_LIVE / push / migrate distant | **Interdit** | Mission |

## Préflight (exécuté)

| Check | Résultat |
|-------|----------|
| HEAD | `078a931` = baseline |
| Working tree | propre au départ |
| Docker | OK (Server 29.5.3) |
| Espace Data | **7,2 Gio libres** (< 12 Gio → pas de start auto) |
| Images Docker | 15 images Supabase présentes (~13,5 Go) ; 0 containers |
| `supabase --version` | 2.109.1 |
| `supabase status` | pas de container `supabase_db_youmbia-mobile` |
| `supabase/config.toml` | **ABSENT** du dépôt (blocage additionnel `supabase start`) |
| PG Homebrew | `127.0.0.1:5432` écoute (conflit potentiel avec DB Docker si start) |
| Ports 54321/54322 | libres |
| `.env` cloud | **non utilisé** (script refuse `DATABASE_URL` / `SUPABASE_DB_URL`) |

### Ressources nécessaires pour lever le blocage stack

1. **≥ 12 Gio libres** sur le volume Data (politique Lot 03B), idéalement ≥ 15 Gio pour marge init Postgres + layers.
2. Fichier `supabase/config.toml` versionné ou fourni localement (ports, API, DB) — actuellement manquant.
3. Alignement versions d’images avec CLI 2.109.1 (pull éventuel si tags manquants — **interdit** sous 12 Gio).
4. Arrêt ou non-conflit du Postgres Homebrew sur 5432 si `config.toml` mappe la DB Docker sur ce port (sinon configurer un autre `db_port`).

**Aucune image/volume/fichier Docker n’a été supprimé. Aucun `docker prune`.**

## Preuves exécutées (indépendantes)

| Contrôle | Résultat |
|----------|----------|
| `./scripts/run-lifecycle-p0-sql-integration.sh` | **PASS** (NOTICE `lifecycle_p0`, `rls_outbox_denied`, `dry_run_deferred`) |
| Kill switch fin de run | `true` |
| `npm test` | **419 PASS** / 60 fichiers |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (1 warning hors périmètre `avatarImageUrl.ts`) |
| Scan secrets lifecycle (sk_live / whsec_ / JWT hardcodés) | **aucun** dans sources lifecycle |
| `LIFECYCLE_EMAIL_ALLOW_LIVE` env process | **absent** |
| Webhook unit (Svix valid/invalid) | PASS (`src/lib/lifecycleEmail/webhook.test.ts`) |
| Contract Edge unsub/webhook `invalid_signature` | PASS (contract test) |
| Magic Link `signInWithOtp` | inchangé fonctionnellement ; opt-in marketing uniquement sur signup/OAuth metadata |

## Contrôles non exécutés (explicites)

| Contrôle | Raison |
|----------|--------|
| Migrations sur Postgres Supabase Docker réel | Stack non démarrée (< 12 Gio + pas de config.toml) |
| pg_cron / pg_net / Vault **réels** | Stubs Homebrew seulement |
| Edge Functions runtime Deno local | Dépend stack |
| 3 campagnes E2E Resend mocké via EF locale | Dépend stack |
| Signature webhook **HTTP** bout-en-bout | Uniquement unit + lecture source |
| Magic Link device / DNS | Hors harness ; Auth non modifié pour OTP |
| OAuth device opt-in E2E | Non |

**Les stubs Homebrew ne sont pas équivalents à pg_net, pg_cron et Vault réels.**

## Sécurité (statique + preuves locales)

- Kill switch défaut ON ; remis ON après IT.
- Send live gated par `LIFECYCLE_EMAIL_ALLOW_LIVE===true` sinon dry-run → defer +100y.
- Webhook / unsubscribe : signature obligatoire ; GET unsub non mutatif.
- Outbox : grants service_role ; authenticated sans SELECT (prouvé SQL).
- Pas de secret Resend/service_role commité dans le périmètre scanné.

## Killcritic (Lot 03B)

**Thèse :** les preuves Lot 03B suffisent pour un GO staging (migrate + deploy EF).

| Attaque | Classe | Statut |
|---------|--------|--------|
| Stubs ≠ extensions réelles → faux sentiment de readiness | BLOQUANT staging activate | **Avéré** — stack non prouvée |
| `config.toml` absent → `supabase start` impossible même avec disque | IMPORTANT | **Avéré** |
| Espace 7,2 Gio + start = risque I/O / corruption VM Docker | BLOQUANT start local | **Avéré** (politique < 12 Gio) |
| Auth signup touché (opt-in) → régression Magic Link | IMPORTANT | **Écarté** pour OTP : `signInWithOtp` non altéré ; opt-in sur signup/metadata seulement |
| ALLOW_LIVE oublié en staging | IMPORTANT | Mitigé code + env absent ; procédure staging requise |
| Preuves Edge HTTP absentes | IMPORTANT | À lever sur stack ou staging dry-run |

**Verdict killcritic :** **GO CONDITIONNEL** pour poursuivre la préparation ; **NO-GO** activation staging (migrate distant / deploy / kill switch OFF / ALLOW_LIVE) tant que stack réelle ou dry-run staging contrôlé n’a pas prouvé pg_net/Vault/EF.

## QA Gate

| Champ | Valeur |
|-------|--------|
| Empreinte | HEAD `078a931` + doc Lot 03B (ce fichier) |
| Verdict | **CONCERNS** (contrôles stack requis indisponibles ; dérogation mission Étape 2/3 documentée) |
| Livraison code | Pas de défaut prouvé à corriger sur ce run |
| Push / migrate / deploy / email réel | **Non** |

## Décision staging

| Question | Décision |
|----------|----------|
| GO revue code / merge prep | Oui (sous réserve revue humaine) |
| GO migrate staging + deploy EF | **NO-GO** jusqu’à preuves stack réelle ou protocole staging dry-run signé |
| GO kill switch OFF / ALLOW_LIVE | **NO-GO** |

## Prochaine action sûre

1. Libérer ≥ 12 Gio (sans prune agressif non demandé).
2. Ajouter `supabase/config.toml` local (hors secrets) avec ports non conflictuels vs Homebrew 5432.
3. `supabase start` → rejouer migrations 150000/160000 + EF serve + IT sans stubs.
4. Alors seulement : revoir killcritic → éventuel GO CONDITIONNEL staging.
