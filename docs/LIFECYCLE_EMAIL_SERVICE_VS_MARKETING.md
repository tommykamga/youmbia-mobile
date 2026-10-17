# Lifecycle Email — Service vs Marketing

**Branche :** `feat/lifecycle-service-vs-marketing`  
**Base :** `main` (PR #18).  
**Migration :** `20261017220000_lifecycle_service_vs_marketing.sql`  
**Déploiement production :** **NON** inclus dans cette PR (qualification + CI d’abord).

## Killcritic — décision brouillon

| Campagne | Canal | Motif |
|----------|-------|-------|
| `welcome_h0` | **service** | Strictement lié à la création de compte ; pas d’opt-in marketing. |
| `first_listing_h24` | **marketing** | Inchangé (`marketing_opt_in` obligatoire). |
| `abandoned_draft_h24` | **marketing** (conservé) | Info préalable / base juridique pour un rappel **service** sans opt-in **non documentées**. Opposition draft préparée ; activation service = chantier séparé. |

## Règles avant / après

| Règle | Avant (P0) | Après |
|-------|------------|-------|
| Welcome + opt-in | Requis | **Non requis** (service) |
| Welcome rétroactif | Possible pour tout compte éligible marketing | **Interdit** (`created_at >= lifecycle_service_cutoff`) |
| Welcome déjà `sent` | Idempotent UNIQUE | **Inchangé** (jamais renvoyé) |
| First listing | marketing_opt_in | **Inchangé** |
| Abandoned draft | marketing_opt_in | **Inchangé** + cutoff `listings.created_at` + `optional_draft_reminders_opt_out` |
| Cap 7 jours | Tous les `sent` lifecycle | **Uniquement** campagnes `channel=marketing` |
| Suppression `unsub` | Bloque tout | Bloque marketing ; **pas** welcome service (hard only) |
| Kill switch | Fail-closed | **Inchangé** (non basculé par cette migration) |
| Consentements historiques | — | **Jamais forcés** à `true` |

## Cutoff

Flag `app_runtime_flags.lifecycle_service_cutoff` = horodatage UTC figé à l’application de la migration.  
Fonction : `lifecycle_email_service_cutoff()`.

## Préférence draft

Colonne `email_preferences.optional_draft_reminders_opt_out` (défaut `false`).  
RPC `apply_lifecycle_draft_reminders_opt_out` + Edge unsub `?scope=draft_reminders`.  
N’écrit **pas** `marketing_opt_in=true` et n’ajoute pas de suppression `unsub` hard.

Pour `abandoned_draft_h24` :
- **List-Unsubscribe** + lien principal → désinscription **marketing globale** (`scope=marketing`).
- Lien distinct « Arrêter les rappels de brouillon » → opposition spécifique (`scope=draft_reminders`).

## Confirmation d’adresse (welcome service)

`auth.users.email_confirmed_at IS NOT NULL` requis à l’enqueue et à la revalidation.  
Raison skip : `email_not_confirmed`. Évite de confirmer un compte actif à une adresse non vérifiée.

## Tags Resend

- Welcome : `category=service`, `channel=service`
- Autres : `category=marketing`, `channel=marketing`
- Jamais `auth` / `transactional` / `magic_link`

## QA (miroirs TS + contrat SQL)

Voir `campaigns.test.ts`, `emailCategory.test.ts`, `renderLifecycleEmail.test.ts`, `lifecycleEmail.contract.test.ts`.

## Risques résiduels

1. Cutoff figé au moment du `db push` prod — à appliquer **une seule fois** lors du GO.
2. Brouillon reste marketing jusqu’à validation juridique explicite.
3. `apply_lifecycle_unsubscribe` continue d’écrire `email_suppressions(reason=unsub)` pour le marketing (welcome service ignore `unsub` via hard suppressions).
