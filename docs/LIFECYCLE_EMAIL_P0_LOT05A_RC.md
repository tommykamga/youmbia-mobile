# Lifecycle Email P0 — Lot 05A Release Candidate

## Identité

| Champ | Valeur |
|-------|--------|
| Branche | `feat/lifecycle-email-p0` |
| Baseline entrée | `29993fbe267cb67d9628bfbe0055c2a28b247d73` |
| SHA RC | `181af0416ca9f9d133fdf2b36cc29affe8140970` |
| Base | `origin/main` |
| Niveau | **L4** |
| Skills | orchestrator, security, qa-gate, release, killcritic, project-memory |

## Préflight

| Check | Résultat |
|-------|----------|
| Tree avant travail | **CLEAN** |
| Ahead of origin/main | 10 commits (+ commit 05A) |
| Disque | ≥ 5,6 Gio |
| Secrets dans le diff | **aucun** (placeholders `staging.env.example` seulement) |
| Fichiers temporaires / données réelles | **absents** |

## Inventaire commits (origin/main..HEAD)

1. `33615ca` feat — outbox, consent, dry-run workers  
2. `cced722` feat — templates, consent capture, send guards  
3. `078a931` test — SQL harness + dry-run defer  
4. `2f265ca` docs — Lot 03B stack blocked  
5. `8f3876e` test — Lot 03C native Postgres  
6. `239e85b` fix — Lot 03D baseline guard + Deno harness  
7. `f68a5fb` docs — Lot 04A staging readiness  
8. `97fd5b9` test — Lot 04B SQL E2E + edge blocker  
9. `496ee63` fix — Lot 04C offline Edge + mock E2E  
10. `29993fb` fix — Lot 04D fail-closed + internal-only  
11.  docs/RC + kill switch fail-closed migration  

## Revue finale (synthèse)

### Migrations & marketplace

| Migration | Rôle |
|-----------|------|
| `20260514100000_require_marketplace_baseline.sql` | Garde : exige `categories`/`profiles`/`listings` (no-op si présents) |
| `20261017150000_lifecycle_email_p0.sql` | Tables prefs/suppressions/outbox/events/attribution + RPC |
| `20261017160000_lifecycle_email_p0_lot02_guards.sql` | Consent metadata strict, claim, dry-run defer |
| `20261017170000_lifecycle_email_kill_switch_fail_closed.sql` | Kill switch **ON** si flag absent |

Compatibilité prod : deltas **additifs** ; baseline marketplace hors repo (déjà en prod). Pas de rewrite Auth.

### Magic Link / Auth

- `signInWithOtp` / reset / Magic Link : **non modifiés**.
- `signUp` : metadata `marketing_opt_in` `'true'|'false'` seulement.
- Signup UI : checkbox **défaut false** ; emails Auth séparés dans le copy.

### RLS / RPC / métier

- Outbox, events, suppressions, flags : **service_role only**.
- Prefs : RLS own-row select/insert/update.
- Enqueue/revalidate : exige `marketing_opt_in IS TRUE`, pas unsub, pas suppression, pas frequency cap 7j, pas kill switch.
- Unsub : GET non mutatif ; POST applique.
- Webhook : signature Svix requise ; hard bounce → suppression.

### Transport Resend

- Défaut dry-run ; `ALLOW_LIVE` sans `TRANSPORT` → blocked.
- Mock : allowlist http interne ; `api.resend.com` refusé sous `ISOLATION=test`.
- Live : `TRANSPORT=live` + `LIVE_PROVIDER=true` + base exacte `https://api.resend.com`.

### Bundle

- `@supabase/supabase-js@2.99.3` · SHA-256 `9980b106…` (`shasum -c` OK sur RC).
- Rebuild : `scripts/prepare-lifecycle-edge-vendor.sh` (offline).

### Risque historique 04C

**Non démontrable** : sous dual-homing bridge+internal, DNS `api.resend.com` était résolvable ; pas de pcap. Clos par Lot 04D (réseau `--internal` seul + preuves DNS/egress). Documenté dans `docs/LIFECYCLE_EMAIL_P0_LOT04C.md` / `04D`.

## Tests (SHA RC)

| Contrôle | Résultat | Portée |
|----------|----------|--------|
| Vitest | **430+ PASS** | Local |
| `tsc --noEmit` | PASS | Local |
| `eslint .` | 0 error (1 warning préexistant hors périmètre) | Local |
| Bundle `shasum -c` | PASS | Local |
| Edge E2E 04D | PASS (preuves lot 04D ; non rejoué sans besoin Docker) | Local lab |
| Staging / prod distant | **NON VALIDÉ** | Distant |
| Email Resend réel | **NON APPLICABLE** | Interdit |
| Killcritic indépendant | **GO CONDITIONNEL** ([Killcritic RC Lifecycle](00bf69ba-eae5-4256-b272-0e2a313ed9d0)) | Revue |

