# Lifecycle Email P0 — Lot 04B (E2E local isolé)

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, architect, security, build, debug, qa-gate, killcritic |
| Baseline | `f68a5fbf23f6e89f42418461cc2ad1c80205ead0` |
| Budget | **0 €** · pas de pull · pas de projet cloud |

## Préflight

| Check | Résultat |
|-------|----------|
| HEAD | baseline OK |
| Images | `postgres:17.6.1.143`, `edge-runtime:v1.74.2`, `postgrest:v14.14` présentes |
| Conteneur 03C | réutilisé |
| Réseau | `youmbia_lifecycle_p0_04b` **`--internal`** (pas d’Internet) |
| Volumes tiers | préservés (anivia / youmgo / youmbia-mobile) |
| ALLOW_LIVE | absent |

## Edge Runtime — BLOCAGE (STOP, 1 tentative)

```
worker boot error: Import 'https://esm.sh/@supabase/supabase-js@2.99.3' failed:
dns error: Temporary failure in name resolution
```

Cause : handlers Edge dépendent de `esm.sh` ; réseau `--internal` interdit la résolution DNS.  
**Pas de contournement** (pas d’Internet, pas de pull). PostgREST non démarré (inutile sans EF boot).

## Composants Docker réellement utilisés

| Composant | Usage |
|-----------|--------|
| `supabase_db_youmbia-lifecycle-p0-03c` | PG E2E |
| Volume `youmbia_lifecycle_p0_03c_pgdata` | data |
| Network `youmbia_lifecycle_p0_04b` | isolation |
| `edge-runtime:v1.74.2` | **probe fail** (documenté) |
| postgrest | **non démarré** |

## Baseline marketplace

Bootstrap minimal sourcé Youmbia-web (`schema` + colonnes taxonomy) :  
`supabase/scripts/lifecycle_p0_04b_marketplace_bootstrap.sql`  
- Pas de dump prod  
- `pg_cron` non installable hors DB `postgres` → strip schedule à l’apply (limitation documentée)  
- Reconstruction historique marketplace complète : **non** (deltas web absents du run)

## Parcours E2E SQL (`./scripts/run-lifecycle-p0-04b-e2e.sh`)

| Scénario | Résultat |
|----------|----------|
| A Bienvenue → outbox pending | **PASS** |
| B Première annonce → exclus après publish | **PASS** (`already_published`) |
| C Brouillon → exclus après publish | **PASS** (`draft_not_eligible`) |
| Kill switch ON / restored | **PASS** |
| Consent absent / banned | **PASS** |
| Hard bounce suppression | **PASS** |
| Unsubscribe | **PASS** |
| Claim concurrent | **PASS** (a=7 b=0) |
| Uncertain provider | **PASS** |
| Frequency fn | **PASS** |

**Non prouvé SQL :** transmission HTTP réelle vers mock Resend (nécessite Edge Runtime boot).

## HTTP handlers (Deno local, ≠ edge-runtime)

Lot 04A harness : **9/9 PASS** (dry-run, timeout→uncertain, unsub, webhook Svix, 127.0.0.1 only).

## Auth / Magic Link

Contrats existants : worker n’importe pas `signInWithOtp` / auth-email-links (Vitest contract).

## Killcritic

| Attaque | Classe | Statut |
|---------|--------|--------|
| Donner Internet pour faire boot EF | BLOQUANT isolation | **Refusé** — STOP documenté |
| Présenter Deno HTTP comme edge-runtime | IMPORTANT | **Clarifié** |
| pg_cron stripé = faux cron prod | IMPORTANT | **Documenté** — jobs sur DB postgres image only |

**Verdict killcritic :** GO CONDITIONNEL pilote **préparation** ; NO-GO activation marketing live.

## Décision pilote marketing

| | |
|--|--|
| Préparer staging / continuer | **GO CONDITIONNEL** |
| Activer campagnes / ALLOW_LIVE / emails | **NO-GO** |

## Disque / mémoire

| | |
|--|--|
| Avant | ~5,8 Gio libres · Docker RAM ~3,8 Gio |
| Après | ~4,8 Gio libres (≥ 4 Gio) |
