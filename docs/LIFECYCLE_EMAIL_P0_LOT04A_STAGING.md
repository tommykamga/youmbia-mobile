# Lifecycle Email P0 — Lot 04A Staging Readiness

## Orchestration

| Champ | Valeur |
|-------|--------|
| Niveau | **L4** |
| Skills | orchestrator, architect, security, build, qa-gate, killcritic |
| Baseline Git | `239e85bc215ae58480000ab57c30f78a6ddb042c` |
| Branche | `feat/lifecycle-email-p0` |

## Préflight

| Check | Résultat |
|-------|----------|
| HEAD = baseline | OK |
| Espace | ~5,8 Gio (≥ 4 Gio) |
| Docker | OK · volumes tiers préservés |
| ALLOW_LIVE | absent |
| Projet distant créé | **non** |

## Baseline marketplace

Voir `docs/LIFECYCLE_EMAIL_P0_BASELINE_MARKETPLACE.md`.

- Source DDL : **Youmbia-web** `schema.sql` / `rls.sql` + migrations taxonomy.
- Dump `BackUps/Supabase/backup_youmbia.sql` : **données** → interdit seed.
- Extraction cloud lecture seule : **documentée, non exécutée**.

## Edge HTTP (exécuté)

```bash
npx --yes deno test --no-check \
  --allow-read=supabase/functions --allow-env --allow-net=127.0.0.1 \
  --import-map=supabase/functions/_tests/import_map.json \
  supabase/functions/_tests/lifecycle_edge_http_04a_test.ts
```

| Résultat | **9/9 PASS** |
|----------|----------------|
| Ports | `127.0.0.1:18771–18773` uniquement |
| Resend | mock / dry-run · fetch externe bloqué hors mock |
| Couvert | auth dispatch, kill switch, 3 campagnes dry-run, safe-mode key, timeout→uncertain, unsub GET/POST+HMAC, webhook Svix, HTTPS templates |

### Limite explicite

Ces tests HTTP Deno **ne prouvent pas** la compatibilité complète du runtime Docker `public.ecr.aws/supabase/edge-runtime`. Ils prouvent le **code des handlers** sous `Deno.serve` local + mock Supabase.

## Plan déploiement staging (après autorisations séparées)

### Prérequis
1. Création projet Supabase **staging** (autorisation écrite) — ref ≠ production.
2. Secrets renseignés d’après `supabase/staging.env.example` (gestionnaire de secrets).
3. Domaine mail staging / Resend **domaine de test** ; destinataires `@example.test` uniquement.
4. Kill switch ON ; `LIFECYCLE_EMAIL_ALLOW_LIVE` absent/false ; `DRY_RUN=true` pour la première vague.

### Ordre
1. Bootstrap marketplace (Option A baseline doc) **ou** restore scrubbed schema-only.
2. Appliquer migrations mobile chronologiques (garde → … → lifecycle 150000/160000).
3. Vault secrets staging (`lifecycle_email_functions_url`, `lifecycle_email_dispatch_secret`).
4. Deploy EF : `send-lifecycle-email`, `lifecycle-email-unsubscribe`, `lifecycle-email-webhook`.
   - **`--no-verify-jwt` pour les trois** (pg_net n’envoie que `X-Lifecycle-Email-Dispatch-Secret` vers send ; unsub/webhook sont publics HMAC/Svix).
   - Alternative send : garder verify_jwt et ajouter `Authorization: Bearer <service_role>` dans `net.http_post` — ne pas laisser les deux désalignés.
5. Seed **fictif** : 2–3 users test, prefs opt-in, 1 draft — aucun email réel.
6. Tests : enqueue/claim dry-run ; unsub HMAC ; webhook signature ; kill switch ON bloque.
7. Revue killcritic staging ; seulement alors envisager kill switch OFF + ALLOW_LIVE sur GO send.

### Rollback
1. Kill switch → `true` immédiat.
2. `ALLOW_LIVE` retiré / false.
3. Unschedule cron `enqueue-lifecycle-emails` / `dispatch-lifecycle-emails` si besoin.
4. Undeploy / disable EF staging.
5. Migrations lifecycle : **pas de DROP** destructif en urgence ; désactivation flags + cron suffit.
6. Ne jamais pointer le rollback vers la prod.

## Coûts / ressources (estimation)

| Poste | Ordre de grandeur |
|-------|-------------------|
| Projet Supabase staging (free/pro) | selon plan org |
| Resend staging | volume test négligeable si dry-run |
| Stockage Docker local déjà présent | ~images existantes ; marge disque à maintenir ≥ 4 Gio |
| Temps eng. bootstrap + recette | 0,5–1 j après création projet |

## Killcritic

| Attaque | Classe | Statut |
|---------|--------|--------|
| Utiliser dump PII comme baseline | BLOQUANT | **Écarté** — documenté interdit |
| Confondre HTTP Deno local = edge-runtime | IMPORTANT | **Documenté** |
| Staging lié à prod / mêmes secrets | BLOQUANT | Plan exige projet neuf + secrets distincts |
| ALLOW_LIVE trop tôt | IMPORTANT | Plan : dry-run d’abord |

**Verdict :** **GO CONDITIONNEL** préparation staging (docs + harness) ; **NO-GO** exécution migrate/deploy/send tant qu’autorisations staging + projet isolé manquent.

## Décision staging

| Action | Décision |
|--------|----------|
| Préparer / documenter / tester local | **GO** |
| Créer projet distant / migrer / déployer / email | **NO-GO** (cette mission) |
