# Lifecycle Email P0 — Lot 03D

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, architect, security, debug, build, qa-gate, killcritic |
| Baseline | `8f3876e0ec1f19d9f76cb7e64b3878ed58858891` |
| Branche | `feat/lifecycle-email-p0` |

## 1. Cause exacte — échec `categories` / `supabase db start`

| Élément | Détail |
|---------|--------|
| Migration | `supabase/migrations/20260514220000_activate_loisirs_autres_root_categories.sql` |
| SQL fautif | `INSERT INTO public.categories (...)` puis `setval(pg_get_serial_sequence('public.categories','id'), …)` |
| Erreur PG | `42P01 relation "public.categories" does not exist` |
| Dépendance | Table `public.categories` **jamais créée** dans ce dépôt |

### Ordre / prérequis

- Première migration chronologique du set = **INSERT** dans `categories` (pas de `CREATE TABLE`).
- Migrations suivantes référencent aussi un schéma hors dépôt (`profiles`, `listings`, `messages`, `shops`, …).
- **Verdict diagnostic :** ce n’est **pas** un défaut de la migration delta déjà appliquée en production ; c’est un **bootstrap local incomplet** (historique = deltas sur baseline marketplace absente du repo).

### Correctif minimal retenu (architect)

| Option | Décision |
|--------|----------|
| Réécrire `20260514220000` / inventer `CREATE TABLE categories` stub | **Rejeté** (masque + risque checksum prod + insuffisant pour le reste du set) |
| `CREATE TABLE` baseline marketplace complète dans git | **Hors périmètre** Lot 03D (dump baseline séparé) |
| Garde explicite **avant** le INSERT | **Retenu** : `20260514100000_require_marketplace_baseline.sql` — no-op si tables présentes ; `RAISE baseline_schema_missing` sinon |
| `db.migrations.enabled = false` + PG lifecycle isolé (03C) | **Conservé** pour le travail lifecycle |

### Reproductibilité isolée (exécutée)

| Étape | Résultat |
|-------|----------|
| A — garde sur DB vide | **FAIL** attendu `baseline_schema_missing` |
| B — tables minimales réelles puis garde | **PASS** (diagnostic session only, DB jetable droppée) |
| C — INSERT `20260514220000` après garde | **PASS** |
| Volumes anivia / youmgo / youmbia-mobile | **intacts** |

## 2. Edge Functions — résultats réels

Runtime : **Deno 2.9.6 via `npx`** (déjà en cache, **aucun** nouveau pull Docker).  
Image `edge-runtime` présente mais **non démarrée** (évite stack / ressources).

| Contrôle | Exécuté ? | Résultat |
|----------|-----------|----------|
| Harness Deno `supabase/functions/_tests/lifecycle_edge_03d_test.ts` | **Oui** | **5/5 PASS** |
| Signature Svix valide/invalide | Oui (miroir crypto) | PASS |
| HMAC unsub + expiration 7j | Oui | PASS |
| Gates ALLOW_LIVE / dry-run / dispatch secret / List-Unsubscribe | Oui (source + logique) | PASS |
| GET unsub non mutatif + POST RPC | Oui (source) | PASS |
| Webhook : signature **avant** upsert suppressions | Oui | PASS |
| Isolation Magic Link / signup / reset (pas dans worker) | Oui (source) | PASS |
| `Deno.serve` HTTP E2E + Resend mock bout-en-bout | **Non** | **NON EXÉCUTÉ** |
| Consentement / suppressions / kill switch au dispatch SQL | Déjà Lot 03C natif | non rejoué ici |

Commande :

```bash
npx --yes deno test --no-check --allow-read=supabase/functions \
  supabase/functions/_tests/lifecycle_edge_03d_test.ts
```

Vitest lifecycle (complément) : **52 PASS**.

## 3. Sécurité

| Check | Résultat |
|-------|----------|
| Kill switch (PG lifecycle) | `true` |
| `LIFECYCLE_EMAIL_ALLOW_LIVE` | **absent** |
| Secrets prod dans diff | aucun |
| Push / deploy / migrate distant / email réel | **non** |
| Volumes autres projets | préservés |
| `docker prune` | non |

## 4. Disque

| Moment | Libre |
|--------|-------|
| Avant | ~5,75 Gio |
| Après | ~5,73 Gio |
| Marge ≥ 4 Gio | **OK** |

## 5. Réserves restantes

1. Pas de dump **baseline marketplace** versionné → `supabase db start` greenfield toujours bloqué (désormais avec message clair).
2. Edge **HTTP E2E** (`Deno.serve` / `edge-runtime`) non exécuté.
3. Staging Vault secrets + deploy EF + kill switch OFF non autorisés ici.

## 6. Killcritic

| Attaque | Classe | Statut |
|---------|--------|--------|
| Corriger categories par stub table | BLOQUANT si fait | **Écarté** — garde + diagnostic |
| Confondre harness Deno avec E2E serve | IMPORTANT | **Documenté** NON EXÉCUTÉ |
| Appliquer garde en prod casse le schéma | IMPORTANT | **Écarté** — no-op si baseline présente |

**Verdict killcritic :** GO CONDITIONNEL préparation staging SQL+guards ; **NO-GO** activation send live.

## 7. Décision staging

| | |
|--|--|
| Confiance diagnostic + garde + Edge gates code | **PASS WITH RESERVATIONS** |
| Staging migrate / deploy EF / ALLOW_LIVE | **NO-GO** |
