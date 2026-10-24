# YOUMBIA Push P0/P1 — readiness infrastructure QA

Date de contrôle : 24 octobre 2026 (Europe/Paris)  
Branche : `feat/ymb-transactional-push-p0-p1`  
HEAD de départ : `fd3188be600b415b50c14bc76ac41ea078922ac1`  
Production Supabase : `ainzxommczlyjhymuwgu`, consultée en lecture seule stricte.

## Verdict

**NO-GO build QA distant pour l'instant.** La configuration mobile locale est prête après correction des deux profils QA vers l'identifiant `.dev`, les garde-fous passent et le quota EAS Free permet encore 3 builds Android et 7 iOS. Aucun projet Supabase QA ni EAS QA indépendant n'existe dans les comptes accessibles, et les profils restent volontairement bloqués par le placeholder d'UUID EAS. Firebase QA et credentials iOS dans le projet EAS indépendant ne sont pas configurés.

Aucun projet distant, variable, credential ou appareil n'a été créé/modifié. Aucun build EAS, token réel, notification réelle, merge ou publication n'a été effectué.

## Coût et décision Supabase

Une seule organisation Supabase est visible via le connecteur : `TESKA SAS`, plan Pro, trois projets actifs. Les projets nommés `YOUMGO` et `anivia` ont des schémas métier distincts et ne sont pas des environnements YOUMBIA QA. Aucun des trois n'a été modifié.

| Option | Estimation et contraintes | Évaluation |
|---|---|---|
| A. Organisation Free séparée | $0 tant que les limites Free sont respectées. L'entitlement annoncé est de deux projets Free actifs à travers les organisations où l'utilisateur est Owner/Admin. Quotas : 500 MB DB/projet, 5 GB egress, 1 GB Storage, 500 000 Edge Function invocations, 50 000 MAU, 2 M messages Realtime et 200 connexions Realtime de pointe. Un projet peu actif peut être mis en pause après 7 jours. Les backups automatiques téléchargeables ne sont pas disponibles sur Free. | **Choix recommandé sous réserve de droits/quota** : le plus économique, projet indépendant et URL distante HTTPS adaptée aux appareils/EAS. Le connecteur ne voit qu'une organisation Pro; il ne prouve ni le rôle Owner/Admin, ni le quota Free restant, ni la permission de créer une organisation. La documentation officielle autorise plusieurs organisations Free séparées et agrège leur quota de projets au niveau Owner/Admin. |
| B. Micro additionnel dans l'organisation Pro | Le devis du connecteur Supabase pour un projet dans TESKA SAS est de **$10/mois**. Le tarif public de référence est $0.01344/h, environ $9.81 pour 730 h. Le crédit Pro de $10 couvre un seul Micro dans l'organisation; les autres usages/add-ons peuvent s'ajouter. Le devis reste une estimation sans création de projet ni engagement de dépense. | Fiable, mais payant et donc non autorisé par la mission. |
| C. Supabase local | $0 de plateforme, mais l'accès appareil nécessite VPN/TLS ou réseau local sécurisé, disponibilité de l'hôte et connectivité stable. Le garde actuel accepte exclusivement une URL Supabase `https://<ref>.supabase.co`. Le conteneur local visible a un marqueur de projet différent de celui du banc E2E; ne pas le réutiliser. | Pas prêt et pas compatible tel quel avec le profil EAS distant. Une exposition par tunnel sans validation TLS/réseau ne serait pas acceptable. |

