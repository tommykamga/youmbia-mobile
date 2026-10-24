# YOUMBIA Push P0/P1 — infrastructure QA isolée

État local contrôlé le 24 octobre 2026 sur `feat/ymb-transactional-push-p0-p1`. Aucun projet Supabase/EAS, variable distante, credential, build ou envoi n'a été créé ou modifié. Le rapport de readiness daté est dans [qa-build-readiness-2026-10-24.md](./qa-build-readiness-2026-10-24.md).

## Options de coût et de réseau

L'audit de l'organisation confirme trois projets actifs dans `TESKA SAS` (Pro). Le connecteur Supabase a renvoyé un devis de $10/mois pour un projet dans TESKA SAS. Le prix public de référence est $0.01344 par heure Micro, environ $9.81 pour 730 heures; le crédit compute Pro de $10/mois couvre un seul Micro dans l'organisation. Le devis est une estimation, peut exclure les autres usages et add-ons, et ne constitue pas une autorisation de dépense. Aucun projet n'a été créé.

| Option | Coût projeté | Isolation et limites | Verdict |
|---|---:|---|---|
| A. Organisation Supabase Free distincte | $0 dans les quotas Free | Projet distinct et URL HTTPS compatible EAS. Limite de deux projets Free actifs sur le compte pour les rôles Owner/Admin; 500 MB DB, 5 GB egress, 1 GB Storage, 500k appels Edge Functions, 50k MAU, 2M messages Realtime. Pause possible après 7 jours de faible activité; pas de sauvegardes automatiques téléchargeables. Les droits et le quota restant du compte ne sont pas exposés par le connecteur, qui ne liste que l'organisation Pro actuelle. | **Recommandée sous réserve** d'un Owner/Admin et d'un quota Free disponible. La documentation permet plusieurs organisations Free distinctes; le plafond s'applique à travers ces organisations. |
| B. Projet Micro supplémentaire dans `TESKA SAS` Pro | ~$9.81/mois pour 730 h, marginal estimé | Bonne isolation de projet et disponibilité sans pause automatique. Facturation compute horaire; usages dépassant les quotas inclus et add-ons sont en sus. Le tarif exact dépend de l'organisation et son estimation n'est pas encore confirmée. | Techniquement solide, mais non autorisée car payante. |
| C. Supabase local | $0 de plateforme | Le banc E2E local n'est pas un backend distant de recette. Les appareils exigent un accès privé stable avec TLS/VPN et le garde actuel exige une URL `<ref>.supabase.co`. Le conteneur Supabase actif observé a un autre marqueur de projet et n'a pas été réutilisé. | Pas fiable/prêt tel quel pour builds EAS et appareils physiques. |

Les limites Free et l'isolation par organisation sont décrites par [Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase); la pause après 7 jours est documentée dans [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing). Le prix Micro et le crédit Pro sont dans [Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute). L'option A est l'option la moins coûteuse compatible si les droits Free du compte le permettent. Ne pas utiliser les projets `YOUMGO` ou `anivia` pour YOUMBIA QA.

## Décision d'isolation

Le projet EAS actuellement lié à l'application est `2869afc2-e13f-48b5-8e78-acbe5186934c`. Les environnements `development` et `preview` de ce projet pointent tous deux vers Supabase production. Ils ne peuvent donc pas servir à la recette.

La liste Supabase donne trois projets actifs dans l'organisation Pro `TESKA SAS` : production `Youmbia`, `YOUMGO` et `anivia`. Les deux autres ne sont pas des environnements YOUMBIA QA : leurs métadonnées de schéma portent sur transport (agences, bus, réservations) et santé animale (dossiers et événements de santé). Ils ont des données et des schémas indépendants. Aucun d'eux ne doit être réutilisé ou réinitialisé pour cette recette. Seuls les noms, migrations, schémas, RLS et nombres de lignes agrégés ont été lus ; aucune ligne métier n'a été consultée.

