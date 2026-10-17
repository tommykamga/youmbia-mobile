# Prévisualisations Lifecycle Email P0

HTML générés par le **même moteur** que l’envoi Edge (`renderLifecycleEmail` / `_shared/lifecycleTemplates.ts`).

| Fichier | Campagne |
|---------|----------|
| `01-welcome.html` | Bienvenue |
| `02-first-listing.html` | Première annonce |
| `03-abandoned-draft.html` | Brouillon abandonné |
| `*-mobile.png` / `*-desktop.png` | Captures navigateur |

Slogan : « Achetez. Vendez. En confiance. »  
Logo : `https://www.youmbia.com/brand/youmbia-logo-header.svg` (HTTP 200).  
CTA HTTPS : `https://www.youmbia.com/` (pas `/annonce/{id}` pour brouillon — reprise = app `/sell?draftId=`).

## Envoi test Resend (isolé)

**Statut session :** non envoyé — aucune clé `RESEND` / `LIFECYCLE_RESEND` dans l’environnement agent ni `.env` local.

Étapes pour envoyer 3 previews (sans kill switch / sans outbox) :

1. Fournir une clé API Resend de **test** (ou staging) via variable d’env locale non commitée : `RESEND_API_KEY`.
2. Confirmer domaine From vérifié (ex. `mail.youmbia.com`) ou utiliser le domaine de test Resend.
3. Fournir 1–N adresses de réception **autorisées** (boîtes de l’équipe).
4. Script isolé : `scripts/send-lifecycle-template-previews.mjs` (à lancer manuellement avec les env).

Ne pas désactiver le kill switch campagne.
