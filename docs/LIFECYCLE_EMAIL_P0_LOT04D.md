# Lifecycle Email P0 — Lot 04D (Final Security Gate)

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, security, qa-gate, killcritic |
| Baseline | `496ee63f745211156b2f9028f97fbc6fc766520a` |
| Scope | Fail-closed env + isolation réseau + audit bundle — **pas** de feature |

## Préflight

| Check | Résultat |
|-------|----------|
| HEAD | baseline OK |
| Tree | propre au départ |
| Disque avant | ~4,70 Gio (≥ 4) |
| Docker | `--pull=never` ; images déjà présentes |

## LOT 04C — communication fournisseur réel ?

**Non démontrable (signalé).**  
Sous 04C, dual-homing bridge+internal : `getent hosts api.resend.com` réussissait depuis le conteneur send. Aucune capture de paquets n’a été réalisée. Mitigation de fait : `LIFECYCLE_RESEND_BASE_URL` pointait vers le mock et le compteur mock a incrémenté sur le chemin positif — **mais cela ne prouve pas l’absence de tout autre flux**. Le lot 04D lève ce risque en retirant l’egress.

## Fail-closed env

| Règle | Implémentation |
|-------|----------------|
| Défaut | `dry_run` (aucun fetch) |
| ALLOW_LIVE sans `LIFECYCLE_EMAIL_TRANSPORT` | **blocked** (`transport_mode_required_when_allow_live`) |
| `TRANSPORT=mock` | URL http interne allowlistée uniquement ; `api.resend.com` refusé |
| `TRANSPORT=live` | exige `LIFECYCLE_EMAIL_LIVE_PROVIDER=true` + base exactement `https://api.resend.com` |
| `LIFECYCLE_EMAIL_ISOLATION=test` | **interdit** le mode live |
| Conteneurs recette | env forcée à chaque `docker run` (jamais `docker start` d’un ancien send) |

Fichiers : `src/lib/lifecycleEmail/providerTransport.ts` (miroir Edge `_shared/`), `send-lifecycle-email/index.ts`.

## Network isolation

| Mesure | Preuve |
|--------|--------|
| Réseau `youmbia_lifecycle_p0_04d` `--internal` | `internal=true` |
| Conteneurs send/mock/rest **sans** bridge, **sans** `-p` | une seule network attachment |
| DNS `api.resend.com` / `supabase.co` | **unresolvable** depuis `youmbia_e2e_client_04d` |
| TCP `1.1.1.1:443` | **closed** |
| Tests HTTP | `/dev/tcp` depuis le client privé (`scripts/lifecycle-http-client.sh`) |
| Credentials fournisseur réels | absents (`re_test_isolated_not_live` seulement) |

## Bundle

| Check | Résultat |
|-------|----------|
| Version pin | `@supabase/supabase-js@2.99.3` (`supabase-js-bundle.meta.json`) |
| SHA-256 | `supabase-js-bundle.sha256` (vérifiable `shasum -c`) |
| Scan secrets | PASS (pas de clé `re_…` longue, pas d’`api.resend.com`) |
| Rebuild | `scripts/prepare-lifecycle-edge-vendor.sh` (offline, esbuild local) |

## Régression E2E (`./scripts/run-lifecycle-edge-e2e-04d.sh`)

| Scénario | Résultat |
|----------|----------|
| Kill switch ON → zéro requête mock | **PASS** |
| ALLOW_LIVE hérité sans transport → 500 blocked, mock inchangé | **PASS** |
| mock + `https://api.resend.com` → 500 blocked | **PASS** |
| Webhook sig invalide → aucune mutation suppressions | **PASS** |
| Consentement révoqué → `sent=0`, mock inchangé | **PASS** |
| Mock positif → `transport=mock`, `sent≥1`, posts++ | **PASS** |
| Magic Link / Auth collision | **aucune** (contrat + grep) |

## QA

| Contrôle | Résultat |
|----------|----------|
| Vitest | **430/430 PASS** |
| `tsc --noEmit` | PASS |
| eslint (fichiers touchés) | PASS |
| Disque après | ~4,70 Gio |

## Killcritic

| Critique | Classe | Statut |
|----------|--------|--------|
| 04C non-preuve egress | IMPORTANT | **Clos** par isolation 04D + déclaration explicite |
| Dual-homing bridge | BLOQUANT (04C) | **Clos** : internal-only |
| LIVE_PROVIDER oublié en prod | OPTIONNEL | fail-closed : live impossible sans flag |
| Relecteur indépendant | Limite | même session |

**Verdict killcritic :** GO CONDITIONNEL pour préparation déploiement (secrets/DNS/pilot hors 04D).

## Risques résiduels

1. Mode `live` réel non exercé ici (volontaire) — valider en staging autorisé avec egress contrôlé.
2. Autres Edge Functions hors lifecycle utilisent encore `esm.sh`.
3. Client HTTP `/dev/tcp` = outil de lab uniquement.

## Verdict QA locale

**PASS** — isolation réseau démontrée ; fail-closed env prouvé ; suite verte ; aucun push / migration distante / email réel.