Supabase indique que chaque projet actif a son propre compute. Sur le plan Pro, le crédit de 10 USD couvre un projet Micro/Nano. Le devis du connecteur pour un projet dans TESKA SAS est de 10 USD/mois; le coût final varie selon les heures, le compute choisi et les éventuels dépassements de quotas ou add-ons. [Tarifs compute Supabase](https://supabase.com/docs/guides/platform/manage-your-usage/compute) · [Facturation Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase).

Lecture du dashboard Expo le 24 octobre 2026 : compte `tommyska` sur Free, 20/30 builds consommés (12 Android, 8 iOS), soit 3 Android et 7 iOS restants. Le dashboard annonce $0 et le plan Free bloque les builds supplémentaires jusqu’au prochain reset plutôt que de facturer un dépassement. Aucun projet QA distant n'a été provisionné. [Plans EAS](https://docs.expo.dev/billing/plans/) · [FAQ de facturation EAS](https://docs.expo.dev/billing/faq/).

## Variantes locales et garde-fous

| Profil | Environnement EAS | Identifiants Android/iOS | Schéma URL | Projet Supabase | Projet EAS |
|---|---|---|---|---|---|
| `development` | `development` | `com.youmbia.mobile.dev` | `youmbiamobile-dev` | Projet QA HTTPS distinct | Projet EAS QA distinct |
| `preview` | `preview` | `com.youmbia.mobile.dev` | `youmbiamobile-qa` | Même projet QA dédié | Même projet EAS QA dédié |
| `production` | `production` | `com.youmbia.mobile` | `youmbiamobile` | Production existante | Projet existant inchangé |

`app.config.js` utilise ces variantes et enlève les domaines universels de production des builds QA. Le projet QA EAS doit avoir le slug `youmbia-mobile-qa`; son ID s'obtient après sa création et remplace `SET_AFTER_QA_EAS_PROJECT_CREATION` dans les deux profils QA. Le garde refuse le build tant que l'ID manque, est invalide ou égale à l'ID EAS de production. Cette séparation place aussi les credentials push QA dans un projet EAS dédié, sans toucher aux credentials push du projet lié à la production.

Le garde de configuration dynamique refuse un profil EAS non reconnu, les environnements `APP_ENV` incohérents, un ref Supabase égal à la production, un URL qui ne correspond pas au ref, une clé anon absente, une attestation push absente ou un ID EAS de production. `eas.json` fixe explicitement les environnements EAS et le profil attendu. Le code production garde le slug, les identifiants, le schéma et l'ID EAS actuels.

Pour Android, `eas-build-pre-install` vérifie le JSON Google Services après matérialisation du fichier EAS : projet Firebase QA attendu, différent du projet Firebase de production, et client dont le package correspond exactement au build `.dev` ou `.qa`. Le fichier doit contenir les deux clients QA si un même fichier est utilisé par les deux profils. Aucun Google Services de production ne satisfait ces noms de package.

Les variables publiques Supabase, `YOUMBIA_EAS_PROJECT_ID`, les deux IDs Firebase et `QA_PUSH_CREDENTIALS_VERIFIED` doivent être visibles à la résolution de la configuration EAS (plaintext ou sensitive, jamais de type `secret` pour celles consommées par `app.config.js`). `EXPO_PUBLIC_SUPABASE_ANON_KEY` est une clé cliente publique. `GOOGLE_SERVICES_JSON` reste une variable de type File. La valeur `QA_PUSH_CREDENTIALS_VERIFIED=true` est une attestation non secrète : ne la renseigner dans EAS QA qu'après vérification manuelle de FCM et d'APNs pour les identifiants QA. Elle ne prétend pas lire les credentials EAS elle-même.

Les schemes et routes QA sont isolés (`youmbiamobile-dev`, `youmbiamobile-qa`). Le callback Supabase doit autoriser les deux schemes QA dans le projet QA. L'application de production conserve `youmbiamobile`. Les associated domains et intent filters de production ne sont pas attachés aux variantes QA tant qu'un domaine QA vérifié n'est pas disponible.

Sources Expo : [variables EAS pendant la résolution de la configuration](https://docs.expo.dev/eas/environment-variables/usage/) · [variables de fichier Google Services](https://docs.expo.dev/eas/environment-variables/faq/).

## Variables attendues dans le projet EAS QA

Créer les variables dans `development` et `preview` du **nouveau projet EAS QA**, jamais dans le projet EAS de production :

```text
APP_ENV                         fourni par eas.json
EXPO_PUBLIC_APP_ENV             fourni par eas.json
YOUMBIA_EAS_BUILD_PROFILE       fourni par eas.json
YOUMBIA_EAS_PROJECT_ID          fourni par eas.json après création du projet EAS QA
EXPO_PUBLIC_SUPABASE_URL        https://<QA_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_PROJECT_REF <QA_REF> (20 caractères)
EXPO_PUBLIC_SUPABASE_ANON_KEY   clé publishable/anon du projet QA
QA_PUSH_CREDENTIALS_VERIFIED    true, seulement après contrôle manuel FCM + APNs
GOOGLE_SERVICES_JSON            variable File, Android, projet Firebase QA
QA_FIREBASE_PROJECT_ID          identifiant public du projet Firebase QA
YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID identifiant public production à comparer
```

Le helper vérifie le ref, l'URL et la présence de la clé. Sur Android, le script de pré-install vérifie le projet et le package dans le JSON. Les IDs Firebase de comparaison sont des identifiants de projet, pas des credentials.

## Procédure manuelle après décision infrastructure

1. Dans Supabase, choisir l'organisation et vérifier le coût/usage réel. Créer un projet distinct de production, données fictives seulement, ou suspendre l'opération si le coût n'est pas accepté. Un branch Supabase dérivé de production est une option seulement après revue : il réapplique l’historique de migrations et n’importe pas les données, mais ne prouve pas à lui seul que la baseline mobile est reproductible; il peut aussi entraîner du compute facturé à l’heure.
2. Déployer sur le projet Supabase QA une baseline YOUMBIA compatible avec les 33 deltas, puis appliquer migrations, fonctions et secrets serveur QA. Vérifier RLS, flags OFF et URL. Ne jamais utiliser `--linked` vers production; garder le projet QA explicitement sélectionné par son ref. Utiliser le manifeste et la baseline sourcée de `supabase/tests/e2e/README.md` comme guide, avec revue des écarts de baseline avant migration distante.
3. Configurer les URL de callback de `youmbiamobile-dev://**` et `youmbiamobile-qa://**` sur Supabase QA et valider les fonctions Edge QA. Aucune clé service_role ne va dans l'application.
4. Créer un projet EAS distinct de production, slug `youmbia-mobile-qa`; reporter son UUID dans `YOUMBIA_EAS_PROJECT_ID` des deux profils. Configurer ses variables par environnement. Ne pas changer l'ancien projet EAS, dont les variables `development` et `preview` restent liées à la production.
5. Dans un Firebase de test distinct, enregistrer `com.youmbia.mobile.dev` (commun aux profils `development` et `preview`), générer le `google-services.json` QA, puis téléverser ce fichier au projet EAS QA. Ne pas réutiliser le fichier Firebase production.
6. Dans le projet EAS QA et le compte Apple approprié, configurer les credentials push FCM de test, l'App ID et le provisioning iOS QA avec Push Notifications/APNs. Confirmer le bundle `.dev`, le team Apple, la signature interne et le callback. Ne jamais remplacer des credentials du projet EAS production. Une console Apple/Firebase est nécessaire pour cette étape; aucune credential n'a été lue ou modifiée ici.
7. Après vérification manuelle des deux plateformes, définir `QA_PUSH_CREDENTIALS_VERIFIED=true`. Avant tout build ultérieur, lancer `eas config` avec les profils QA et confirmer l'ID EAS, les identifiants natifs et le ref; un URL production ou un placeholder EAS fait échouer `app.config.js`.
8. Relever l'usage/quota EAS et la facturation Supabase, puis autoriser explicitement les builds internes Android/iOS. Ce document n'autorise pas ces builds, l'enregistrement de tokens réels, ni l'envoi réel de push.

## Contrôles locaux

Les tests négatifs couvrent URL Supabase production/incohérente, identité EAS partagée, variables absentes, mismatch de profil, fichier Firebase de mauvais package/projet et ID Firebase production. Les variantes Expo confirment les IDs/schemes QA ainsi que la préservation production. Aucun contrôle n'utilise une vraie clé ou un token d'appareil.
