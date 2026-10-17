# Lifecycle Email P0 — Discovery & contrats

**Branche :** `feat/lifecycle-email-p0` (depuis `origin/main`).  
**Périmètre :** implémentation locale uniquement. Pas de push, migration distante, cron distant, DNS, déploiement ni email réel.

## Niveau & skills

- Niveau : **L4** (email marketing, PII, webhooks, secrets).
- Skills : orchestrator, discovery, architect, security, build, qa-gate, killcritic.
- `AGENTS.md` / `.tsk` : absents du dépôt ; politique QA lue depuis `~/.agents/skills/policies/QA_POLICY.md`.

## Problème

Activer 3 campagnes lifecycle (welcome, première annonce H+24, brouillon abandonné H+24) avec consentement, exclusions, fréquence, outbox idempotente et isolation des emails Auth.

## Périmètre

| IN | OUT |
|----|-----|
| Migrations additives locales | Appliquer en prod / staging distant |
| Edge Functions + mocks Resend | Envoi Resend réel |
| Prefs / unsub / suppressions / kill switch | UI settings marketing complète (opt-in UI minimale hors P0 code path) |
| Conversion via événements DB | Attribution Mixpanel comme SoT |
| CTA HTTPS web | Changement Magic Link / Auth Resend |

## Hypothèses (non faits)

| ID | Hypothèse | Impact si fausse |
|----|-----------|------------------|
| H1 | « Jamais publiée » = aucun `listings.last_published_at IS NOT NULL` pour l’user | Première annonce mal ciblée |
| H2 | Brouillon abandonné = `status = draft` et `updated_at <= now()-24h` | Trop / pas assez d’emails draft |
| H3 | Consentement marketing = `email_preferences.marketing_opt_in = true` (défaut false) | Légal / volume |
| H4 | CTA sell n’est pas un Universal Link vérifié → désactivé en dry-run / test send | CTA manquant en test |
| H5 | Domaine from marketing distinct de Auth (secret `LIFECYCLE_FROM_EMAIL`) | Collision délivrabilité Auth |

## Contrats de données

- `email_preferences` : 1 ligne / user ; owner RLS select/update ; défaut opt-in **false**.
- `email_suppressions` : service_role only ; bloque tout enqueue/send.
- `lifecycle_email_outbox` : UNIQUE `(user_id, campaign_id, occurrence_key)` ; claim `FOR UPDATE SKIP LOCKED`.
- `lifecycle_email_events` : audit append-only service_role.
- `email_attribution_sessions` : clic signé → conversion DB.
- `app_runtime_flags.lifecycle_email_kill_switch` : si `true`, aucun claim/send.

## Campagnes

| ID | Éligibilité | occurrence_key | Conversion DB |
|----|-------------|----------------|---------------|
| `welcome_h0` | opt-in + email + !banned + !suppressed ; compte créé | `''` | — |
| `first_listing_h24` | idem + `created_at <= now()-24h` + jamais publié | `''` | `last_published_at` set |
| `abandoned_draft_h24` | idem + draft `updated_at <= now()-24h` | `listing_id` | draft → published |

Fréquence : **≤ 1 email marketing `sent` / user / 7 jours** (enqueue + revalidation send).

## AC (Given / When / Then)

1. Given opt-in false, When enqueue, Then 0 row welcome.
2. Given opt-in true + eligible, When enqueue welcome, Then 1 row pending ; second enqueue → 0 insert (idempotence).
3. Given kill switch true, When claim, Then 0 rows.
4. Given hard_bounce suppression, When send revalidate, Then skipped.
5. Given Resend timeout après requête incertaine, When complete, Then status `uncertain` et pas de retry auto.
6. Given webhook signature invalide, When POST webhook, Then 401 et pas de mutation.
7. Given unsub signé, When GET/POST unsub, Then opt-in false + audit event.
8. Given Magic Link / signup / reset sources Auth, When grep lifecycle, Then aucun import Auth Resend modifié.

## Lot 02 (consentement minimal + templates + routes HTTPS)

- Templates FR brandés + label **Communication marketing** (jamais Auth).
- Routes HTTPS + fallback web ; scheme `youmbiamobile://` hors HTML email.
- Capture consentement : checkbox signup (défaut off) + switch Paramètres.
- `email_preferences` typé côté client ; opt-in uniquement explicite.

## Garde-fous post-killcritic

- Kill switch défaut **`true`** (migration).
- Send : live uniquement si `LIFECYCLE_EMAIL_ALLOW_LIVE=true` ; sinon dry-run → `defer_lifecycle_email_after_dry_run` (pending + schedule +100y, pas de boucle).
- Unsub : **GET = page** (pas de mutation) ; **POST = apply**.
- Deploy Edge publics : `--no-verify-jwt` à documenter au GO staging (non versionné ici).
- Lot 03 : preuves SQL locales via `./scripts/run-lifecycle-p0-sql-integration.sh` (stubs ≠ cloud).

## Contrat de contrôle QA (avant exécution)

| Contrôle | Statut |
|----------|--------|
| Vitest lifecycle (unit + contract) | REQUIS |
| Vitest auth deep link existant (non-régression lecture) | REQUIS si fichiers non touchés → smoke test suite |
| `npm run typecheck` | REQUIS |
| `npm run lint` | REQUIS (sur fichiers touchés / suite) |
| Email Resend réel | NON APPLICABLE (interdit) |
| Migration distante / DNS / push | NON APPLICABLE (interdit) |
| Empreinte `.tsk/scripts/tested_state.sh` | NON APPLICABLE (outil absent) → empreinte `git write-tree` + HEAD |
| Killcritic | REQUIS (revue critique fin de cycle) |
