# EMAIL-UX-V2 — Recette d'intégration (QA, 2026-11-09)

## Statut
**PR #36 en draft, NO-GO merge/deploy/envoi.** Audit de la branche et de Supabase en lecture seule ; aucun email réel, aucune mutation Supabase, aucun flag modifié.

## Préflight factuel
| Contrôle | Résultat |
| --- | --- |
| GitHub PR #36 vs main | Draft, mergeable, CI à lire sur dernier SHA |
| Production Edge | `send-lifecycle-email` v14 ACTIVE (non modifiée) |
| Renderers Edge et Mobile | Identiques ; nouveau footer + unsub v14 |
| Marketing flags | `lifecycle_marketing_campaigns_enabled=true`, `lifecycle_campaign_weekly_discovery=true`, kill switch false : **attention envoi automatique si déployé sans gate** |
| Listing images | 1197 enregistrements, 1197 clés d'objets Storage correspondant au bucket public `listing-images` |
| Annonces actives publiées | 429, 427 avec image |
| Images des 3 annonces les plus récentes | 3/3 objets Storage référencés |
| Champs `listing_images.url` | Tous chemins relatifs, pas des URLs HTTPS absolues |
| Correction QA | Résolution via `admin.storage.from('listing-images').getPublicUrl(objectKey)` avec validation stricte des segments |
| Route destination fiche Web | `app/(main)/(public)/annonce/[id]/page.tsx` présente sur GitHub |
| Badges store et logo officiels | Fichiers présents : `public/brand/app-store-badge.png`, `google-play-badge.png`, `web-header-logo-1600x400.png` |
| HTML responsive | Tables + inline CSS ; header sans marges négatives |
| Consentement / unsubscribe | Fonctions d'envoi et contrôle consentement inchangés ; lien de désinscription de Production v14 conservé |
| Messagerie acheteur | Pas de nouvel envoi, pas de nouveau trigger |
| Live HTTP des assets, Gmail/Outlook/Apple Mail | NON attesté par cette QA |
| Tests emails réels Resend | NON effectués |

## Risques bloquants avant Production
1. **Les flags marketing sont déjà ON.** Si `send-lifecycle-email` est déployée, le cron peut utiliser immédiatement les nouvelles versions : exiger plan de gel/rollback et une fenêtre de validation d'envoi, pas de simple "deploy function".
2. L'application du design à l'ensemble des emails dépend de la qualité des images publiques, des petits écrans et des URLs App Store / Google Play. Effectuer la recette réelle sur boîtes de test autorisées, et sur Outlook.
3. Les previews HTML locales ne prouvent pas la compatibilité Outlook/Apple Mail ; tester les clients réels, images désactivées et dark mode.
4. Le champ `listing_images.url` contient une clé d'objet relative et le bucket est public. La conversion est réalisée dans la PR, pas dans Production.
5. Le texte brut conserve le format historique, sans photo ni prix : contrôle contenu/texte selon exigences d'accessibilité et cohérence.
6. La branche Mobile n'inclut pas les modifications Auth Web/Supabase Auth, ni un nouveau flux email « message acheteur ». Périmètre à ne pas confondre avec les 5 maquettes Stitch.

## Sortie QA attendue avant GO deploy
- CI dernier SHA PASS (lint, TS, Vitest, Expo Doctor)
- Test Edge en QA / staging ou preview isolée + vérification `imageUrl` construit depuis Storage
- Au moins 1 vrai email sur boîte autorisée pour chacun des scénarios prioritaires ; aucune diffusion marketing collective
- Vérifier l'affichage sur Gmail/Outlook/Apple Mail, responsive 320/375 px, alt images, CTA, texte brut et désinscription
- Valider route Web produit, les deux fiches Store et les badges image HTTP 200
- Fenêtre de déploiement : consent/cap vérifiés, garde envoi de masse, plan rollback, approbation explicite

**Décision :** GO pour la QA complémentaire contrôlée, NO-GO mise en production tant que ces preuves manquent.