## Secrets nécessaires (noms seulement)

| Secret | Usage |
|--------|-------|
| `LIFECYCLE_EMAIL_DISPATCH_SECRET` | Auth worker send (header) |
| `LIFECYCLE_EMAIL_HMAC_SECRET` | Liens unsub |
| `LIFECYCLE_RESEND_WEBHOOK_SECRET` | Svix webhook |
| `LIFECYCLE_RESEND_API_KEY` | Fournisseur (staging/test d’abord) |
| `LIFECYCLE_FROM_EMAIL` | From marketing (≠ Auth) |
| `SUPABASE_SECRET_KEYS` / service role staging | Edge admin client |
| Vault : `lifecycle_email_functions_url`, `lifecycle_email_dispatch_secret` | pg_net cron |

Voir `supabase/staging.env.example` — **aucune valeur** dans git.

## Confirmations produit

| Exigence | Statut |
|----------|--------|
| Kill switch ON par défaut | **Oui** (`'true'` + fail-closed si row absente) |
| Sans consentement marketing valable → 0 email promo | **Oui** (`DEFAULT false` + enqueue/revalidate `IS TRUE`) |
| Marketing ≠ Auth / Magic Link | **Oui** (pipeline et tags séparés) |

## Ordre de déploiement (après autorisations séparées)

1. Projet **staging** ≠ prod ; secrets staging.  
2. Baseline marketplace présente (garde 20260514).  
3. Migrations chronologiques jusqu’à `20261017170000`.  
4. Deploy EF avec `--no-verify-jwt` **sur les trois** (ou JWT service dans pg_net pour send).  
5. Kill ON ; `ALLOW_LIVE` absent/false ; `TRANSPORT=dry_run` ; `ISOLATION=test`.  
6. Smoke dry-run / unsub / webhook ; puis seulement GO send écrit.  
7. Prod : nouvelle autorisation + même checklist.

## Rollback

1. `UPDATE app_runtime_flags SET value='true' WHERE key='lifecycle_email_kill_switch';`  
2. Retirer `ALLOW_LIVE` / `LIVE_PROVIDER` ; `TRANSPORT=dry_run`.  
3. Unschedule cron enqueue/dispatch.  
4. Disable / undeploy EF.  
5. **Pas de DROP** urgent des tables lifecycle.  
6. Ne jamais pointer le rollback vers un autre projet cloud.

## Contrôles distants restants

- DNS / domaine From marketing Resend  
- Webhook Resend → URL staging/prod + secret Svix  
- pg_cron + vault sur projet cible  
- Vérifier `verify_jwt` aligné avec pg_net  
- Pilot destinataires contrôlés sous kill OFF + ALLOW_LIVE  

## GO / NO-GO

| Action | Verdict |
|--------|---------|
| **Ouvrir PR** (push branche + `gh pr create`) | **GO CONDITIONNEL** — attendre GO explicite utilisateur |
| Merge | **NO-GO** sans revue CI + approbation |
| Migration / deploy distant | **NO-GO** |
| Email réel / activation campagne | **NO-GO** |

---

## Texte de PR (prêt à publier)

```markdown
## Summary

- Lifecycle Email P0 : outbox PostgreSQL, consentement marketing (défaut opt-out), 3 campagnes (welcome / first listing H+24 / abandoned draft H+24), Edge Functions send/unsub/webhook, kill switch ON par défaut (fail-closed).
- Transport Resend fail-closed (`dry_run` | `mock` | `live`) ; isolation lab 04D sans egress ; bundle supabase-js offline versionné.
- UI : checkbox signup + prefs settings ; aucun changement Magic Link / Auth Resend.

## Test plan

- [x] Vitest 430+ / typecheck / lint (0 error) sur SHA RC
- [x] Contrats SQL/Edge + providerTransport
- [x] Preuves locales Lots 03–04D (SQL + Edge Runtime mock)
- [ ] CI GitHub sur la PR
- [ ] Staging : migrations + EF `--no-verify-jwt` (3 fonctions) + dry-run smoke
- [ ] GO send écrit avant `ALLOW_LIVE` / kill OFF

## Deploy notes

Migrations (ordre) :
1. `20260514100000_require_marketplace_baseline.sql`
2. `20261017150000_lifecycle_email_p0.sql`
3. `20261017160000_lifecycle_email_p0_lot02_guards.sql`
4. `20261017170000_lifecycle_email_kill_switch_fail_closed.sql`

Secrets : voir `supabase/staging.env.example` (aucune valeur dans le repo).
Rollback : kill switch ON → ALLOW_LIVE off → unschedule cron → disable EF.

## Hors scope (cette PR)

Push/merge/deploy/migrate distant/email réel — **uniquement après GO explicite séparé**.
```
