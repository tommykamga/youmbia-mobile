# Lifecycle Email P0 — Lot 04C (Final Edge Gate)

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, security, debug, qa-gate, killcritic |
| Baseline | `97fd5b994cca8eecfa76c4ae1cb03484ff5062f6` |
| Budget | **0 €** · `--pull=never` · pas de cloud · pas d’email réel |

## Préflight

| Check | Résultat |
|-------|----------|
| HEAD baseline | OK (`97fd5b9…`) |
| Disque avant | ~4,7 Gio libres (≥ 4 Gio) |
| Docker / images | `edge-runtime:v1.74.2`, `postgrest:v14.14`, PG 03C présents |
| Réseau | `youmbia_lifecycle_p0_04b` **`--internal`** + bridge pour publish `127.0.0.1` |
| ALLOW_LIVE défaut | `false` ; kill switch restauré `true` en fin E2E |
| Preuves 04B | SQL E2E A/B/C réutilisées (pas de rejeu des 420 tests avant correction) |

## Diagnostic esm.sh

| Élément | Détail |
|---------|--------|
| Imports lifecycle (avant) | `https://esm.sh/@supabase/supabase-js@2.99.3` (3 EF) |
| Blocage | DNS `esm.sh` impossible sous `--internal` |
| Tentative 1 | Vendor relatif `@supabase/*` → modules sans extension / résolution Deno fragile |
| Tentative 2 (retenue) | Bundle esbuild offline `supabase-js-bundle.mjs` + re-export `_shared/supabaseClient.ts` |
| Runtime final | **aucun** accès Internet requis pour booter les 3 EF |

## Correction minimale

- `supabase/functions/_vendor/supabase-js-bundle.mjs` (esbuild depuis `node_modules`, script `prepare-lifecycle-edge-vendor.sh`)
- `supabase/functions/_shared/supabaseClient.ts`
- Imports des 3 EF → `../_shared/supabaseClient.ts`
- `LIFECYCLE_RESEND_BASE_URL` (défaut `https://api.resend.com`) pour injection mock isolée
- Helpers locaux : `_resend_mock`, `_rest_v1_proxy` (prefix `/rest/v1` → PostgREST)
- Scripts : `run-lifecycle-edge-runtime-04c.sh`, `run-lifecycle-edge-e2e-04c.sh`
- API métier inchangée ; pas de secrets prod

## Preuves Edge Runtime HTTP

| Scénario | Résultat |
|----------|----------|
| Boot offline (bundle) | **PASS** (`401 unauthorized` = worker up) |
| Kill switch ON → `no_claim`, mock inchangé | **PASS** |
| Send unauthorized | **PASS** |
| Webhook signature invalide | **PASS** |
| Webhook hard bounce → suppression | **PASS** |
| Unsubscribe GET (RFC8058) + POST | **PASS** |
| Dry-run 3 campagnes (`claimed=3`, `sent=0`, mock inchangé) | **PASS** |
| ALLOW_LIVE + mock BASE_URL → `sent≥1`, mock `posts++` | **PASS** |
| Kill switch restauré ON + ALLOW_LIVE=false | **PASS** |

Commande : `./scripts/run-lifecycle-edge-e2e-04c.sh` → exit `0`.

## QA locale

| Contrôle | Résultat |
|----------|----------|
| Vitest ciblé lifecycle contract | 11/11 PASS |
| Suite complète | **420/420 PASS** |
| `tsc --noEmit` | PASS |
| Deno CLI 03D/04A | **NON EXÉCUTÉ** (`deno` absent sur host) — Edge Runtime réel couvre le boot |
| Disque après | ~4,73 Gio libres |

## Killcritic (final)

| Critique | Classe | Statut |
|----------|--------|--------|
| Dual-homing bridge+internal : DNS `api.resend.com` résolvable depuis le conteneur | IMPORTANT | Mitigé : `LIFECYCLE_RESEND_BASE_URL` → mock ; ALLOW_LIVE false hors scénario positif ; pas de preuve packet-capture « zéro paquet Resend » |
| Bundle vendored à régénérer si upgrade supabase-js | OPTIONNEL | Script `prepare-lifecycle-edge-vendor.sh` |
| Kill critic « même auteur » | Limite | Signalé (pas de relecteur indépendant) |

**Verdict killcritic :** GO CONDITIONNEL (pilot local OK ; lancement prod hors périmètre 04C).

## Risques restants / prérequis lancement

1. Attacher uniquement le réseau `--internal` en staging/prod runner sans bridge host si l’isolation stricte est exigée (ou firewall egress deny).
2. Secrets Resend / HMAC / webhook **réels** uniquement hors lab ; `LIFECYCLE_EMAIL_ALLOW_LIVE` absent/false tant que le pilot n’est pas autorisé.
3. Kill switch ON par défaut en base.
4. DNS / domaine d’envoi, templates brand, monitoring outbox : hors 04C.
5. Autres EF hors lifecycle (`send-message-push`, …) utilisent encore `esm.sh` — hors scope.

## Verdict QA locale

**PASS** — Edge Runtime HTTP réel prouvé offline pour le path lifecycle ; suite Vitest 420 verte ; aucun push / migration distante / email réel.