Sources : [limites et facturation Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase), [pause Free après faible activité](https://supabase.com/docs/guides/platform/free-project-pausing), [tarif compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute).

## Ressources et configuration

| Contrôle | État observé | Readiness |
|---|---|---|
| Supabase | Organisation visible `TESKA SAS` Pro; 3 projets actifs, aucun QA YOUMBIA dédié. Production `ainzxommczlyjhymuwgu` non modifiée. | À créer après décision d'org Free/droits et GO de provisionnement. |
| Baseline et migrations | Le rapport E2E qualifie une baseline représentative sourcée au ref Web `c0de541`; 33 deltas passent sur cette baseline locale, et l'upgrade avec comptes/données fictifs conserve les lignes vérifiées. La baseline n'est pas un export certifié complet de l'historique Web/production. | PASS pour le banc E2E documenté; STOP avant déploiement distant tant que l'équipe n'a pas qualifié la baseline complète et ses exclusions. Aucune reconstruction approximative. |
| Expo EAS | Compte `tommyska`, plan Free. Projets visibles : `youmbia-mobile` et `anivia`; pas de `youmbia-mobile-qa`. Le seul UUID configuré dans le dépôt est l'UUID EAS production. | QA EAS indépendant manquant; placeholder bloquant laissé en place dans les profils. |
| Variables EAS | Dans le projet actuel, `development` global et `preview` ont une URL Supabase production; le projet a également une variable `GOOGLE_SERVICES_JSON` sur production/preview. Valeurs non reproduites ici. | Ne pas utiliser pour la QA. N'ajouter les seules valeurs QA que dans le nouveau projet. |
| Android/Firebase | La console Firebase accessible liste un seul projet, `YOUMBIA`, sans projet QA visible. Le projet EAS actuel n'a que l'identifiant Android production. Aucun JSON n'a été téléchargé ou affiché. | Projet Firebase QA et application Android `com.youmbia.mobile.dev` à créer; générer un fichier QA et le valider contre projectId/package avant de le téléverser. |
| iOS/Apple | Le compte Apple Developer liste les App IDs `com.youmbia.mobile` et `com.youmbia.mobile.dev`. Le projet EAS actuellement lié à la production possède pour `.dev` un profil de provisioning valide et une Push Key enregistrée; ils ne configurent pas un projet EAS QA indépendant. La fiche Apple détaillée de capacité Push n'a pas fini de charger, donc cette capability reste non prouvée. | Réutiliser l'App ID `.dev` si Push Notifications est activé; créer/configurer une identité de signature et des credentials au sein du nouveau projet EAS QA. Toute création de clé/provisioning devra être faite manuellement dans Apple/EAS après autorisation. |
| Identifiants natifs locaux | Les deux profils QA résolvent vers `com.youmbia.mobile.dev` pour Android/iOS; leurs schemes restent `youmbiamobile-dev` et `youmbiamobile-qa`. La production reste `com.youmbia.mobile`. | PASS après correction locale dans ce commit. |

## EAS Build : quota vérifié

Le dashboard Expo visible le 24 octobre indique le plan Free à $0/mois, un plafond de 15 builds Android et 15 iOS, 20/30 utilisés : Android 12/15 et iOS 8/15. Restant : **3 Android, 7 iOS** pour le cycle affiché. L'usage Free ne déclenche pas d'overage : à quota épuisé, les builds sont indisponibles jusqu'au reset mensuel, sauf changement de plan ou build local. Le quota est au compte EAS et pas encore consommé par cette mission.

[Dashboard Billing Expo](https://expo.dev/accounts/tommyska/settings/billing) · [documentation des plans EAS](https://docs.expo.dev/billing/plans/) · [FAQ sur l'épuisement du quota Free](https://docs.expo.dev/billing/faq/).

## Sécurité, SQL et tests

Les profils QA n'incluent pas les valeurs Supabase de production et refusent une URL production, un ref incohérent, un UUID EAS partagé, des variables manquantes ou un projet Firebase/package incorrect. Le fichier Google Services est contrôlé sans imprimer son contenu. Les schemes/domains associés à la production ne sont pas attachés aux variantes QA.

Vitest a été rejoué sur l'arbre de travail basé sur le SHA attendu, avec les corrections QA locales de ce rapport : **71 fichiers / 525 tests PASS**. `npm run typecheck` : PASS. `npm run lint` : exit 0, deux avertissements préexistants (script de previews lifecycle et `Array<T>` dans `avatarImageUrl.ts`). Le test SQL/RLS n'a pas été rejoué : l'instance E2E documentée était arrêtée et le conteneur local trouvé porte un autre marqueur. Le précédent rapport SQL/E2E (commit `76f0f70`) couvre 33 deltas, rôles/Auth/RLS natifs et upgrade fictif; la comparaison Git confirme que `supabase/` n'a pas changé depuis ce commit. La preuve n'est pas celle d'un projet cloud ni d'une baseline complète.

Apple portal : l'App ID `.dev` existe, mais la page détaillée de capacité Push a bloqué sur un chargement sans fin. Firebase : seul le projet nommé YOUMBIA est visible, pas de projet QA. Aucun secret, clé privée, contenu du Google Services JSON ou clé APNs n'est inclus dans ce rapport.

## Actions requises avant GO build QA

1. Vérifier avec un Owner/Admin que le compte a un projet Free disponible et le droit de créer une organisation Free distincte; sinon soumettre l'option Pro à une validation explicite de coût. Ne créer aucun projet avant GO de provisionnement.
2. Créer une organisation/projet Supabase QA dédié YOUMBIA si l'option Free est confirmée. Déployer seulement après revue de la baseline Web complète et des exclusions; recréer comptes/données fictifs, RLS, triggers, outbox, Edge Functions, scheduler OFF, Vault et secrets QA. Refuser tout lien/service/secret de production.
3. Créer le projet EAS indépendant `youmbia-mobile-qa`, remplacer les deux placeholders d'UUID localement puis configurer ses variables `development`/`preview` avec l'URL/ref/anon key QA uniquement. Ne pas éditer les variables du projet `youmbia-mobile`.
4. Créer un Firebase QA et enregistrer `com.youmbia.mobile.dev`; produire le JSON QA et fournir le FCM credential dans le seul projet EAS QA. Vérifier le projectId et le package avec le garde local.
5. Confirmer la capability Push de l'App ID Apple `.dev`; configurer dans le projet EAS QA la signature iOS et APNs, sans modifier les credentials du projet production. Une nouvelle Apple Push Key ou un provisioning profile exige une action manuelle et un consentement de l'Owner Apple.
6. Confirmer `QA_PUSH_CREDENTIALS_VERIFIED=true` après contrôles FCM et APNs, puis relancer tests/config statiques et vérifier `eas config` des deux plateformes sur le projet QA.
7. Garder les builds en attente d'un GO distinct, vérifier le quota EAS restant le jour du build et connecter les appareils Android/iOS dédiés. Aucun token ni push réel avant ce GO.

Référence technique : [qa-infrastructure.md](./qa-infrastructure.md), [préflight physique](./physical-qa-preflight.md), [rapport E2E Supabase](./supabase-isolated-e2e.md).
