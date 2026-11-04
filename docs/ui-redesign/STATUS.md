# Accueil — première tranche visuelle

Chemin actif : `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`. Développement exclusivement sous `/Users/tommy/APP TESKA/YOUMBIA`. Les chemins /private/tmp ci-dessous décrivent l’historique avant relocalisation.

État courant — 4 novembre 2026 : contrôle accueil **catalogue connecté QA** documenté en fin de fichier (réf. Git `df9087f`). En-tête compact et démonstration locale restent disponibles mais **hors parcours** de ce contrôle. Déclinaison officielle blanche/transparente du logo : réserve ouverte. Le dernier relevé en fin de document fait autorité ; les étapes précédentes restent historiques.


## Base source retenue et qualification
- Racine d’origine : `/Users/tommy/APP TESKA/YOUMBIA/youmbia-mobile` ; baseline lue dans `docs/ui-redesign/BASELINE-ACCUEIL-2026-11-03.md` de ce checkout. Aucun AGENTS.md dans le dépôt ni les parents applicables accessibles. README et docs/tsk consultés.
- SHA audité : `55d7f4917f5446df6f84483eb5739073e3296451` sur la branche MCC locale, dont le nom ne suffit pas à qualifier une release.
- Base retenue : `d2e6c122e75ecc5af4e261f7f79dabcf3d24696b`, référence locale `release/v5-0-0-android-rc2`, checkout `/Users/tommy/YOUMBIA-V5-RC-FF70036` propre lors de l’inspection.
- Chaîne vérifiée : `ff7003660e62fabed94d25386039a20db0cca8fa` fusionne le SHA audité avec `42cb03f` (integration/mobile-next-release-20261028) ; `664c721` ajuste les numéros RC1 ; `d2e6c12` ajuste uniquement Android à 41. La base RC2 déclare V5.0.0, iOS 7, Android 41. Cette tranche ne change aucun de ces numéros.
- `git merge-base --is-ancestor 55d7f49 d2e6c12` réussit. Les changements V5-01 à V5-05 sont conservés. La consolidation ajoute LINK-01/Auth, consentement marketing vérifié et sa bannière, push transactionnel/préférences, galerie zoom/pagination, isolation QA et garde des builds. Le delta accueil entre les deux bases ajoute la bannière de consentement : elle est conservée.
- main local `61e3565` et origin/main local `ee065e3` ne portent pas cette consolidation. Ne pas repartir de ces références ni recopier l’ancien écran par-dessus le candidat.
- Preuves et limites : commits/parents, arbre RC propre, diff de versions et contrats locaux inspectés. Le cadrage du 28 octobre est antérieur à cette consolidation. Le journal `/private/tmp/youmbia-v5-release-replay.log` échoue à créer sa base isolée : il ne prouve pas une validation SQL complète. Aucun identifiant de build distribué lié à RC2 ni validation physique de ce binaire n’a été établi. Qualification de la base **source locale**, sans certification de release distribuée ni backend.

## Isolation et préservation
- Worktree `/private/tmp/youmbia-ui-home`, branche `feat/ui-home-first-slice`, créé explicitement depuis RC2.
- Checkout d’origine inchangé : eas.json modifié, sauvegarde .env, script de build, preuves SQL non suivies et trois fonctions utilitaires préservés. Aucun reset, stash, nettoyage, indexation, commit ou push.
- Dépendances reprises du candidat RC2 après `cmp` des package-lock.json. Le partage initial par symlink a causé une erreur de chemin dans le manifeste natif ; remplacement ciblé par copie locale APFS des dépendances existantes. Aucune installation ni modification de dépendance/version. Aucun environnement complet copié.

## Fichiers modifiés et limites de tranche
- `app/(tabs)/search.tsx` : présentation conditionnée à l’état accueil idle ; en-tête/safe area verts, recherche blanche plus haute, bouton Filtres nommé dans la barre, localisation via le handler existant openFilters, catégories compactes sur fond clair. Recherche et ses résultats gardent leur présentation par défaut.
- `src/components/HomeBrandHeader.tsx` : variante opt-in accueil, logo officiel teinté blanc, localisation accessible et notifications conservées. Valeur par défaut inchangée pour les autres usages.
- `src/components/HomeCategoryStrip.tsx` : variante compacte opt-in ; taxonomie, ordre, destinations, handlers et labels accessibles conservés.
- Ce document `docs/ui-redesign/STATUS.md`.
- Tokens existants (dont semantic.successText pour le vert profond), assets officiels et composants réutilisés. La maquette fournie guide uniquement le haut de l’écran ; aucune photo ni mention « Annonces fictives » reprise.
- Aucun changement de ListingCard, ListingFeed, services, navigation basse, gardes Auth, consentements, pagination ou tri. Fil accueil toujours limité à 6 et exploration par 12, conformément à cette tranche.

## Contrôles
- `npm run typecheck` : PASS après correction du token couleur initialement mal référencé.
- `npm run lint` : PASS sans erreur, 11 avertissements hors fichiers modifiés (scripts/email, avatar, supabase et tests boutiques).
- ESLint ciblé des trois TSX : PASS sans avertissement.
- Vitest ciblé searchSession, link01.contract, releaseCritical.contract : 3 fichiers / 14 tests PASS.
- `node --test scripts/release-preflight.test.cjs` : 3 PASS / 1 FAIL, variable YOUMBIA_EAS_PROJECT_ID requise par le garde QA. Échec identique reproduit dans le checkout RC2 intact ; défaut/condition préalable héritée, non corrigé dans cette tranche visuelle.
- `git diff --check` : PASS ; diff inspecté, périmètre limité aux trois TSX et à ce document.

## Metro et iPhone
- Ancien Metro PID 18775 arrêté ; il servait le checkout audité, pas la refonte. Un seul serveur remplacé initialement sur 8081, puis déplacé sur 8082 après persistance de l’ancienne adresse sur l’iPhone ; 8081 arrêté.
- Lanceur local hors dépôt : `/private/tmp/youmbia-ui-home-metro.cjs`, lancé avec Node. Il charge uniquement URL/clé publique QA depuis l’environnement de dev existant et identifiants QA depuis le profil development ; garde resolveBuildEnvironment validé. Aucun secret imprimé.
- Commande Expo équivalente : `expo start --dev-client --lan --scheme exp+youmbia-mobile --port 8082 --clear`, avec APP_ENV/EXPO_PUBLIC_APP_ENV=development et variables QA validées. Schéma explicite conservé du client iOS existant ; aucun prebuild/rebuild.
- Adresse active : http://192.168.1.89:8082 ; lien dev : `exp+youmbia-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.89%3A8082` (même Wi-Fi, client compatible Expo 54 / RN 0.81.5 et modules du projet).
- Première compilation iOS : HTTP 200, 2773 modules ; présence des nouveaux libellés et chemins du worktree vérifiée dans le bundle. Cela ne valide pas le manifeste ni l’affichage natif.
- Retour utilisateur : « Erreur ou écran différent », puis erreur de résolution de l’entrée expo-router vers le chemin réel du node_modules partagé. Cause identifiée : symlink de dépendances hors racine dans le manifeste ; correction d’environnement locale effectuée, sans modification du code métier. Manifeste corrigé HTTP 200 avec entrée /node_modules/expo-router/entry.bundle ; son URL exacte compile HTTP 200 et contient la refonte. L’utilisateur a néanmoins signalé encore le même ancien chemin ; hypothèse cache client non démontrée, nouveau port 8082 utilisé pour forcer une nouvelle adresse. Nouvelle confirmation demandée. Vérification LAN sur 8082 : manifeste HTTP 200, URL /node_modules/expo-router/entry.bundle, bundle exact HTTP 200 contenant la refonte ; lsof confirme un seul écouteur PID 19905 sur 8082 et aucun sur 8081.
- Validation visuelle de l’affichage **confirmée par l’utilisateur** après fermeture du client et ouverture de la nouvelle adresse 8082 : « Nouvel accueil visible ». Pas d’inspection native directe par l’agent ni de validation fonctionnelle de chaque action. Prochaine étape : recette iPhone de recherche, filtres/localisation, catégories, notifications et retour annonce, en vérifiant que le fil et les destinations restent identiques. Aucun build natif, déploiement, migration ou accès d’écriture backend exécuté.

## Contrôle préalable renouvelé — 3 novembre 2026
- Identité relue avant écriture : chemin physique et racine Git `/private/tmp/youmbia-ui-home` ; git-common-dir `/Users/tommy/APP TESKA/YOUMBIA/youmbia-mobile/.git`, identique au dépôt canonique ; branche `feat/ui-home-first-slice` ; HEAD `d2e6c122e75ecc5af4e261f7f79dabcf3d24696b` ; ascendance RC2 confirmée par merge-base (code 0). Worktree list confirme le rattachement.
- Les trois TSX de première tranche restent modifiés (+93/-35 au total). Checkout canonique et ses modifications/non-suivis préservés. STATUS et instructions applicables relus ; aucun AGENTS.md trouvé aux chemins applicables.
- Contrôle préalable ajouté aux instructions locales `.cursor/rules/youmbia-ui-local-context.mdc`, sans remplacer d’instructions existantes.
- Metro existant PID 19905 : cwd physique `/private/tmp/youmbia-ui-home`, écoute uniquement 8082 pour cette instance ; serveur réutilisé, aucun second serveur lancé.
- Recette physique reprise avec le propriétaire. La confirmation antérieure « Nouvel accueil visible » porte sur l’affichage ; recherche, filtres/localisation, catégories et retour annonce restent à vérifier individuellement. Aucun PASS physique déduit des tests automatisés.
- Aucun changement des trois TSX durant ce contrôle ; aucun commit/cherry-pick (notamment 7faf36d), SSR web, pagination, version, backend ou déploiement.

## Recette physique — retour du propriétaire
- Après nouveau contrôle d’identité conforme (même worktree, dépôt commun, branche et HEAD RC2), confirmation explicite sur iPhone : « Oui, filtres et ville accessibles ».
- Résultat confirmé : ouverture de la feuille Filtres et accès à la saisie manuelle Ville. Aucun sélecteur de villes confirmé. Cela ne valide pas encore l’application effective d’un filtre ni l’exactitude des résultats.
- Restent à vérifier physiquement : application ville/recherche, catégories, notifications, ouverture annonce et retour avec position conservée. Aucun changement applicatif effectué pour consigner ce retour.


## Relocalisation et recette Ville
- Déplacement natif `git worktree move` réussi sans force depuis `/private/tmp/youmbia-ui-home` vers `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home` ; ancienne destination absente après déplacement. Destination préalablement libre ; aucun sous-module déclaré.
- Chemin physique et racine Git identiques au nouveau chemin ; dépôt commun inchangé `/Users/tommy/APP TESKA/YOUMBIA/youmbia-mobile/.git`, branche `feat/ui-home-first-slice`, HEAD `d2e6c122e75ecc5af4e261f7f79dabcf3d24696b`, ascendance RC2 vérifiée.
- Inventaire avant déplacement : 3 TSX suivis modifiés (+93/-35), 2 fichiers non suivis (.cursor/rules/youmbia-ui-local-context.mdc et docs/ui-redesign/STATUS.md), répertoires ignorés node_modules et .expo. Empreintes SHA256 des 5 fichiers identiques immédiatement après déplacement, avant actualisation documentaire. node_modules et .expo présents ; dépendances Expo 54.0.34, RN 0.81.5, dev-client 6.0.21 résolues depuis la nouvelle racine ; aucun changement de dépendance.
- Règle locale actualisée sans supprimer les autres instructions. Nouveau lanceur `scripts/start-ui-home-metro.local.cjs`, adapté depuis le lanceur précédent : racine calculée depuis le script, uniquement variables publiques QA chargées, garde QA conservé. Aucun fichier de secrets copié/affiché.
- Rectification : « Toutes les villes » ouvre les filtres ; Ville est un TextInput manuel (placeholder « Ex. Douala »). La confirmation précédente portait sur l’accès aux filtres et au champ, pas sur un sélecteur. Aucune liste de villes inventée ni sélecteur confirmé.
- PASS historique rapporté par le propriétaire : accueil visible ; filtres et saisie Ville accessibles avant déplacement. Ce résultat ne valide pas les étapes ci-dessous après déplacement.
- PASS partiel / FAIL libellé — Douala : attendu saisir Douala puis Appliquer, critère Douala nommé et résultats cohérents. Captures iPhone du propriétaire : champ Ville = Douala ; écran suivant « Résultats de recherche », « 6 annonces trouvées », « Filtres (1) » ; les deux cartes visibles indiquent Douala. PASS saisie et arrivée aux résultats avec un filtre actif ; FAIL visibilité du nom Douala dans le résumé des critères (seul le compteur apparaît). Cohérence des 6 résultats : NON TESTÉ au-delà des deux cartes visibles. Aucun sélecteur de villes confirmé.
- PASS — Recherche combinée sur le cas testé : attendu « smartphone » avec Douala conservé. Captures physiques du propriétaire : requête smartphone, 1 annonce trouvée, Filtres (1), annonce [QA V5] Smartphone Android 128 Go à Douala ; après réouverture, Ville = Douala et résumé « Ville Douala ». Persistance du critère et cohérence du résultat visible confirmées ; aucune généralisation aux autres recherches.
- PASS — Réinitialisation du cas testé : attendu disparition de Douala après Réinitialiser, puis retour à l’accueil après effacement de la requête. Observé par le propriétaire : « Douala disparaît. Je retrouve l'accueil après avoir effacé smartphone ». Le libellé exact « Toutes les villes » et le champ Ville vide ne sont pas explicitement attestés par ce retour.
- Ancien Metro PID 19905 arrêté avant déplacement. Metro relancé : PID 21098, cwd physique `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home` vérifié avec lsof, unique écouteur sur 8082, aucun sur 8081. /status = packager-status:running ; manifeste iOS HTTP 200 avec entrée /node_modules/expo-router/entry.bundle. Lien : exp+youmbia-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.89%3A8082. Cela ne constitue pas une validation physique.
- Aucun fichier UI, pagination, backend, version ou configuration native modifié pour cette relocalisation. Aucun commit/cherry-pick, reset, nettoyage, suppression ou recréation du chantier.


## Preuves physiques reçues — recette Douala
- Trois captures du propriétaire (fichiers codex-clipboard-01a6e3f0-727a-497a-9621-3eed03d9481e.png, codex-clipboard-50e6770d-31cc-4af7-bf58-c00c281197d3.png, codex-clipboard-435fa972-a80a-450d-a972-a9e7e2dd9d58.png).
- Capture 1 : feuille Filtres ouverte, clavier affiché ; le champ et les actions du bas sont hors de la zone visible. Capture 2 : Ville contient Douala, Appliquer visible ; « Aucun filtre actif » avant application. Capture 3 : résultats, 6 annonces trouvées, Filtres (1), deux annonces QA visibles à Douala (smartphone Android 128 Go et appartement deux pièces).
- Le retour à l’en-tête blanc dans les résultats est observé ; la variante verte reste limitée à l’accueil comme prévu. Ne pas interpréter ce changement comme une perte du filtre sans vérification supplémentaire.
- Aucun changement UI effectué. Prochain test demandé : recherche textuelle « Smartphone » avec Douala conservé ; vérifier le champ Ville dans les filtres et les résultats visibles. Réinitialisation toujours NON TESTÉE.


## Preuves physiques reçues — smartphone + Douala
- Captures codex-clipboard-70c03a45-336f-4028-910e-6c5fff538fb5.png et codex-clipboard-afbdfefc-4ea9-4841-bb1e-7dd71875dc36.png : PASS pour le cas combiné décrit ci-dessus.
- Nouvelle observation : une pastille Douala est visible sous le champ manuel ; ceci confirme la présence de cette pastille dans ce contexte, sans confirmer un sélecteur de villes ni son fonctionnement. Le champ manuel reste confirmé.
- Résumé de ville : « Ville Douala » est bien visible DANS la feuille Filtres. La limite relevée précédemment concerne uniquement le résumé de l’écran des résultats, qui affiche Filtres (1) sans nommer la ville.
- Réinitialisation : toujours NON TESTÉE physiquement. Lecture du handler existant : Réinitialiser efface le critère ville et relance la requête textuelle courante ; cela ne doit pas être confondu avec l’effacement de la recherche. Pour vérifier ensuite le retour à l’accueil « Toutes les villes », effacer aussi le texte via la croix de recherche. Aucun code modifié.


## Retour physique — réinitialisation
- Confirmation textuelle du propriétaire : « Douala disparaît. Je retrouve l’accueil après avoir effacé smartphone ».
- PASS sur les observations rapportées : disparition de Douala à la réinitialisation et retour à l’accueil après effacement séparé de smartphone. Ce parcours distingue bien la remise à zéro des filtres de celle du texte recherché.
- NON TESTÉ explicitement : valeur exacte du champ Ville après réinitialisation, libellé final « Toutes les villes », résultats après remise à zéro avant effacement du texte et autres combinaisons de critères. Pas de validation globale inférée.
- Contrôle d’identité renouvelé conforme avant cette mise à jour ; seul STATUS.md modifié pour consigner ce retour. Aucun changement applicatif.


## Accueil — défilement progressif sans plafond

### Identité et périmètre
- Contrôle préalable conforme : chemin physique/racine `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, git-common-dir canonique `/Users/tommy/APP TESKA/YOUMBIA/youmbia-mobile/.git`, branche feat/ui-home-first-slice, HEAD RC2 d2e6c122e75ecc5af4e261f7f79dabcf3d24696b. Instructions et ce STATUS relus ; autorisation explicite de modifier la pagination dans la demande courante. Changements locaux de première tranche préservés.
- Aucun changement de version, dépendance, SQL, backend ou déploiement. ListingCard et navigation basse inchangés. Le parcours de recherche et ses résultats filtrés conservent leur chargement manuel existant ; seul le fil d’accueil devient continu.

### Contrat constaté (dépôt et QA distingués)
- SQL local 20261101130000_v5_03b_discovery_ranking.sql : RPC get_v5_discovery_listing_ids(p_offset integer, p_limit integer), offset zéro-indexé, maximum 50 PAR APPEL, renvoie listing_id et rank_position. Pas de curseur, total ou hasMore renvoyé par la RPC ; aucun plafond total. Classement boost puis seller_position (diversité), last_published_at DESC NULLS LAST, id DESC.
- Lecture réseau QA avec la clé publique : RPC HTTP 404/PGRST202 (absente), donc repli déjà prévu par le service sur listings actives. Requêtes bornées de 6 aux offsets 0, 6 et 12 : HTTP 200, respectivement 6/6/3 lignes, aucun doublon observé pendant ce contrôle. Résultats réseau seulement, aucun PASS physique déduit.
- Repli : range inclusif [offset, offset+taille-1], tri last_published_at DESC puis id DESC ajouté pour départager les dates égales. Ne remplace jamais une erreur de droits par un repli. Diversité vendeur préservée sur le chemin RPC disponible, mais non disponible/non validée sur cette QA sans RPC. Aucune tentative de déploiement de la RPC.
- Service : métadonnées CLIENT nextOffset/hasMore calculées sur le nombre de lignes serveur consommées (IDs RPC AVANT hydratation, ou lignes du repli). Fin = lot incomplet ; un lot plein terminal demande éventuellement un appel vide supplémentaire. Hydratation incomplète/dédoublonnage ne doivent pas réduire le décalage serveur ni signaler une fausse fin.
- Limite inhérente : classement recalculé à chaque appel, sans instantané de catalogue. Pagination cohérente sur catalogue stable ; publications, retraits, changements de boost en vol peuvent déplacer les offsets. Déduplication des cartes, mais aucune garantie d’absence d’omission sous mutations concurrentes. Une garantie forte nécessiterait un contrat backend de snapshot/curseur, non entrepris ici.
- Documentation consultée : https://supabase.com/docs/reference/javascript/rpc ; changelog.md récupéré en HTTP 200. Aucun nouvel usage de schéma, Auth ou droits introduit.

### Implémentation
- app/(tabs)/search.tsx : suppression limit=6, disableInfiniteScroll et footer redirigeant vers l’exploration. Taille du lot conservée à 6 pour cette passe (pas de nouvelle valeur sans mesure). Rails et ordre des sections conservés.
- src/features/listings/ListingFeed.tsx : FlatList conservée, fenêtre iOS 5 et maxToRenderPerBatch=6 ; préchargement onEndReachedThreshold=0.4. Aucun key de remontage ajouté ; instance/liste/cartes déjà chargées conservées au retour de fiche si l’écran reste monté. Après démontage, seule la première page est persistée ; pas de restauration durable de position inventée.
- Nouveau discoveryFeedController.ts : verrou synchrone pour une seule page suivante active, déduplication par id y compris dans un lot, progression par offset serveur, conservation des cartes pendant attente/erreur, arrêt des retries automatiques après erreur et bouton Réessayer sur le même offset. Refresh invalide la génération précédente ; démontage lors du passage aux critères/recherche invalide réponses et écritures cache en vol. Une requête invalidée peut encore finir sur le réseau, sans effet sur le nouvel écran.
- Cache première page : métadonnées paginationVersion/pageSize/nextOffset/hasMore. Un cache compatible récent conserve sa capacité à charger la suite ; cache ancien/incompatible peint les cartes mais impose une revalidation de page zéro avant pagination. Cache écrit uniquement après succès de première page courante ; échec cache non bloquant. Délai réseau existant de 2 min conservé.
- getPublicListings.ts : métadonnées de consommation, plafond individuel aligné sur la RPC (50), départage id pour le repli ; ordre d’hydratation RPC conservé.
- Tests : discoveryFeedController.test.ts (12 cas), ListingFeed.test.tsx (2 cas React/FlatList), getPublicListings.test.ts (8 cas dont hydratation partielle et limite par appel). Testés : double déclenchement, doublons, dernière page partielle/vide, erreur suivante et retry, réponse/erreur obsolète après refresh, changement de critères/démontage, cache ancien/compatible/épuisé et StrictMode.
- scripts/start-ui-home-metro.local.cjs : déclaration ESLint de __dirname uniquement, correction du lint préexistant du lanceur créé pendant la relocalisation.

### Contrôles exécutés
- Vitest complet : 105 fichiers PASS, 1 ignoré ; 777 tests PASS, 3 ignorés. Journal docs/ui-redesign/pagination-tests.log.
- Typecheck : PASS (après correction d’un typage dans le nouveau test React). Lint global : aucune erreur, 11 avertissements hors périmètre ; lint ciblé des fichiers de cette tranche sans avertissement. git diff --check : PASS.
- Diff inspecté : fichiers SQL, app.json, eas.json, package.json et package-lock.json inchangés. Aucun commit/cherry-pick ou déplacement de branche.
- Metro existant réutilisé PID 21098, cwd nouveau worktree confirmé ; manifeste et bundle iOS HTTP 200, présence du contrôleur progressif dans le bundle vérifiée. Cela ne valide pas l’exécution physique.

### Recette iPhone à effectuer — tous NON TESTÉS pour cette tranche
- Adresse : exp+youmbia-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.89%3A8082. Recharger le client pour utiliser le nouveau bundle.
- Lot suivant : attendu dépasser 6 annonces puis 12 sans bouton/redirection, sans doublon et avec chargement proche de la fin. La lecture QA suggère 15 lignes actives actuellement, à confirmer sur appareil. Observé : aucun retour physique reçu.
- Fin : attendu message final seulement après épuisement des lots ; observer le dernier lot et l’absence de requêtes répétées. Observé : NON TESTÉ.
- Retour fiche : attendu ouvrir une carte après le premier lot, revenir à la même position avec les cartes déjà chargées. Observé : NON TESTÉ.
- Critères : attendu « Toutes les villes » → filtres → saisie manuelle Douala → Appliquer ; résultats ville cohérents sans contamination par une ancienne page accueil. Puis recherche combinée et réinitialisation. Observé : NON TESTÉ sur cette nouvelle tranche (les confirmations précédentes concernent la tranche précédente).
- Réinitialisation : attendu disparition de Douala après Réinitialiser ; effacer ensuite le texte recherché ; confirmer explicitement accueil et libellé exact « Toutes les villes ». Observé : NON TESTÉ pour cette tranche et libellé exact toujours à confirmer.
- Erreur suivante : attendu cartes conservées, bouton Réessayer explicite, reprise sans doublon ; testé automatiquement, NON TESTÉ physiquement.

### Captures physiques reçues — fin du fil progressif
- Preuves : codex-clipboard-797094d5-3854-4f27-8724-716c53bdac6b.png et codex-clipboard-db56ebe8-0463-40ff-9483-2b4c5eda1617.png, fournies par le propriétaire.
- PASS affichage du libellé exact « Toutes les villes » dans l’en-tête ; PASS état Ville vide (placeholder « Ex. Douala ») et résumé « Aucun filtre actif » visibles dans la feuille.
- PASS affichage du message de fin « Toutes les annonces ont été chargées » sous la carte [QA V5] Réparation plomberie domicile, Yaoundé, 15 000 FCFA. Aucun bouton « Voir plus » visible à cette fin de fil.
- NON TESTÉ / non démontré par ces seules captures : nombre total de cartes parcourues, passage automatique au-delà de 6 et 12, absence de doublons sur tout le parcours, absence de requêtes répétées et concordance exhaustive avec les lignes serveur. Ne pas déduire ces PASS du message de fin ni des contrôles API.
- Retour fiche à même position et critères après pagination : toujours NON TESTÉS physiquement. Aucun code modifié pour ce relevé ; identité du worktree et ascendance RC2 revérifiées avant écriture.

### Confirmation physique du propriétaire — lots et retour fiche
- PASS sur le parcours testé : dépassement de 6 puis 12 cartes avec chargement automatique, sans action « Voir plus » et sans doublon visible ; réponse explicite « Oui, confirmé » à ces critères.
- PASS retour fiche vers la fin du fil : attendu même position et cartes déjà chargées ; observé rapporté « Même position et cartes conservées ».
- Ces confirmations complètent les captures précédentes et remplacent le statut NON TESTÉ de ces deux cas. Elles ne prouvent pas l’absence de requêtes répétées ni une correspondance exhaustive au catalogue sous mutations concurrentes.
- Restent NON TESTÉS physiquement pour la nouvelle pagination : erreur suivante/reprise et changement de ville/recherche/réinitialisation pendant une requête en vol. Les confirmations ville de la tranche précédente restent historiques.
- Identité locale et ascendance RC2 revérifiées avant écriture ; seul le suivi documentaire est actualisé, aucun code modifié.


## Qualification finale demandée — scénarios dégradés
- Contexte revérifié conforme avant intervention : worktree physique/racine sous le répertoire autorisé, dépôt commun canonique, branche feat/ui-home-first-slice, HEAD d2e6c122e75ecc5af4e261f7f79dabcf3d24696b et ascendance RC2. Changements locaux suivis et non suivis préservés. Metro PID 21098 sert toujours ce worktree sur 8082.
- Scénario 1, attendu : à partir du premier lot déjà visible, couper Wi-Fi ET données mobiles avant la page suivante ; cartes/position conservées, erreur suivante et Réessayer visibles. Ensuite rétablir le réseau, toucher Réessayer : reprise au même offset, cartes précédentes conservées, pas de doublon visible. Observé physique : protocole envoyé au propriétaire, aucun retour reçu à cette étape. Statut : NON TESTÉ / reproduction non confirmée. La partie reprise réseau devra être observée après l’échec, pas supposée.
- Scénario 2, attendu : prouver une page suivante réellement en vol, appliquer un autre critère, puis laisser finir la réponse ancienne ; elle ne doit modifier ni résultats/critères du nouvel écran ni cache par une écriture obsolète. Observé physique : aucune reproduction reçue. Statut : NON TESTÉ. Un changement effectué hors requête en vol ne vaut pas PASS pour ce scénario.
- Diagnostics existants inspectés en premier : cible Hermes com.youmbia.mobile.dev (iPhone) exposée par /json/list ; panneau réseau signalé unstable_enableNetworkPanel=true. Implémentation RN installée inspectée : Network.enable/disable/getResponseBody présents, pas de gestion emulateNetworkConditions/setBlockedURLs trouvée dans jsinspector-modern. Cela établit une capacité d’inspection, pas un ralentissement effectif ni une requête concurrente observée. Aucun ralentisseur ou défaut réseau ajouté au code applicatif.
- Automatisé, séparément : 22 tests ciblés PASS (discoveryFeedController 12, ListingFeed 2, getPublicListings 8). Ils couvrent notamment erreur suivante/retry même offset, une seule requête suivante, réponses/erreurs obsolètes après refresh, démontage/critères et cache ; ils ne constituent aucun PASS physique. Avertissement react-test-renderer déprécié, sans échec.
- Correction : aucune. Aucun défaut de ce lot démontré par observation physique ou nouveau test en échec. Seul STATUS est actualisé pour cette demande ; aucune modification des cartes, du classement, des critères ou de la position. Aucun déploiement, commit ou changement backend.
- Qualification finale toujours ouverte en attente des observations du propriétaire pour ces deux scénarios.


### Retour physique — échec suivant et reprise réseau
- Attendu : provoquer un échec de la page suivante hors réseau, puis rétablir le réseau et reprendre explicitement sans doublon ; conserver cartes et position.
- Observé par le propriétaire : « TypeError : Network request failed. Réessayer. Message d’erreur à revoir :) », puis après rétablissement/action Réessayer : « la suite se charge sans doublon ».
- PASS partiel physique : échec suivant effectivement reproduit, action Réessayer visible, reprise réseau et absence de doublon visible confirmées. NON CONFIRMÉ explicitement : cartes et position conservées pendant l’erreur et après reprise. Ne pas déduire ces observations du test automatisé.
- Défaut démontré et correction bornée : ListingFeed affichait loadMoreError brut. Seul ce texte de pied de fil est remplacé par « Impossible de charger la suite des annonces. Vérifiez votre connexion, puis réessayez. » ; bouton, handler, état de pagination, cartes et position inchangés. Validation physique du NOUVEAU libellé encore NON TESTÉE.
- Preuve automatisée : nouveau test React rouge avant correction (reçoit TypeError: Network request failed), puis vert après correction ; vérifie aussi même instance FlatList, cartes conservées, absence de retry automatique, reprise explicite au même offset. Tests ciblés après correction : 23 PASS (contrôleur 12, composant 3, service 8). Typecheck PASS ; lint global aucune erreur / 11 avertissements préexistants ; git diff --check PASS.
- Diagnostic existant réellement essayé : connexion à la cible Hermes de l’iPhone via Metro ; Network.enable répond code -32601, Unsupported method. Le panneau réseau annoncé ne suffit donc pas à établir une capacité réseau effective sur ce client.
- Test critères en vol : protocole envoyé au propriétaire, nécessitant une page suivante encore active AU MOMENT de l’application de Douala ; aucun PASS avant preuve de cette simultanéité. En attente de son retour, NON TESTÉ/non reproduit à ce stade.
- Fichiers touchés pour cette correction : src/features/listings/ListingFeed.tsx, son test et ce STATUS. Changements locaux précédents préservés ; branche/HEAD inchangés, aucun déploiement ni backend.

### Critères en vol — première tentative physique trop rapide
- Retour explicite du propriétaire : « Trop rapide pour reproduire ». Le chevauchement entre page suivante et application de Douala n’est donc pas établi : statut NON REPRODUIT, aucun PASS physique.
- Moyen existant suivant proposé après échec de Network.enable : Network Link Conditioner dans les réglages Développeur de l’iPhone, décrit par Apple (https://developer.apple.com/videos/play/tech-talks/111378/). Présence sur cet appareil demandée au propriétaire ; ni disponibilité ni activation/ralentissement effectif supposés.
- Aucun nouveau défaut démontré ; aucune nouvelle modification applicative. Qualification finale ouverte pour ce scénario.


## Reprise de qualification — 4 novembre 2026
- Contrôle Git et lecture des instructions/STATUS renouvelés avant intervention : chemin physique/racine `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, dépôt commun canonique, branche feat/ui-home-first-slice et HEAD RC2 d2e6c122e75ecc5af4e261f7f79dabcf3d24696b conformes. Aucun changement local supprimé. Metro PID 21098 conserve le cwd de ce worktree.
- Scénario erreur/reprise : observations acquises conservées (échec reproduit puis « la suite se charge sans doublon »). Conservation physique cartes/position et nouveau message restent à confirmer, sans inférence depuis les tests.
- Scénario critères en vol : toujours NON REPRODUIT. Le propriétaire a confirmé « Oui, présent » pour Network Link Conditioner sur son iPhone ; profils disponibles et activation/latence effectives pas encore décrits. Question demandant les profils/champs de délai avant de configurer un ralentissement. Ne pas confondre disponibilité de l’outil et reproduction du scénario.
- Aucun nouveau défaut démontré ; aucune nouvelle correction applicative. Correction précédente limitée au libellé d’erreur conservée. Qualification finale ouverte en attente des preuves physiques manquantes ; aucun déploiement.

### Complément physique — 4 novembre 2026
- Scénario 1 : PASS sur le parcours rapporté. Confirmation explicite supplémentaire du propriétaire : « Oui, cartes et position conservées » pendant l’erreur puis Réessayer. Avec les retours précédents, sont confirmés : échec suivant réellement reproduit, Réessayer visible, reprise réseau, cartes/position conservées et suite sans doublon visible. Le nouveau libellé d’erreur reste à observer explicitement sur appareil.
- Scénario 2 : NON REPRODUIT. La capture codex-clipboard-53e30ca4-6d58-4323-a7b1-95df56dd2fa3.png montre le panneau Network Link Conditioner de macOS, profil Wi-Fi, et ne prouve pas sa présence sur l’iPhone. La précédente réponse « Oui, présent » ne suffit donc plus à établir la disponibilité sur le téléphone ; distinction Mac/iPhone expliquée au propriétaire.
- Ralentir seulement le Mac/Metro ne démontre pas le ralentissement des requêtes directes iPhone → Supabase. Aucun profil iPhone activé ni chevauchement de requête/critères physiquement observé. Aucun PASS du scénario 2.
- Contexte Git et instructions revérifiés avant cette mise à jour ; aucun changement applicatif, aucune nouvelle correction, aucun déploiement.


## Grille accueil — cartes marketplace — 4 novembre 2026 (après-midi)

### Cause constatée (iPhone inchangé malgré travail cloud)
- Metro PID **21098** sert bien **`/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`** (port **8082**). Le commit cloud `6cf3c16` sur branche `cursor/ui-accueil-grille-cartes-5b63` **n’a pas été intégré** (consigne respectée).
- Chemin de rendu accueil : `app/(tabs)/search.tsx` → `ListingFeed` avec `listingCardFeedPresentation="home"` et `extraComponent={<PopularShopsSection />}` (pleine largeur conservée).
- **Avant correction locale** : fil en **1 colonne** ; ratio image accueil **1:1** ; prix en **pastille sur la photo** ; aucune occurrence de `getHomeFeedColumnCount` dans le bundle iOS servi par Metro.
- Les pixels d’une capture ne donnent pas la largeur logique : la décision colonnes repose sur `useWindowDimensions().width` (points RN) et `PixelRatio.getFontScale()`, pas sur la résolution écran en px.

### Repli colonnes (documenté pour recette iPhone)
- **2 colonnes** si largeur logique **≥ 380** et `fontScale` **≤ 1,2** (`HOME_FEED_GRID_MAX_FONT_SCALE`).
- **1 colonne** si largeur **< 380** (compact, ex. SE) **ou** texte agrandi OS au-delà du seuil (accessibilité).
- Sur iPhone courant (typ. 390–430 pt logiques, texte standard), attendu **grille 2 colonnes** ; activer texte très grand dans Réglages pour vérifier le repli 1 colonne.

### Implémentation locale (référence cloud revue, pas cherry-pick)
- `src/lib/responsiveLayout.ts` + `responsiveLayout.test.ts` : comptage colonnes et gap.
- `src/features/listings/ListingFeed.tsx` : rangées grille 2 col., bloc boutiques en rangée pleine largeur, pagination/contrôleur discovery inchangés.
- `src/features/listings/ListingCard.tsx` : accueil **4:3** (photo **et** placeholder « Aucune photo »), **prix sous l’image** en 1 et 2 colonnes (`minimumFontScale` 0,88), titres/localisation/favoris conservés ; autres `ListingCard` inchangés.
- `src/components/SkeletonListingCard.tsx` : skeleton home 4:3.
- `src/features/listings/ListingFeed.test.tsx` : mock `useWindowDimensions` / `PixelRatio`.

### Contrôles (sans PASS physique)
- Bundle iOS Metro 8082 : présence de `getHomeFeedColumnCount`, `buildHomeFeedGridRows`, `priceHomePrimary` — **OK** (HTTP bundle).
- Vitest ciblé : **26 PASS** (responsiveLayout 3, discoveryFeedController 12, ListingFeed 3, getPublicListings 8).
- `npm run typecheck` global : **FAIL** à cause du dossier non suivi `youmbia/` (copie web Next) inclus par le projet TypeScript ; hors périmètre grille, non modifié.

### Recette physique grille — **OUVERT**
- Recharger le dev client sur `http://192.168.1.89:8082` (sans feuille filtres ouverte).
- Vérifier avec le propriétaire : 2 colonnes, prix sous image, montants longs lisibles, favoris, dernière rangée au-dessus tab bar, retour fiche, rails header et bloc boutiques pleine largeur.
- Aucun déploiement, version, backend ou dépendance modifiés.


## Finition accueil — 4 novembre 2026
- Identité renouvelée : racine physique/Git `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, dépôt commun `youmbia-mobile/.git`, branche `feat/ui-home-first-slice`, HEAD RC2 `d2e6c122e75ecc5af4e261f7f79dabcf3d24696b`, ascendance réussie. Instructions locales relues ; modifications précédentes préservées. Metro PID 21098 : cwd de ce worktree, port 8082 réutilisé.
- `HomeBrandHeader.tsx` : actif officiel local `assets/images/youmbia-logo-header.svg` (viewBox 148×40, symbole + texte YOUMBIA). Les deux PNG alternatifs ont été ouverts et inspectés : logo vertical / marges importantes, inadaptés à la boîte horizontale. Suppression de la teinte blanche qui écrasait les couleurs ; fond blanc avec marge et coins arrondis exclusivement dans `logoHome` pour le contraste sur vert. Actif SVG inchangé. Rendu natif final NON VALIDÉ.
- `HomeMarketplaceFeedHeader.tsx` : prop opt-in `homePresentation`, titre « À découvrir », sous-titre supprimé dans cette variante ; défaut conservé. `app/(tabs)/search.tsx` active la variante pour le fil accueil et définit #0B4D3C uniquement dans les styles/contrôles contextualisés accueil ; même couleur pour rowHome. Aucun token partagé modifié.
- Aucun changement de cartes, catégories, tris, pagination, cache, navigation, autres pages, backend, versions ou dépendances pendant cette finition. Relecture React : prop facultative avec défaut, hooks inchangés, nom accessible du logo et handlers conservés.

### Contrôles réellement exécutés
- ESLint ciblé sur les trois TSX retouchés : PASS sans avertissement.
- Vitest : 4 fichiers, 26 PASS (responsiveLayout, ListingFeed, discoveryFeedController, getPublicListings). Journal : `tests-finition-2026-11-04.log`. Couvre notamment seuil de texte agrandi/repli 1 colonne, cache, pagination et reprise. Le mock de ListingCard empêche de qualifier visuellement photos et prix via ces tests.
- Relecture du code seulement : prix accueil sur 2 lignes avec réduction minimale 0,88 ; boutiques dans une rangée dédiée hors cellules ; padding inférieur = spacing['3xl'] + contentBottomInset ; handlers favoris/navigation conservés. Ces constats de code ne prouvent pas le rendu ni le dégagement réel après défilement.
- `xcrun simctl list devices booted` après accès autorisé : aucun simulateur démarré. `/json/list` Metro : iPhone `com.youmbia.mobile.dev` connecté. Cette connexion ne donne pas de capture ni de contrôle visuel natif.
- Photos disponibles en QA : NON TESTÉ pendant cette finition. Montants longs, texte agrandi sur appareil, favoris, retour fiche, boutiques pleine largeur et dégagement de la dernière rangée après défilement : NON TESTÉS pendant cette finition. Les confirmations physiques historiques ci-dessus restent distinctes. Capture finale : non disponible ; aucune maquette substituée à une capture réelle.

### Qualification TypeScript et dossier imbriqué
- `npm run typecheck` relancé après modifications : FAIL, **1412 erreurs**, toutes sous `youmbia/`, aucune ailleurs. Codes et effectifs : TS2307 : 1160, TS2322 : 6, TS7006 : 217, TS7031 : 6, TS7053 : 5, TS2339 : 6, TS18047 : 3, TS7016 : 6, TS18046 : 1, TS2345 : 2. Journal intégral avec fichiers/lignes/messages exacts : `typecheck-finition-2026-11-04.log`.
- Exemples exacts : `youmbia/app/(admin)/admin/layout.tsx(1,30)` TS2307 module `@lib/auth` introuvable ; `youmbia/app/(admin)/admin/marketing/campaigns/[campaignId]/page.tsx(1,31)` TS2307 module `next` introuvable ; `youmbia/app/(admin)/admin/marketing/audience/ManualEnrollment.tsx(98,263)` TS2322 unknown incompatible avec ReactNode.
- Cause : tsconfig mobile inclut `**/*.ts` et `**/*.tsx`, exclut uniquement supabase/functions ; il englobe le projet web imbriqué sans ses alias @lib ni ses dépendances Next. Aucun élargissement d’exclusion effectué.
- Indépendance vérifiée : `git -C youmbia rev-parse --show-toplevel` retourne sa propre racine ; `.git` est un répertoire propre, sans commondir ni objects/info/alternates ; zéro lien symbolique dans tout son arbre ; 855 fichiers suivis et status Git interne propre ; remote propre `https://github.com/tommykamga/youmbia`. package.json autonome Next 14 / React 18, distinct du mobile Expo / React 19. Recherche `youmbia/` dans le code/config mobile (hors documentation, dépendances et copie elle-même) : aucune référence trouvée. La référence effective démontrée est le glob du tsconfig.
- Aucune relocalisation exécutée : copie indépendante conservée intégralement dans le périmètre exclusif demandé. L’échec global reste visible et qualifié. Aucun effacement, aucune exclusion ni correction artificielle des erreurs web.


## Clôture de qualification accueil — 4 novembre 2026

### Vérifié : contexte, conservation et TypeScript
- Racine physique et Git : `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`. Branche `feat/ui-home-first-slice`, base `d2e6c122e75ecc5af4e261f7f79dabcf3d24696b`, ascendance RC2 vérifiée. Git commun : `/Users/tommy/APP TESKA/YOUMBIA/youmbia-mobile/.git`. Index initial vide. Metro existant PID 21098, cwd confirmé ; aucun nouveau serveur ni conditionneur réseau.
- Copie `youmbia/` revérifiée avant déplacement : aucun fichier suivi par le mobile, dépôt Git interne propre et indépendant (HEAD `29220cc776bb76ca4c5d8c2823fe7b071c69a290`, remote web), manifeste Next autonome ; aucun symlink, aucun commondir ni alternates Git. Recherche des chemins imbriqués dans imports et configurations mobile : aucune référence nécessaire trouvée. Le glob TypeScript était la cause démontrée de l’inclusion.
- Déplacement expressément autorisé vers un emplacement préalablement libre, sans écrasement : **`/Users/tommy/APP TESKA/YOUMBIA/youmbia-web-preserved-2026-11-04/youmbia`**. Répertoire de récupération réservé par création exclusive ; renommage sur le même volume, sans copie ni effacement de contenu. Seule opération hors worktree : cette relocalisation demandée.
- Inventaire : `web-copy-inventory-2026-11-04.json`, 887 fichiers et 163 répertoires, incluant `.git`, avec chemins, modes, inodes et SHA-256 de chaque fichier. Comparaison intégrale avant/après : identique, `verifiedAfterMove: true`. La copie complète reste accessible au chemin ci-dessus ; récupération possible en l’ouvrant directement comme dépôt web autonome, sans la réintroduire dans le glob mobile.
- `npm run typecheck` / `tsc --noEmit` après déplacement et nouveaux tests : **PASS, zéro erreur restante** (`typecheck-final-2026-11-04.log`). Aucun changement de tsconfig, aucune exclusion ajoutée, aucune dépendance installée. Les 1 412 erreurs antérieures restent documentées dans le journal historique.

### Vérifié : concurrence déterministe, distincte de l’iPhone
- Aucun code applicatif ni retouche esthétique modifié pendant cette qualification. Tests ajoutés uniquement dans `discoveryFeedController.test.ts` et `ListingFeed.test.tsx`.
- Contrôleur : page suivante effectivement en vol (promesse différée), invalidation explicite puis nouveaux résultats ; ancienne réponse libérée manuellement avant ET après les nouveaux résultats. Dans les deux ordres, aucune annonce ancienne ajoutée, aucun écrasement du nouvel état et aucune écriture de cache obsolète. Aucun délai arbitraire ni dépendance à la vitesse réseau.
- Composant réel ListingFeed : page suivante en vol, démontage comme lors de la sortie de l’accueil, remontage d’un fil neuf, puis résolution de l’ancienne page. Instance/données du nouveau fil et écritures de cache inchangées. Le test couvre le cleanup réel ; il ne monte pas l’écran SearchScreen complet.
- Raccordement relu : `showMarketplaceHomeFeed = state.status === 'idle'` ; appliquer des critères/rechercher affiche loading/success et remplace ListingFeed par la branche résultats. L’effet ListingFeed retourne `controller.cancel` au démontage. Les données de recherche et leur cache sont séparés du contrôleur accueil. Preuve automatisée de l’invalidation et de cette frontière, sans prétendre à un test visuel bout en bout de SearchScreen.
- **Concurrence automatisée : PASS. Observation physique simultanée pagination/changement de critères : NON TESTÉ / NON REPRODUIT.** Aucune nouvelle recherche de conditionneur réseau.

### Recette iPhone regroupée : preuves réutilisées et réserves
- Protocole regroupé envoyé au propriétaire pendant cette qualification. Aucun nouveau retour reçu à la rédaction de ce relevé ; aucun PASS nouveau inventé.
- Photos QA visibles sur les cartes : **NON TESTÉ**. Le contrôle réseau historique ne prouve pas le rendu des photos.
- Prix long lisible, texte agrandi et repli réel une colonne : **NON TESTÉ sur iPhone**. Le seuil logique est couvert par les tests responsiveLayout, sans équivalence avec une recette physique.
- Favoris ajout/retrait : **NON TESTÉ**. Ouverture fiche et retour à même position/cartes conservées : **PASS historique réutilisé pour le comportement inchangé** (confirmation explicite « Même position et cartes conservées »). Disposition des nouvelles cartes au retour : **NON TESTÉ**.
- Défilement au-delà de 6 et 12, chargement automatique et absence de doublon visible : **PASS historique réutilisé**, confirmation du propriétaire conservée. Message de fin : **PASS historique** par capture. Dégagement de la dernière rangée avec la grille actuelle et boutiques pleine largeur si présentes : **NON TESTÉ** ; présence effective des boutiques pendant cette recette non attestée.
- Recherche « smartphone » avec ville Douala : **PASS historique réutilisé pour le parcours métier inchangé** (annonce QA Smartphone Android 128 Go à Douala, filtre conservé). Application de Douala seule : résultat partiellement observé, seulement deux cartes de Douala contrôlées ; exhaustivité **NON TESTÉE**. Visibilité du nom de ville dans le résumé après application seule : réserve historique de libellé, pas de nouveau défaut reproduit ici.
- Réinitialisation : **PASS historique réutilisé** pour disparition de Douala puis retour accueil après effacement séparé de smartphone ; captures ultérieures attestant « Toutes les villes », Ville vide/« Ex. Douala » et « Aucun filtre actif ». Nouvelle exécution sur la présentation finale : **NON TESTÉ**.
- Échec suivant / Réessayer : **PASS physique historique** pour conservation cartes/position et reprise sans doublon. Nouveau libellé d’erreur : **NON TESTÉ physiquement**.
- Logo et présentation finale : **NON TESTÉ visuellement sur iPhone** ; aucune capture finale disponible. Les preuves historiques sont bornées aux comportements inchangés et ne valident pas automatiquement la grille ou le logo.

### Contrôles et verdict
- Vitest ciblé : **7 fichiers / 43 tests PASS** : discoveryFeedController 14, ListingFeed 4, responsiveLayout 3, getPublicListings 8, searchSession 3, LINK-01 2, releaseCritical 9. Journal `tests-final-2026-11-04.log`. Avertissement de dépréciation react-test-renderer sans échec.
- Lint global : **0 erreur, 13 avertissements**, journal `lint-final-2026-11-04.log`. Deux avertissements Array<T> sont dans la grille ListingFeed préexistante à cette qualification ; les onze autres sont hors fichiers du chantier. Ils ne sont pas maquillés en absence d’avertissement. `git diff --check` : PASS.
- **Verdict : QUALIFICATION TECHNIQUE PASS ; ACCUEIL SOUS RÉSERVES DE RECETTE IPHONE.** Aucun blocage TypeScript restant ni contamination démontrée par réponse de pagination obsolète. Validation physique globale non prononcée, notamment photos, prix longs, texte agrandi, favoris, boutiques et dernière rangée.
- Commit local ciblé du chantier accueil : sources de présentation/pagination existantes, contrôleur et tests associés, ce STATUS, inventaire et trois journaux finaux. SHA fourni dans le retour ; identifiable avec `git log -1` sur cette branche. Instructions `.cursor`, lanceur `scripts/start-ui-home-metro.local.cjs` et anciens journaux laissés locaux, préservés hors commit. Aucun travail non lié indexé ; aucun push, déploiement, backend, version ou dépendance modifié.


## Défaut physique reçu : clavier de la feuille Filtres — 4 novembre 2026
- Contexte revérifié : worktree/racine attendus, branche `feat/ui-home-first-slice`, Git commun canonique, HEAD préalable `2c84cc41ea86b0a72133d31fdf51f19544159e25`, ascendance RC2 réussie. Aucun changement suivi préalable ; fichiers locaux non suivis préservés.
- Preuves du propriétaire : `codex-clipboard-285efd9d-62a3-414a-8208-4e82ecde917f.png` (résultats catégorie Électronique, 3 annonces) et `codex-clipboard-ed7c0160-a32c-44c8-8354-c476cafce1c0.png` (feuille Filtres ouverte, clavier affiché). Sur la seconde capture, le libellé Ville reste visible, mais le champ de saisie est masqué par le clavier. **FAIL physique démontré avant correction**. Ces captures ne valident ni photos QA ni rendu de la grille accueil.
- Cause dans le code : Modal Filtres sans évitement clavier dans sa propre fenêtre et sans défilement du contenu ; le KeyboardSafeView de l’écran parent ne protège pas le contenu natif d’une Modal.
- Correction limitée à `app/(tabs)/search.tsx` : KeyboardSafeView existant ajouté DANS la Modal Filtres (iOS : KeyboardAvoidingView padding ; Android : inset prévu pour modals, sans soustraction safe area), contenu enveloppé dans une ScrollView rétractable. Les champs/actions peuvent défiler dans la place disponible ; taps sur les actions conservés et clavier refermable par glissement. Aucune modification du composant clavier partagé, des autres modals, des règles/handlers de filtres, de la recherche ou de l’accueil.
- Contrôles exécutés après correction : `npm run typecheck` PASS ; ESLint ciblé search.tsx PASS sans avertissement ; Vitest searchFilterHelpers + searchSession : 2 fichiers / 6 tests PASS ; git diff --check PASS. Ces tests vérifient les règles de filtre/recherche, pas le positionnement natif du clavier.
- **Recette iPhone après correction : NON TESTÉE.** À vérifier : recharger le client QA, ouvrir Filtres et toucher Ville, saisir Douala avec le champ visible ; faire défiler vers Prix min/max et Appliquer, fermer/réouvrir le clavier et vérifier Réinitialiser. Aucun PASS physique déduit de la correction ou des tests.
- Verdict actualisé : défaut clavier démontré et correction de code appliquée ; validation native de cette correction encore requise. Les autres réserves de recette accueil restent ouvertes. Commit local séparé de correction, sans push ni déploiement.


## Arbitrage des propositions : raccourci Ville et logo — 4 novembre 2026
- Contexte Git revérifié conforme : worktree attendu, branche feat/ui-home-first-slice, dépôt commun canonique, HEAD préalable 8bd54bbfc25d04f42476a4d34f2bbe9ab47c1102, ascendance RC2 réussie. Aucun changement suivi initial ; non-suivis locaux préservés.
- Capture propriétaire `codex-clipboard-a1cd6102-b0ea-46e3-b038-78443ea2345f.png` : en-tête accueil avec logo sur plaque blanche, raccourci Toutes les villes et bouton Filtres ; feuille complète ouverte, sans clavier. Elle confirme la duplication constatée, pas la correction du clavier après focus.
- Demande d’application conditionnelle >9/10 : appréciation de conception, sans prétendre à une mesure utilisateur. Feuille dédiée Ville : **9,5/10**, retenue (cohérence du libellé, distinction avec Filtres). Y seul transparent/translucide : **8/10**, non retenu (contraste du symbole vert sur vert profond non validé, reconnaissance du symbole seul non établie). Logo inchangé. Commandes /killcritic et /expert absentes du catalogue et de la recherche de skills locaux ; analyse critique réalisée directement, sans prétendre les avoir exécutées.
- `app/(tabs)/search.tsx` : raccourci accueil ouvre maintenant une Modal Ville dédiée, avec saisie manuelle existante et actions Appliquer / Toutes les villes. Pas de catalogue de villes inventé. Brouillon local séparé, initialisé depuis la ville appliquée ; fermeture sans application ne change aucun filtre. Appliquer normalise la ville, synchronise le champ de la feuille complète et relance runSearch avec catégorie, prix et requête appliqués conservés. Toutes les villes retire uniquement la ville. Tri, pagination et caches suivent leurs chemins existants ; la feuille Filtres complète reste accessible au bouton Filtres.
- Évitement clavier et défilement réutilisés dans la nouvelle Modal. `HomeBrandHeader.tsx` : label/hint accessibles du raccourci adaptés à Choisir une ville, aucune modification visuelle du logo.
- Contrôles exécutés : TypeScript PASS ; ESLint ciblé des deux TSX PASS sans avertissement ; Vitest 4 fichiers / 24 tests PASS (searchFilterHelpers 3, searchSession 3, discoveryFeedController 14, ListingFeed 4) ; git diff --check PASS. Relecture des hooks et dépendances, conservation des critères et handlers. Tests existants de règles/lifecycle, pas un test bout en bout de la nouvelle Modal.
- **Recette iPhone nouveau raccourci et clavier : NON TESTÉE.** À observer : ouvrir Toutes les villes → feuille Ville seule ; saisir/appliquer Douala ; vérifier les résultats ; Toutes les villes retire seulement la ville ; Fermer annule le brouillon ; Filtres conserve catégories/prix et saisie Ville. Les réserves antérieures de recette restent ouvertes. Commit local ciblé, aucun push ni déploiement.


## En-tête compact et démonstration visuelle — 4 novembre 2026

### Contexte et en-tête
- Contexte/instructions/STATUS relus avant modifications : racine physique/Git attendue, branche feat/ui-home-first-slice, Git commun canonique, HEAD préalable c0b69d26a1d50967d5d597d395c426c441343437, ascendance RC2 réussie. Changements existants et non-suivis locaux préservés. Metro PID 21098 réutilisé sur 8082, cwd confirmé ; aucun serveur concurrent ni environnement global remplacé.
- En-tête : libellé **Ville** sans critère, nom appliqué ensuite ; raccourci également visible avec résultats, dans sa couleur contextuelle. Feuille Ville dédiée, annulation et retrait du seul critère Ville conservés.
- Recherche accueil : hauteur **minimale 56 pt RN**, rayon **16**, alignement centré. Cibles tactiles >=44 pt. Texte non bloqué à une ligne dans la variante accueil ; au-delà de fontScale 1,2, commande Filtres sur une deuxième rangée et hauteur libre. Même adaptation dans la démonstration. Les autres variantes gardent leurs dimensions.
- Recherche d’actif blanc transparent : assets mobile, public/brand de la copie web et packs `/Users/tommy/APP TESKA/YOUMBIA/logos Youmbia` inspectés. Le fichier `favicon_white_180.png`, ouvert visuellement, est un Y VERT sur fond BLANC, pas un symbole blanc transparent. Aucun actif répondant à la demande trouvé. **Réserve : support blanc du logo conservé** en attendant une véritable déclinaison officielle ; aucun bitmap opaque teinté, aucun dessin modifié ou faux actif officiel créé.

### Fournisseur démo isolé
- Activation exclusivement `__DEV__`, par bouton explicite **Ouvrir la démonstration locale** ou drapeau explicite `EXPO_PUBLIC_HOME_DEMO=1`. Par défaut : désactivé. Une production refuse le mode même avec le drapeau. Écran démo chargé à la demande, authentification/client global inchangés. Sortie explicite **Quitter la démonstration** : retour aux services réels ; favoris démo en mémoire abandonnés, cache réel non pollué. Le détour remonte l’écran réel et ne conserve pas son brouillon de recherche en mémoire.
- 48 fixtures stables `home-demo-01..48` dans `demoProvider.ts`, six catégories/six villes, sept montants de plus d’un milliard, titres longs ; 44 cartes avec photo et quatre sans image. Dix JPEG existants copiés localement, six utilisés. Provenance et empreintes : `assets/demo/PROVENANCE.md` ; README source attribuant les ressources à Pexels, sans URL/photo-auteur individuels établis. Aucun nouveau téléchargement, aucune image QA privée copiée.
- Fournisseur injecté à ListingFeed ; même contrôleur, mêmes cartes/grille et contrat de pagination par six. Cache réel et analytics du fil court-circuités uniquement si fournisseur local présent. Fiches dans une Modal locale, favoris dans un Set local, boutiques fictives dans un bloc pleine largeur. Aucun appel de FavoriteButton ni route réelle avec un ID fictif. Garde supplémentaire : une carte home-demo-* sans contrôles locaux est masquée.
- Critères démo : recherche, ville, catégorie et fourchette de prix filtrent le catalogue local AVANT pagination. Ce rendu ne certifie pas le classement ni les requêtes backend. Documentation d’activation/désactivation/protocole : `docs/ui-redesign/DEMO.md`.

### Contrôles réellement exécutés
- TypeScript : PASS après ajout et après correction de fond. ESLint ciblé : aucune erreur, deux avertissements Array<T> préexistants dans ListingFeed ; nouveaux fichiers sans avertissement. git diff --check PASS. Aucune version/dépendance ni configuration backend modifiée.
- Vitest : **10 fichiers / 54 tests PASS**, journal `demo-tests-2026-11-04.log`. Activation exacte et refus production ; 48 IDs distincts/stables ; critères combinés ; huit lots et sonde finale vide via le vrai contrôleur ; retour effectif au service/cache normal après retrait du fournisseur ; cartes avec source image locale et montant long ; aucun FavoriteButton/route réelle en preview ; cas sans photo ; garde contre un ID démo sans preview ; contrats recherche/pagination/LINK-01/release conservés.
- Texte agrandi : seuil de repli couvert par responsiveLayout ; carte rendue sous mock fontScale 1,5, sans prétendre mesurer une disposition native. Nouveau layout des commandes relu ; **texte OS agrandi / repli une colonne : PASS rapporté par le propriétaire** dans le retour regroupé ci-dessous ; aucune mesure de fontScale physique inventée.
- Metro iOS : bundle HTTP 200 (17 889 731 octets lors du contrôle), présence HomeDemoScreen/previewProvider ; six photos utilisées effectivement servies HTTP 200, signature JPEG vérifiée. Sips lit les dix JPEG à 1100–1200 px de large. Ces vérifications ne valent pas PASS physique.

### Démonstration iPhone : preuves du propriétaire
- Premier retour « pas de photos » : le propriétaire confirme ensuite être sur **l’accueil habituel**. Diagnostic Hermes en lecture seule : MarketplaceSearchScreen monté, zéro carte démo ; ce retour n’est donc pas un échec des photos locales démo. Aucune modification de données/backend depuis l’inspecteur.
- Après activation explicite : confirmation **« Oui, bandeau jaune et photos visibles »**. Capture fournie `codex-clipboard-25ca87a9-a028-450c-b0b1-c9b29a20dcca.png`, conservée sans retouche sous **`docs/ui-redesign/iphone-demo-2026-11-04.png`**.
- **PASS physique borné à cette capture** : bandeau jaune de démonstration et bouton de sortie visibles ; libellé Ville ; deux colonnes ; photos téléphone, chaussures, intérieur et véhicule visibles ; montant à dix chiffres complet avec FCFA sous la première image ; titres sur deux lignes avec troncature. Le compteur 48 affiché ne prouve pas que 48 cartes ont été parcourues.
- Défaut de démonstration visible sur cette capture : fond vert hérité derrière les cartes/tri, alors que le conteneur du fil réel est colors.surface. Correction locale de HomeDemoScreen : enveloppe flex du fil avec **colors.surface**, sans modifier le thème ou la vraie page. La capture conservée est **antérieure** à cette correction de fond ; sa validation physique reste ouverte.
- Retour regroupé ultérieur du propriétaire : **« pass »** à la liste explicite défilement au-delà de 6/12 et dernière rangée, texte OS agrandi donnant une colonne, favori local puis fiche/retour, ville/catégorie/recherche puis réinitialisation et sortie retrouvant les annonces réelles. **PASS physiques rapportés sur ces scénarios démo**, distincts des tests automatisés et de la capture directement inspectée. Aucun nom de ville, requête exacte ou niveau de fontScale inventé. Le nombre exhaustif de cartes parcourues n’est pas explicitement attesté. Boutiques fictives pleine largeur : **NON TESTÉES physiquement** séparément. Correction du fond postérieure à la capture : validation visuelle spécifique encore non attestée.
- **Recette réelle QA distincte** : aucun PASS démo transféré au catalogue réel ; preuves historiques conservées, nouvelles photos QA et scénarios encore ouverts non déclarés validés.

### Verdict et préservation
- Démonstration avec photos et prix long observée sur iPhone ; scénarios démo regroupés PASS rapportés par le propriétaire ; qualification automatique PASS. Réserves : actif officiel blanc transparent manquant, boutiques pleine largeur non confirmées séparément, contrôle du fond après correction et recette réelle QA. Aucun PASS global de l’accueil déduit de la démonstration.
- Travail exclusivement dans le worktree demandé (ressources sources lues, jamais modifiées). Aucun push, déploiement, installation ou changement de version. Anciennes instructions locales, lanceur et journaux non suivis laissés intacts. Commit local ciblé du présent lot, sans inclure ces non-suivis historiques.


## Bloc Boutiques populaires : composant existant et preuve iPhone — 4 novembre 2026
- Contexte/instructions/STATUS relus : worktree attendu, branche feat/ui-home-first-slice, HEAD préalable **7c84475aecdfd5740bf3e2e9e6e6f70f2e383c87** conforme à la référence rapportée, Git commun canonique et ascendance RC2 vérifiés. Modifications suivies initialement absentes ; non-suivis historiques préservés. Metro PID 21098/cwd de ce worktree réutilisé.
- **Cause exacte en démo** : HomeDemoScreen n’utilisait pas PopularShopsSection, seulement un View avec deux noms en texte ; demoProvider ne fournissait aucune boutique. Ce placeholder était inséré après six annonces, donc absent du cadrage initial limité aux quatre premières cartes. Aucune panne de pagination démontrée. Avec moins de six annonces après filtrage, le seuil existant masque toujours le bloc.
- **Conditions normales distinctes** : PopularShopsSection charge getPopularShopsCached, montre un skeleton puis renvoie null si liste vide. Le cache transforme aussi une erreur du service en liste vide. Les données réelles dépendent des boutiques actives mises en avant ou liées aux annonces actives. Aucune lecture QA supplémentaire exécutée : ne pas attribuer l’absence réelle à une base vide sans preuve. La branche résultats de recherche n’affiche pas le fil accueil.
- **Correction** : remplacement du placeholder par **PopularShopsSection et ShopCard existants**, avec option preview explicite. Trois boutiques stables dans le fournisseur démo : Téléphones Démo/Douala, Atelier Mode Démo/Yaoundé, Maison Démo/Bafoussam. Compteurs fictifs de huit, coordonnées nulles, aucune vérification revendiquée. Bannières locales réutilisées, initiales natives du composant. Pas de nouveau rail parallèle ni nouvelle insertion.
- Sans preview, même service/cache et même route réelle /shop/slug. Avec preview : aucune lecture du service boutiques, médias locaux uniquement, callback vers une Modal **BOUTIQUE FICTIVE · destination simulée**, retour local au fil. Garde sur home-demo-shop-* pour empêcher une route réelle si un appel oublie l’option locale. Aucun ID fictif envoyé au backend. Aucun service, version, dépendance ou backend modifié.
- **Insertion préservée** : ListingFeed applicatif inchangé ; un seul marqueur après six annonces, rendu hors des cellules de grille. Tests vérifiant six puis douze annonces, une seule rangée extra, position et ordre conservés, offsets [0,6] puis [6,6], absence de réseau/cache réel en démo.
- **Contrôles** : TypeScript PASS ; ESLint ciblé sans erreur ni avertissement ; **4 fichiers / 28 tests PASS** (rail/cartes 3, ListingFeed 6, fournisseur 5, contrôleur 14). Journal shops-demo-tests-2026-11-04.log. Le test normal vérifie le retour null sur liste vide et la route réelle sur une vraie carte simulée par mock ; le test preview vérifie bannière locale et callback sans route réelle. Bundle iOS Metro HTTP 200, 17 895 830 octets, fixtures boutiques présentes. git diff --check PASS.
- **Captures physiques reçues** : plusieurs captures du propriétaire montrent le bloc ; preuves finales conservées sans retouche : **iphone-demo-boutiques-2026-11-04.png** (original codex-clipboard-9958b049-f97c-4abf-bdee-5c070298909e.png) et **iphone-demo-apercu-2026-11-04.png** (original codex-clipboard-0f8d5a4c-5b6b-47d7-b990-56d6da1074ea.png).
- **PASS visuel borné à la capture** : titre Boutiques populaires et sous-titre destinations simulées lisibles, bloc pleine largeur entre deux rangées d’annonces, deux cartes visibles avec photos, noms, villes et compteurs ; annonces suivantes visibles en dessous. Le fond blanc du fil est également observé, levant la réserve de fond précédente. Une carte à droite partiellement visible est le débordement attendu du rail horizontal.
- **NON TESTÉ physiquement / non confirmé explicitement** : glissement horizontal jusqu’à la troisième boutique, toucher Voir et retour de fiche simulée, parcours complet établissant l’absence de répétition sur tout le fil. La capture ne prouve pas ces actions ; le comportement d’insertion unique et la séparation des destinations sont vérifiés automatiquement. Navigation vers une boutique réelle QA : NON TESTÉE dans ce lot.
- **Évaluation esthétique demandée ensuite** : catégories de la démo **4/10**, boutons textuels provisoires distincts des icônes du HomeCategoryStrip réel ; rail boutiques **5,5/10**, composant existant fonctionnel mais hiérarchie visuelle à simplifier (bannière recadrée, initiales, badge et bouton Voir en concurrence). Appréciations de conception, pas métriques mesurées. Ce n’est pas une validation esthétique finale. Aucune refonte supplémentaire appliquée sur cette demande de notation.
- Documentation DEMO.md actualisée. Capture et tests consignés ; aucune validation globale du catalogue réel ou des autres réserves déduite de la démo. Commit local ciblé, aucun push ni déploiement.


## Finition commune catégories, boutiques et commandes démo — 4 novembre 2026
- Identité renouvelée avant travail : `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche feat/ui-home-first-slice, HEAD préalable **475d4183d286a39640c8d61c26a3c11570d234c9**, Git commun canonique, ascendance RC2 et worktrees vérifiés. Instructions locales/STATUS relus ; aucun changement suivi initial, non-suivis historiques préservés.
- **Catégories** : HomeCategoryStrip conserve sa lecture métier et délègue son rendu à HomeCategoryStripContent. La démo utilise le même rendu, la même lecture via useMarketplaceCategories et les mêmes racines triées, noms et IDs. Suppression de DEMO_CATEGORIES et des IDs locaux arbitraires. Les annonces fixtures gardent une classification par slug de produit, résolue aux vrais IDs reçus ; filtre racine/descendants par collectCategoryBranchIds commun. Une taxonomie absente n’est pas remplacée par une taxonomie inventée. Lecture/cache existants uniquement, aucune écriture de données fictives.
- Variante compacte accueil commune : pictogrammes **25 pt**, support **48×48 pt**, rayon **14 pt**, cellules régulières 76 pt, libellés dessous **12/16 pt**, deux lignes possibles. Sélection via fond menthe renforcé, contour vert et graisse. Callbacks normaux, destinations et libellés accessibles conservés ; handlers démo locaux. Présentation non compacte des autres usages conservée.
- **Boutiques accueil** : variante explicite **ShopCard home**, réutilisée dans les deux modes via PopularShopsSection. Cible **272 pt**, rayon **16 pt**, couverture 104 pt cohérente avec fallback storefront sobre si absente/en échec, nom prioritaire puis **Ville · N annonces**, chevron discret et carte entière cliquable. Aucun bouton Voir redondant, ni statut déclaré dans cette variante. Variantes default/compact conservées et vérifiées par test. Skeleton accueil adapté par option explicite.
- Statut métier conservé dans la fiche normale déjà pourvue de ProSellerBadge (`app/shop/[slug].tsx`) et dans la fiche démo locale. Les données de statut/vérification ne sont pas modifiées. Titre devenu **Boutiques à découvrir** : le classement existant (mise en avant et volume d’annonces actives) n’établit pas une mesure de popularité. Service et classement inchangés.
- **Commandes démo** : panneau replié par défaut, ouvert par le petit indicateur **Démonstration** qui reste visible et accessible (cible >=44 pt). Sortie, compteurs et réinitialisation regroupés dans le panneau, uniquement dans l’écran démo déjà protégé par __DEV__. Aucun panneau ajouté au mode normal.
- ListingFeed applicatif inchangé : bloc pleine largeur après six annonces, insertion unique, ordre et pagination préservés. Les destinations démo restent simulées ; aucune route réelle avec ID fictif. Aucun backend, version, dépendance ou déploiement modifié.
- **Contrôles** : TypeScript PASS ; ESLint ciblé des composants/tests touchés PASS sans avertissement ; **7 fichiers / 42 tests PASS**, journal category-shops-finish-tests-2026-11-04.log. Tests d’équivalence du rendu normal/démo à taxonomie identique, préservation des IDs/callbacks métier, descendants, commandes repliées/réinitialisation/sortie, carte accueil sans bouton Voir/badge, fallback couverture, variantes héritées conservées, insertion unique et pagination. Avertissement de dépréciation react-test-renderer sans échec. git diff --check PASS. Bundle iOS Metro HTTP 200 lors du contrôle, serveur existant réutilisé.
- **iPhone — PASS rapporté par le propriétaire** : réponse explicite **« PASS »** au protocole regroupant catégories menthe et sélection, rail Boutiques à découvrir cliquable, fiche simulée/retour, défilement après le rail, commandes du panneau. Ce retour concerne la démo ; ne pas en déduire une validation du backend ou de toutes les destinations réelles. Nouveau comportement descendants couvert automatiquement, pas physiquement attesté séparément.
- **Captures actualisées haut + rail : en attente** à ce relevé. Les images du lot précédent montrent les anciens gros boutons et anciennes cartes ; elles ne sont pas présentées comme captures finales de cette finition. Réserve visuelle maintenue tant que les deux nouvelles captures ne sont pas reçues. Réserve logo officielle blanche/transparente antérieure inchangée, hors périmètre de ce lot.
- Documentation DEMO.md actualisée, fichiers locaux historiques préservés hors commit. Aucun push.


## Cohérence finale ciblée accueil — 4 novembre 2026
- Contexte Git/instructions/STATUS relus : worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche feat/ui-home-first-slice, référence préalable **f326675b48a628c09b85687b40b447732a76bb31** conforme à la référence rapportée ; Git commun canonique, ascendance RC2, worktrees vérifiés. Aucun changement suivi préalable ; fichiers locaux historiques non suivis préservés. Metro PID 21098, cwd confirmé, réutilisé.
- **Catégorie / libellé / pictogramme** : suppression des raccourcis de libellés qui réduisaient visuellement le périmètre. HomeCategoryStrip affiche le **nom métier exact** reçu (notamment Électronique et Véhicules) avec le pictogramme existant de sa branche par slug. Ni IDs, ni descendants, ni tri des catégories, ni handlers/destinations modifiés. Libellé compact sans nombre maximal de lignes pour conserver son sens avec texte agrandi. Test vérifiant Électronique/pictogramme laptop et callback ID métier inchangé, sans libellé Téléphones trompeur.
- **Feuille Ville commune** : nouveau composant contrôlé CityPickerSheet utilisé dans la route normale et l’écran démo. Un seul titre Ville, champ, suggestions facultatives, Appliquer primaire, Réinitialiser secondaire, fermeture croix/fond/retour système. Évitement clavier et défilement conservés dans la Modal. Les sources ne sont pas mélangées : suggestions normales issues de availableCities existant, suggestions démo issues de DEMO_CITIES. Gestionnaires normaux applyCityPicker/closeCityPicker préservés ; la démo applique seulement sa ville locale. Annuler n’applique pas le brouillon ; réouverture depuis le critère appliqué ; remise à zéro de la ville sans toucher catégorie/recherche/prix. Les feuilles de filtres complets restent distinctes.
- **Montants français communs** : formatPrice ne dépend plus de toLocaleString(fr-FR), dont le regroupement n’apparaissait pas dans les captures Hermes précédentes. Groupes par espace fine insécable U+202F, virgule décimale, espace insécable U+00A0 avant FCFA. Exemple **1 234 567 890 FCFA**. Aucune modification du prix numérique ni arrondi de présentation ; notation scientifique développée pour les grands/petits nombres représentables, absents/non finis rendus vides.
- Textes de prix ListingCard accueil et featured : retrait des limites de lignes/ellipses ; prix accueil sans réduction automatique de police. La hauteur s’adapte au texte OS, sans troncature imposée par le composant. Titres, images, styles généraux, pagination, cache, taxonomie et backend non modifiés.
- **Contrôles** : TypeScript PASS ; ESLint ciblé composants/tests touchés PASS sans avertissement ; **9 fichiers / 37 tests PASS**, journal home-consistency-tests-2026-11-04.log. Couvre locale indisponible, grands prix et précision décimale, source commune des prix, absence de limite de lignes, titre Ville unique et séparation suggestions/brouillon/apply/reset/close, annulation/réouverture/reset démo conservant la catégorie, IDs/libellés/pictogrammes, règles de filtre/recherche et insertion/pagination du fil. Dépréciation react-test-renderer sans échec ; git diff --check PASS.
- **Contrôle iPhone distinct des tests** : diagnostic Hermes en lecture seule sur les deux exports formatPrice chargés : tous deux renvoient exactement **1 234 567 890 FCFA** pour 1234567890. Ce contrôle du runtime ne prétend pas mesurer une disposition visuelle.
- **Recette physique rapportée par le propriétaire : PASS**. Réponse explicite **« pass »** au protocole regroupant : Électronique/pictogramme et filtre large inchangé ; feuille Ville identique en démo et mode normal, fermeture sans appliquer, Appliquer puis Réinitialiser ; montant français à dix chiffres, FCFA entier et texte OS agrandi. Aucun niveau exact de fontScale, autre prix ou parcours supplémentaire inventé. Aucun PASS global du catalogue QA déduit de ces trois cas.
- **Verdict** : les trois corrections ciblées sont vérifiées automatiquement et confirmées sur iPhone par le propriétaire. Réserves historiques hors périmètre, dont l’actif officiel blanc transparent du logo et les captures du lot esthétique précédent, non requalifiées par ce test. Aucune nouvelle retouche graphique générale, version, dépendance, exclusion TypeScript ou backend. Documentation DEMO.md actualisée ; commit local ciblé, aucun push/déploiement.


## Contrôle accueil catalogue connecté QA — 4 novembre 2026

### Contexte Git et périmètre
- Worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche `feat/ui-home-first-slice`, Git commun canonique, ascendance RC2 (`d2e6c122…`) vérifiée. **HEAD `df9087f831b0ab6b9b410e6d90ea38eccc554b6d`** (« Align home category labels, city sheet and French prices »), conforme à la référence demandée.
- Aucune retouche esthétique, backend, déploiement, version ni dépendance pendant ce contrôle. Fichiers locaux non suivis préservés (`connected-qa-read-audit-2026-11-04.json`, capture recherche, journal contrats, lanceur Metro local, `.cursor/`).
- Metro qualifié historiquement : PID **21098**, port **8082**, cwd ce worktree, lanceur `scripts/start-ui-home-metro.local.cjs` (profil **development** eas.json, garde QA sans basculer vers Production).

### Environnement et services (sans secrets)
- **Cible QA confirmée** : identité **YOUMBIA Dev** / slug QA, `APP_ENV` et `EXPO_PUBLIC_APP_ENV` = **development**, projet Supabase **`wagvrytcguutgbjzhvak`** (`https://wagvrytcguutgbjzhvak.supabase.co`). Ref Production **`ainzxommczlyjhymuwgu`** interdite par `scripts/qa-build-guard.cjs`. EAS QA (profil development) distinct du projet Production.
- Clés client chargées comme Metro : uniquement URL et clé anon publiques depuis `youmbia-mobile/.env.development.local` puis `.env` ; ref/url QA depuis `eas.json` **development** — **aucune substitution Production**.
- **Mode démonstration désactivé** pour ce parcours : `isHomeDemoEnabled` exige `__DEV__` **et** `EXPO_PUBLIC_HOME_DEMO === '1'` ; drapeau absent des fichiers env canoniques ; l’accueil réel monte `MarketplaceSearchScreen`, pas `HomeDemoScreen` sauf action explicite « Ouvrir la démonstration locale ». Audit runtime : **`demoMounted: false`**, fil **15 annonces** sans IDs `home-demo-*`.
- **Services réellement sollicités** (lecture publique, non authentifié) : `getMarketplaceCategories`, tentative RPC discovery puis repli **`getPublicListings`** (pagination par range), **`searchListings`** (recherche combinée / vide / tris), **`getListingById`** (fiche), **`getPopularShops`** et **`getPopularShopsCached`** (bloc accueil). Preuve agrégée : `docs/ui-redesign/connected-qa-read-audit-2026-11-04.json` (appels Hermes iPhone + agrégats SQL read-only séparés).
- **Mixpanel** : `mixpanelTokenConfigured: false` en development QA — les appels `trackEvent` ne partent pas en prod analytics depuis ce build ; relevé code ci-dessous pour contrôle Production ciblé.

### Distinction données / vide / erreur (QA)
| Observation | Interprétation |
| --- | --- |
| 15 annonces actives, titres/villes/prix valides, 0 ligne image | **Données absentes** côté médias ; placeholders attendus, pas erreur de lecture fil |
| 0 boutique active (fresh + cache) | **Résultat vide légitime** ; `PopularShopsSection` retourne null — pas d’erreur service |
| RPC discovery `PGRST202` | **Compatibilité QA** ; repli `getPublicListings` utilisé, pagination 6+6+3 = 15 distinctes |
| Requête `zzzzqaabsent…` → total 0 | **Vide légitime** |
| Échec réseau accueil (historique propriétaire) + Réessayer | **Erreur de lecture** traitée par l’UI — PASS physique antérieur, non rejoué dans ce lot |

### Parcours public — attendu / observé / verdict
| Scénario | Verdict | Preuve |
| --- | --- | --- |
| Annonces et infos (titre, ville, prix) depuis QA | **PASS** | Audit JSON : 15 distinctes, `validTitleCityAndFinitePrice`, pas d’IDs synthétiques |
| Photos sur cartes QA | **NON TESTÉ** | `withImages: 0` / 0 lignes image SQL — rendu placeholder non capturé en connecté |
| Ville + catégorie + recherche combinées (smartphone + Douala) | **PASS** | Audit + capture `iphone-connected-search-2026-11-04.png` |
| Ville seule exhaustive | **NON TESTÉ** | Historique partiel (2 cartes) ; non rejoué connecté |
| Tris recent / price_asc / price_desc | **PASS** | Audit : 15 distinctes, ordonnées |
| Pagination accueil, fin des résultats, pas de doublons | **PASS** (lecture + contrats) | Pages 6+6+3, `hasMore` final false ; Vitest discovery/search 55 PASS ; défilement physique **PASS historique** |
| Fiche puis retour même contexte | **PASS historique** | Propriétaire « même position et cartes conservées » ; **NON TESTÉ** sur HEAD `df9087f` connecté |
| Bloc boutiques (lecture + affichage) | **NON TESTÉ** affichage | Service OK, liste vide légitime — pas de rail à lire physiquement |
| Grille 2 col. / prix sous image en connecté | **NON TESTÉ** | Qualification visuelle antérieure surtout en démo ; bundle connecté non re-capturé ici |

Contrats regroupés rejoués : **4 fichiers / 55 tests PASS**, journal `connected-qa-contract-tests-2026-11-04.log`.

### Analytics et compteurs — préparation contrôle Production
Événements Mixpanel déclenchés par les consultations publiques de ce parcours (via `src/lib/analytics.ts`, propriété `platform` ajoutée automatiquement) :
- **`home_feed_viewed`** — focus/refresh accueil (`ListingFeed`, `feed_context` default | refresh ; pas en mode démo fil).
- **`listing_searched`** — chaque recherche appliquée (`search.tsx`, `search_query`, ville/catégorie, `result_count`, `search_outcome`).
- **`listing_viewed`** — ouverture fiche (`app/listing/[id].tsx`, `listing_id`, catégorie/ville, `source` home/search/…).
- **`recent_search_selected`** — si l’utilisateur reprend une recherche récente.
- **`listing_favorited` / `listing_unfavorited`** — si favori depuis carte/fiche (hors scope audit anonyme).
- **`listing_gallery_swiped`** — si galerie avec images (QA sans images : improbable).
- Pas d’événement dédié au seul chargement du rail boutiques ; navigation **`/shop/[slug]`** n’a pas été parcourue (0 boutique QA).

Compteur métier **`views_count`** lu en fiche (audit : 0) ; RPC **`increment_listing_views`** présente au schéma — à corréler en Production si les vues backend doivent monter à chaque consultation.

### Verdict global catalogue connecté
- **Environnement QA : conforme**, démo **désactivée**, catalogue **réel** (15 annonces QA).
- **Lecture services : PASS** sur fil, recherche, tris, pagination logique, fiche, catégories ; **vide légitime** boutiques ; **données absentes** images.
- **Recette physique connectée : PARTIELLE** — PASS recherche combinée capturée ; photos, rail boutiques vide, retour fiche et grille sur ce HEAD : **NON TESTÉ** ou **historique seulement**.
- **Obstacles** : jeu QA sans images ni boutiques actives ; RPC discovery absente (repli OK) ; analytics inactives en dev QA.
- **Réserves Production** : comparer volumes `home_feed_viewed`, `listing_searched`, `listing_viewed` ; vérifier RPC discovery si déployée ; ne pas confondre placeholders QA avec panne CDN ; ne pas transférer les PASS démo au catalogue réel.


## UI-DETAIL-01 — Fiche annonce — 4 novembre 2026

### Identité
- Worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche `feat/ui-home-first-slice`, HEAD `df9087f831b0ab6b9b410e6d90ea38eccc554b6d`. `df9087f` est HEAD, pas un ancêtre distant. Le checkout canonique `youmbia-mobile` (HEAD `55d7f49`) n’a pas été modifié. Aucun reset, rebase, merge ni push.

### Audit (avant modification)
- Route réelle : `app/listing/[id].tsx`, ouverte par `ListingCard` via `/listing/${id}`. Édition séparée : `app/listing/[id]/edit.tsx` (pas sur la fiche publique).
- Rendu : `ListingGallery`, `ListingMeta`, `ListingSeller`, `ListingCharacteristics`, `ListingDescription`, `SecondaryActions`, `ListingActions`, `MarketplaceTrustTips`, `ReportComposerModal`, similaires via `ListingCard` si `FF_SIMILAR_LISTINGS`.
- Données : `getListingById`, `getListingDynamicAttributesForDisplay`, `getFavoriteIds` / `toggleFavorite`, `getSellerStats`, `getSimilarListings`, `getSession`. Aucun schéma, RLS ni Edge Function touché.
- Actions déjà réelles : favori (auth gate), message (`getOrCreateConversation`), WhatsApp / appel / SMS (`sellerContact` + intent), partage (`shareListing`), profil `/user/[id]`, boutique `/shop/[slug]` si publique, signalement, disponibilité, vendue / réactivation / renouvellement propriétaire.
- Retour : `AppHeader` faisait `router.back()` si possible, sinon accueil. Le fil conserve sa position tant que l’écran recherche reste monté. Ce contrat n’est pas changé.
- Réserves d’audit : titre tronqué à 2 lignes, photo en `cover`, favori dupliqué, propriétaire pouvait voir la barre de contact, erreur sans reprise explicite, compteur `1 / 1` même pour une seule photo.

### Modifications
- `ListingGallery` : photo en `contain` (pas de recadrage), compteur `1 / N` seulement s’il y a plusieurs photos, zoom plein écran inchangé, retour et favori flottants, « Aucune photo » / « Photo indisponible ».
- `ListingMeta` : prix FCFA via `formatPrice` en tête, titre complet, lieu réel, ancienneté via `timeAgo` sur `last_published_at` sinon `created_at` (date future ou invalide omise), catégorie seulement si le libellé taxonomie existe. Badges Urgent / À la une seulement si les drapeaux sont vrais.
- `ListingDescription` : sauts de ligne conservés ; « Lire la suite » / « Réduire » au-delà de 280 caractères, réversible.
- `ListingSeller` : nom ou boutique publique en titre, nom de personne en sous-titre si distinct, « Voir la boutique » dans la carte. Badges de confiance existants conservés, aucun badge inventé. Signal de réponse toujours conditionné à `response_hint`.
- `ListingActions` : action principale « Contacter le vendeur » (messagerie existante), puis WhatsApp, Appeler et SMS seulement si le numéro existe. Barre absente pour le propriétaire et pour une annonce vendue. Hauteur mesurée pour ne pas couvrir le contenu. Texte agrandi : colonne, boutons qui grandissent.
- `SecondaryActions` : partage conservé. Favori retiré du corps (il est sur la photo). Appel / SMS restent dans le corps quand la barre ne les porte pas (annonce vendue, vendeur restreint).
- Écran : en-tête « Annonce » retiré sur le succès au profit de la photo ; chargement et erreur gardent `AppHeader`. Erreur : Réessayer relance `getListingById`. Message réseau reconnu → « Connexion indisponible ».
- Propriétaire : marquer vendue, renouveler, réactiver, disponibilité et signalement tiers inchangés. Pas d’auto-contact.

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**, 0 erreur.
- ESLint ciblé des fichiers de la tranche : **PASS**, 0 erreur, 0 avertissement.
- Vitest : `ListingGallery` 8, `ListingDescription` 3, `ListingActions` 3, `sellerResponseSignal` 1, `listingSoldDiscovery` 8 : **PASS**. Avertissement historique de dépréciation `react-test-renderer`, sans échec.
- `git diff --check` : **PASS**.
- Metro relancé pour cette tranche : PID du lanceur **47213**, cwd `youmbia-ui-home`, port **8082** seul, `/status` = `packager-status:running`. Lien dev : `exp+youmbia-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.89%3A8082`. Bundle iOS HTTP, 16 702 667 octets, contient « Contacter le vendeur », « Lire la suite », « Ajouter aux favoris » et `resizeMode: "contain"` sur la photo de galerie. Cela ne valide pas l’affichage iPhone. Avertissement Sentry « Missing config for organization, project » déjà émis par le plugin au démarrage, hors de cette tranche. Avertissements Node `NO_COLOR` / `FORCE_COLOR` au lancement, sans échec du packager.

### iPhone — tous NON TESTÉS pour cette tranche
Aucun scénario physique n’est validé : ouverture depuis l’accueil, photos, favori, description, vendeur, canaux, partage, données partielles, retour avec position, texte agrandi, erreur réseau, débordement. Captures haut / milieu / bas : **non jointes**. La validation doit être confirmée sur l’appareil, pas déduite des tests.

### Réserves
- Le jeu QA historique n’a pas de photos d’annonces : le cas « plusieurs photos » ne sera visible que sur une annonce qui en a.
- Aucun commit, push, PR ni déploiement.

### Finition premium Harrier — exécution finale (4 novembre 2026, soir)
- Direction : photo immersive, chrome flottant (Retour · Partager · Favori), feuille blanche arrondie chevauchant la galerie (`contentSheet`), grille de caractéristiques pilotée par attributs dynamiques + legacy dédupliqué, barre fixe **WhatsApp + Envoyer un message** (messagerie prioritaire côté produit), Appeler/SMS conservés dans le corps via `SecondaryActions`.
- **Démo locale** : cause du zoom chaussure = `resizeMode="cover"` + ratio 4:3 dans `HomeDemoScreen` (modal fiche démo). Correction : conteneur 240 pt, `contain`, fond neutre — sans toucher au fil réel ni aux fixtures.
- **Sans photo** : hauteur galerie compacte `LISTING_GALLERY_PLACEHOLDER_HEIGHT` = 168 pt (plus de grand vide avant le prix).
- Fichiers ajoutés : `src/lib/listingAttributeIcon.ts` (+ test), tests galerie/actions/description inchangés en nombre mais enrichis.
- Fichiers touchés en plus de la tranche matin : `ListingCharacteristics.tsx`, `HomeDemoScreen.tsx`, `SecondaryActions.tsx` (`showShare`), `app/listing/[id].tsx` (partage galerie, feuille), `ListingGallery.tsx`, `ListingActions.tsx`, `ListingSeller.tsx`.
- Contrôles rejoués : `tsc` PASS ; ESLint ciblé PASS (0 erreur) ; Vitest ciblé **26 PASS** (galerie 10, actions 3, description 3, attribut-icon 2, sold contract 8, TOM-101 1) ; bundle iOS 8082 **16 705 257** octets avec `Envoyer un message`, `contentSheet`, tuiles caractéristiques.
- iPhone réel : **NON VALIDÉ** — protocole prêt ci-dessous ; captures haut / milieu / bas **à joindre** par le propriétaire après reload `exp+youmbia-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.89%3A8082`.

### Finition polish UI-DETAIL-01 — 4 novembre 2026 (post-captures satisfaisantes)
- **Densité verticale** : `ListingMeta` marge basse `lg` → `md` ; `ListingSeller` marge haute `base` → `xs` (écart meta → vendeur ~16 pt au lieu de ~36 pt). Caractéristiques dynamiques et texte agrandi non régressés.
- **Carte vendeur adaptative** : mode compact (avatar 40 pt, padding réduit) si seuls nom + avatar ; carte complète si membre depuis, compteur d’annonces, badges réels, boutique, Pro, signal réponse, etc. `statsRow` et `ProSellerBadge` omis lorsqu’ils seraient vides.
- **Prix démo** : fil (`ListingCard` + `formatPrice` `@/lib/format`) et modal démo ; test catalogue `1 234 567 890 FCFA` ; non-régression `ListingCard.preview.test` (libellé carte = `formatPrice`, séparateurs `\u202f` présents).
- **Validation fonctionnelle (code / tests, sans écriture base)** : galerie multi + zoom (`ListingGallery.test`) ; favori/partage (handlers fiche + galerie) ; WhatsApp + message et message seul (`ListingActions.test`) ; propriétaire sans barre (`ListingActions.test`) ; retour fil (`ListingFeed` sans `key` sur FlatList). Fixtures démo **ne valident pas** Supabase, messagerie ni WhatsApp natif.
- **Contrôles polish** : `tsc` PASS ; ESLint ciblé PASS ; Vitest ciblé **26 PASS** (6 fichiers : galerie 9, actions 3, description 3, vendeur 2, attribut-icon 2, démo 7) ; `git diff --check` PASS.
- **iPhone encore à confirmer explicitement** : voir **Réserves QA** ci-dessous.
- Aucun commit, push, PR ni déploiement.

### Réserves QA — UI-DETAIL-01 (non bloquantes pour commit local)
1. **Galerie réelle multi-images** — parcours zoom/swipe sur annonce connectée avec plusieurs photos (le catalogue QA et une partie des fixtures n’en ont pas ; la démo locale ne remplace pas Supabase/CDN).
2. **Contact vendeur sur iPhone** — WhatsApp, messagerie YOUMBIA, barre fixe + clavier, message seul sans numéro ; validation native, pas seulement tests composants.
3. **Retour accueil avec conservation du scroll** — ouvrir une fiche depuis le fil connecté, revenir, vérifier la position de scroll (contrat `ListingFeed` conservé ; confirmation physique recommandée).

### Préflight commit local UI-DETAIL-01
- Périmètre staged : fiche annonce, composants listing, démo (affichage prix + zoom modal), tests, `listingAttributeIcon`, `STATUS.md` — **exclus** : `.cursor/`, logs/captures QA, `scripts/start-ui-home-metro.local.cjs`.
- Contrôles pré-commit : voir rapport agent (tsc, ESLint ciblé, Vitest, `git diff --check`).
- **En attente** : confirmation propriétaire puis `git commit` local uniquement ; pas de push.


## UI-FAVORITES-01 — Onglet Favoris premium — 4 novembre 2026 (Phase B)

### Identité et garde-fous
- Worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche `feat/ui-home-first-slice`, HEAD de référence `204aa9bc4bbae019b8d01501834f17fd49d213a9` (inchangé pendant l’implémentation locale).
- Cible Supabase QA inchangée : `wagvrytcguutgbjzhvak` via `eas.json` development + lanceur Metro local ; garde anti-PROD `qa-build-guard.cjs` non contournée ; **aucune modification** des fichiers d’environnement.
- Aucun commit, push, merge, déploiement, changement backend/RLS/API.

### Implémentation (Option A audit)
- `app/(tabs)/favorites.tsx` : en-tête vert `#0B4D3C`, compteur d’annonces visibles, grille premium `ListingCard` (`feedPresentation="home"`, `source="favorites"`), repli 1 colonne (`getHomeFeedColumnCount`), pull-to-refresh, états empty / indisponible / erreur distincts, CTA « Découvrir des annonces ».
- `src/features/favorites/FavoritesScreenHeader.tsx`, `favoritesDisplay.ts` (dérivation affichage sans purge des favoris distants).
- `src/features/listings/homeFeedGridRows.ts` : factorisation des rangées grille (réutilisée par `ListingFeed.tsx`).
- `app/listing/[id].tsx` : cœur fiche branché sur `FavoritesContext` (sync accueil ↔ fiche ↔ onglet).

### Synchronisation favoris
- Onglet : `refresh()` du contexte puis `getFavorites()` au focus / refresh ; pool hydraté + filtre optimiste sur le Set global ; fetch incrémental `getListingsByIds` pour ids manquants.
- Favoris enregistrés sans annonce active : écran ou bandeau « indisponible », **sans** suppression en base.
- Fiche : `toggleFavorite` contextuel (plus d’état local divergent).

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé (favoris + fiche + grille) : **PASS** (0 erreur)
- Vitest ciblé : **4 fichiers / 14 tests PASS** (`favoritesDisplay`, `FavoritesScreenHeader`, `FavoritesScreen`, `homeFeedGridRows`)
- `git diff --check` : **PASS**

### Recette iPhone — **NON VALIDÉE** (protocole prêt)
- Metro QA existant port **8082** (`scripts/start-ui-home-metro.local.cjs`), démo **désactivée**, compte acheteur QA.
- Scénarios : favori accueil → onglet → fiche → retrait ; retour/scroll ; empty ; erreur + Réessayer.
- **Réserve distincte** : photos QA absentes / bucket Storage (placeholders attendus).

### Réserves
- Validation physique onglet Favoris et sync multi-écrans : **en attente propriétaire**.
- Images Supabase QA : hors périmètre de cette tranche (documenté audit QA connecté).


## UI-FAVORITES-01 — Finition polish — 4 novembre 2026

### Corrections ciblées
- **Grille 2 col., dernière ligne impaire** : `getHomeFeedGridCellLayout` (`responsiveLayout.ts`) — une carte seule (1, 3 ou 5 favoris) garde **la largeur d’une colonne**, sans étirement pleine largeur (`favorites.tsx`).
- **En-tête** : `paddingBottom: 6` aligné sur `AppHeader` compact ; `paddingTop` liste réduit à `spacing.xs` sous le bandeau vert.

### Vérifications (automatisées + protocole iPhone)
| Point | Automatisé | iPhone (captures OK direction DA) |
| --- | --- | --- |
| Grille 1–5 favoris | Vitest : rangées `[1]`, `[2]`, `[2,1]`, `[2,2]`, `[2,2,1]` + layout cellule seule | **À reconfirmer** après fix largeur 1 carte |
| Retrait + compteur | Vitest `deriveFavoritesDisplay` (retrait optimiste → `empty_none`) | Sync accueil/fiche/onglet : **re-vérifier** sur device |
| Empty dernier favori | Vitest | Protocole iPhone |
| Erreur + Réessayer | Vitest `FavoritesScreen` | Protocole iPhone |
| Scroll retour fiche | Contrat inchangé (`FlatList` sans remontage) | Protocole iPhone |
| Texte agrandi | Vitest `getHomeFeedColumnCount` → 1 col. | Protocole iPhone |

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé favoris : **PASS**
- Vitest : favoris + `responsiveLayout` + `homeFeedGridRows` : **PASS** (voir rapport agent)
- `git diff --check` : **PASS**

### Réserves QA ouvertes
- Photos / bucket Storage QA absents (placeholders).
- Revalidation iPhone rapide recommandée pour **1 favori en grille** et **sync compteur** après cette finition.


## UI-FAVORITES-01 — Commit local — 4 novembre 2026

### Identité
- Worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche `feat/ui-home-first-slice`.
- **HEAD `7fa8fc362510d3969285c49180a49a284dda649b`** — `feat(ui): refondre les favoris et synchroniser les coeurs (UI-FAVORITES-01)`.
- Parent immédiat : `204aa9b` (UI-DETAIL-01). Aucun push, merge, déploiement ni modification backend dans ce lot.

### Contenu livré (rappel)
- Onglet Favoris premium (en-tête vert `#0B4D3C`, grille `ListingCard` home, états empty / erreur / indisponible).
- Sync cœurs via `FavoritesContext` sur fiche annonce ; factorisation `homeFeedGridRows` ; layout cellule impaire favoris (`getHomeFeedGridCellLayout`).

### Réserves QA — **toujours ouvertes** (non résolues par le commit)
Les captures propriétaire valident la direction artistique ; les scénarios suivants restent **documentés comme réserves** jusqu’à PASS explicite sur build connecté QA (Metro 8082, démo off) :

| Scénario | Attendu | Statut |
| --- | --- | --- |
| **Retrait synchronisé** | Cœur accueil, fiche et onglet Favoris + **compteur** cohérents après add/remove | **NON re-certifié** iPhone sur HEAD `7fa8fc3` (code + tests unitaires OK) |
| **Empty / error** | Dernier favori retiré → empty premium ; panne réseau → **Réessayer** | **NON re-certifié** iPhone |
| **Retour fiche + scroll** | Position `FlatList` conservée au `router.back()` | **NON re-certifié** iPhone |
| **Photos QA** | Placeholders attendus si bucket Storage absent | **Réserve infrastructure QA** (audit connecté) |

Impact grille : `getHomeFeedGridCellLayout` **uniquement** favoris ; accueil inchangé (`ListingFeed`).

### Contrôles au commit
- `npx tsc --noEmit`, ESLint ciblé favoris, Vitest ciblé : **PASS** au préflight du commit.
- Fichiers locaux historiques (`.cursor/`, logs/captures QA, `scripts/start-ui-home-metro.local.cjs`) **hors** commit.


## UI-FAVORITES-01 — Préflight commit local — 4 novembre 2026 (historique)

### Réserves recette iPhone (post-validation DA, hors périmètre commit)
Les captures propriétaire valident la **direction artistique** de l’onglet Favoris. Les scénarios suivants restent **documentés comme réserves QA** jusqu’à PASS explicite sur build connecté QA (Metro 8082, démo off) :

| Scénario | Attendu | Statut |
| --- | --- | --- |
| **Retrait synchronisé** | Cœur accueil, fiche (`FavoritesContext`) et onglet Favoris + **compteur** cohérents après add/remove | **NON re-certifié** sur HEAD de commit (sync code + tests unitaires OK) |
| **Empty / error** | Dernier favori retiré → empty premium ; panne réseau → message + **Réessayer** (pas d’empty trompeur) | **NON re-certifié** iPhone sur ce lot |
| **Retour fiche + scroll** | `FlatList` favoris sans remontage ; position conservée au `router.back()` depuis une fiche | **NON re-certifié** iPhone |
| **Photos QA** | Catalogue QA sans images / bucket Storage absent → placeholders ; ne pas interpréter comme bug Favoris | **Réserve infrastructure QA** (audit connecté) |

### Impact grille sur les autres écrans
- `getHomeFeedGridCellLayout` est consommé **uniquement** par `app/(tabs)/favorites.tsx`.
- Accueil (`ListingFeed`) conserve `homeGridCell: { flex: 1 }` ; extraction `homeFeedGridRows.ts` sans changement de rendu accueil (tests `ListingFeed` rejoués au préflight).

### Fichiers prévus pour le commit UI-FAVORITES-01
- `app/(tabs)/favorites.tsx`, `app/listing/[id].tsx`
- `src/features/favorites/**`, `src/features/listings/homeFeedGridRows.ts`, `homeFeedGridRows.test.ts`
- `src/features/listings/ListingFeed.tsx`
- `src/lib/responsiveLayout.ts`, `responsiveLayout.test.ts`
- `docs/ui-redesign/STATUS.md`

**Exclus** : `.cursor/`, logs/captures QA, `scripts/start-ui-home-metro.local.cjs`.

**Statut** : commit local réalisé — voir section **UI-FAVORITES-01 — Commit local** (`7fa8fc3`). Aucun push.


## UI-MESSAGES-01 — Phase A (audit + GO doc) — 4 novembre 2026

### Identité et garde-fous
- Worktree `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, branche `feat/ui-home-first-slice`, **HEAD `7fa8fc362510d3969285c49180a49a284dda649b`**.
- **Phase A uniquement** : documentation, audit profond, architecture cible et recommandation GO/NO-GO — **aucune** nouvelle interface implémentée dans ce lot.
- **Périmètre Phase B (futur)** : **boîte de réception uniquement** — `app/(tabs)/messages.tsx` et composants UI extraits associés (en-tête, rangées, états vides/erreur, swipe masquer).
- **Hors périmètre explicite Phase B** : fil `app/conversation/[id].tsx`, services Supabase conversations/messages, RLS, RPC, canal `messagingRealtime.ts`, push, configuration (`app.json`, `eas.json`, env).
- Aucun commit, push, merge, PR ni déploiement dans cette phase A.

### État actuel (résumé audit)
- Écran inbox monolithique (~470 lignes) : cache `lightCache` (`inbox.{userId}`), `getConversations()` au focus, patch Realtime local (`patchInboxOnIncoming` / `patchInboxOnRead`), swipe `SwipeToDeleteRow` + `hideConversationForMe`.
- Badge onglet Messages : `useUnreadConversationsCount` (conversations distinctes non lues) — sémantique **≠** pastille par ligne (`unread_count` = messages non lus dans la conversation).
- **Tests automatisés inbox UI** : absents ; contrats partiels dans `hideConversationForMe.test.ts` (références fichier UI seulement).

### Risques de désynchronisation identifiés (à traiter en Phase B UI ou tests)
1. **`emitConversationRead` lors du masquage swipe** : optimisme retire la conversation de la liste **et** émet `conversation_read`, ce qui peut **abaisser le badge onglet sans marquer lu côté serveur** si des non-lus restent.
2. **Message entrant Realtime avec fil ouvert** : le hook badge ignore `getOpenConversationId()` côté inbox row mais l’inbox **incrémente quand même** `unread_count` sur la rangée si l’utilisateur revient à la liste sans refetch.
3. **Cache inbox** : patches Realtime ne réécrivent pas systématiquement `lightCache` → réouverture possible avec compteurs/previews obsolètes jusqu’au prochain `getConversations`.
4. **`getConversations` fallback** : erreurs Supabase → `{ data: [], error: null }` → empty state **sans** écran erreur (comportement service existant ; risque de confusion QA).
5. **`message_updated` (read_at)** : ignoré par l’inbox ; badge rafraîchi via `refreshFromServer(true)` dans le hook, pas la liste inbox.

### Architecture UI premium cible (Phase B — réutilisation tokens/composants)
- En-tête : composant dédié calqué sur `FavoritesScreenHeader` (`#0B4D3C`, titre « Messages » ou « Boîte de réception », sous-titre optionnel compteur conversations).
- Liste : extraire `InboxConversationRow` (avatar `UserAvatar`, typo `typography` / `fontWeights`, séparateurs `colors.borderLight`, pastille non-lu `colors.primary`).
- Logique pure : `inboxPatches.ts` (`sortConversationsInbox`, patch insert/read) + tests Vitest **avant** retouches visuelles lourdes.
- Conserver `SwipeToDeleteRow`, `EmptyState`, `Button`, `Screen`, `RefreshControl` ; remplacer couleurs avatar en dur (`#EEF2FF`) par tokens surface existants.
- **Ne pas** dupliquer le canal Realtime ; s’abonner via `subscribeMessagingEvents` comme aujourd’hui.

### Fichiers prévus Phase B (modification)
| Fichier | Rôle |
| --- | --- |
| `app/(tabs)/messages.tsx` | Orchestration allégée, branchement header/row |
| `src/features/messages/MessagesScreenHeader.tsx` | Bandeau vert marketplace |
| `src/features/messages/InboxConversationRow.tsx` | Rangée + accessibilité |
| `src/features/messages/inboxPatches.ts` | Fonctions pures extraites de l’écran |
| `src/features/messages/inboxPatches.test.ts` | Couverture sync insert/read/tri |
| `src/features/messages/MessagesScreen.test.tsx` | États empty/error/cache stub (optionnel, mock services) |
| `docs/ui-redesign/STATUS.md` | Suivi recette iPhone Phase B |

**Non modifiés (sauf correction UI-local explicitement validée)** : `src/services/conversations/*`, `src/lib/messagingRealtime.ts`, `app/conversation/[id].tsx`, `app/(tabs)/_layout.tsx` (badge).

### Tests nécessaires Phase B
- Unitaires : patches inbox (message autre vs soi, tri, `refetch`, read zéro compteur).
- Régression : masquer conversation **ne doit pas** fausser le badge (test + correction `emitConversationRead` au swipe si validé).
- Contrat : persistance cache après fetch réussi et après masquage optimiste.
- Recette iPhone : focus inbox + message entrant, ouverture fil + retour, swipe masquer, pull-to-refresh, badge vs pastille ligne.

### Recommandation Phase B
- **GO conditionnel** pour l’implémentation UI inbox premium **si** la Phase B démarre par l’extraction `inboxPatches` + tests et inclut la correction du point (1) swipe/badge dans le même lot UI (sans toucher RPC/RLS).
- **NO-GO** pour un simple reskin sans tests ni correction badge/masquage — risque de régression sync élevé.

### Recette iPhone Phase B
- **NON VALIDÉE** — protocole ci-dessus ; Metro QA 8082, démo off, compte avec au moins une conversation et messages non lus.


## UI-MESSAGES-01 — Phase B (Design V2 inbox premium) — 4 novembre 2026

### Baseline
- **HEAD de départ** : `7fa8fc362510d3969285c49180a49a284dda649b` (UI-FAVORITES-01). Worktree/branche conformes.
- **Données conversation** : le type `Conversation` expose `listing_title`, interlocuteur, preview, dates, `unread_count` — **aucune URL d’image d’annonce** sans modifier `getConversations`. Miniature = **placeholder marketplace** (icône `image-outline`, fond `surfaceSubtle`), aligné ListingCard « sans photo ».
- **Comportements métier conservés** : cache `lightCache`, focus `fetchInbox`, patches Realtime (`inboxPatches.ts`, logique identique Phase A), swipe `SwipeToDeleteRow`, `hideConversationForMe`, `emitConversationRead` au masquage (**dette documentée, non corrigée**), navigation `/conversation/[id]`, gate auth, états empty/error/network, sémantique badge onglet inchangée.
- **Tests baseline** : `hideConversationForMe.test.ts` 11 PASS avant implémentation.

### Implémentation Design V2
- **En-tête** : `MessagesScreenHeader` — vert `#0B4D3C`, titre « Messages », sous-titre « N conversation(s) non lue(s) » dérivé des lignes (`unread_count > 0`), pas du badge onglet.
- **Ligne** : `InboxConversationRow` — ordre lecture annonce (titre 2 lignes) → interlocuteur → aperçu → date à droite → badge si non-lu ; miniature 72 pt placeholder ; densité réduite vs ancienne carte avatar 56 pt + corps vertical participant-first.
- **Orchestration** : `app/(tabs)/messages.tsx` allégé ; extraction `inboxDisplay.ts`, `inboxPatches.ts` (caractérisation tests, sémantique inchangée).

### Fichiers touchés
| Fichier | Action |
| --- | --- |
| `app/(tabs)/messages.tsx` | Refonte présentation + imports |
| `src/features/messages/MessagesScreenHeader.tsx` | Créé |
| `src/features/messages/InboxConversationRow.tsx` | Créé |
| `src/features/messages/inboxDisplay.ts` | Créé |
| `src/features/messages/inboxPatches.ts` | Créé (extrait identique) |
| `src/features/messages/*.test.ts(x)` | Créés |
| `docs/ui-redesign/STATUS.md` | Ce relevé |

**Non modifiés** : services Supabase, `messagingRealtime.ts`, `app/conversation/[id].tsx`, `_layout` badge, Accueil (`search.tsx`), Fiche (`listing/[id].tsx`), Favoris.

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé `messages.tsx` + `src/features/messages/**` : **PASS** (0 erreur)
- Vitest : **6 fichiers / 30 tests PASS** (`inboxDisplay`, `inboxPatches`, header, row, contract inbox, `hideConversationForMe` 11)
- `git diff --check` : **PASS**

### Dette métier séparée (inchangée volontairement)
1. `emitConversationRead` lors du masquage swipe — peut fausser le badge sans `markConversationRead` serveur (audit Phase A).
2. Cache inbox non réécrit sur chaque patch Realtime.
3. `getConversations` fallback liste vide masque certaines erreurs serveur.
4. Pas de miniature annonce réelle tant que le service n’expose pas d’image (évolution backend hors scope).

### Risques résiduels UI
- Placeholder systématique sur miniature : l’annonce est identifiable par **titre**, pas par photo réelle en QA.
- Sous-titre header = conversations non lues **lignes** ; pastille ligne = **messages** non lus — distinction produit conservée.

### Recette iPhone Design V2 — **NON VALIDÉE**
Protocole : Metro QA existant port **8082**, Supabase `wagvrytcguutgbjzhvak`, démo off. Scénarios 1–15 de la spec (liste dense, non-lu, fil/retour, swipe, refresh, badge, empty/error, texte agrandi/VoiceOver). **Captures à fournir par le propriétaire** — aucun PASS physique inventé.

### Sortie
- Refonte **présentation inbox uniquement** ; métier et sync **non modifiés** sauf extraction testée des patches.
- **Pas de commit / push / PR** sur cette livraison.


## UI-MESSAGES-01 — Enrichissement miniatures annonces — 4 novembre 2026

### Audit (services existants suffisants)
- **`Conversation.listing_id`** : clé annonce ; pas d’URL image sur le modèle métier.
- **`getConversations`** : charge `listings.id, title, user_id` uniquement — **pas** de `listing_images`.
- **`getListingsByIds(ids)`** : annonces **actives** (`status = active`), sélect public + **`listingStoragePathsForCardCover`** / **`getSignedUrlsMap`** (vignette `thumb_path` prioritaire, cache mémoire session `listingImageUrl.ts`).
- Annonce **inactive/supprimée** : absente du batch → placeholder ; titre peut rester « Annonce supprimée » via join conversation existant.
- **RLS** : inchangée ; échec Storage/sign → pas d’URL, placeholder (pas de disparition de conversation).

### Implémentation
- État UI **`thumbByListingId`** via `useInboxListingThumbs` + `loadInboxListingThumbsForIds` — **1 appel `getListingsByIds` par ensemble distinct d’IDs** (clé stable `idsKey`), pas de re-fetch Realtime si les IDs inchangés.
- **`InboxListingThumb`** : 72 pt, `resizeMode cover`, placeholder identique, `onError` → placeholder, hauteur fixe.
- **`messages.tsx`** : `sessionUserId` pour invalider les requêtes obsolètes au changement de compte ; enrichissement **non bloquant** pour inbox/cache/realtime.

### Requêtes réseau additionnelles (scénarios)
| Scénario | Appels `getConversations` | Appels `getListingsByIds` |
| --- | --- | --- |
| Focus inbox N conv, K annonces distinctes | 1 (existant) | **+1** batch `.in(id)` + sign URLs internes |
| Realtime message (mêmes annonces) | 0–1 si refetch conv inconnue | **0** |
| Pull-to-refresh | 1 | **+1** si IDs identiques (re-sign cache mémoire possible) |
| 3 conv, 2 même `listing_id` | 1 | **+1** avec 2 IDs max |

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé messages : **PASS**
- Vitest messages + hide contract : **PASS** (voir journal ci-dessous)
- `git diff --check` : **PASS**

### Limites / réserves
- **Catalogue QA** : souvent 0 image Storage → placeholders attendus ; **PASS photos réelles = recette connectée avec annonces illustrées**, non déclaré ici.
- **`getListingsByIds`** ignore annonces non actives : pas de photo même si conversation historique existe.
- Dette Phase A (**`emitConversationRead` au masquage**, etc.) **inchangée**.

### Checklist iPhone (propriétaire — NON VALIDÉE)
1. Liste dense + photos réelles si annonces QA avec images
2. Placeholder sans photo
3. Non-lu / lu
4. Textes longs
5. Fil + retour scroll
6. Swipe / annulation
7. Pull-to-refresh
8. Badge vs pastille
9. Texte agrandi / VoiceOver
10. Pas de clignotement scroll

Metro **8082**, QA `wagvrytcguutgbjzhvak`, démo off.


## UI-MESSAGES-01 — Démonstration locale inbox (Dev Client) — 4 novembre 2026

### Fichiers créés
- `src/features/messages/demo/messagesDemo.ts` — garde `__DEV__` + `EXPO_PUBLIC_MESSAGES_DEMO=1`
- `src/features/messages/demo/messagesDemoFixtures.ts` — 8 conversations + vignettes locales
- `src/features/messages/demo/messagesDemoImages.ts` — URIs bundle (`assets/demo/listings/*`)
- `src/features/messages/demo/MessagesDemoScreen.tsx` — liste réutilisant header/row/thumb réels
- `src/features/messages/demo/messagesDemo.test.ts`
- `src/features/messages/MessagesInboxDemoEntry.tsx` — bouton d’activation
- `src/features/messages/MessagesInboxScreen.tsx` — inbox connectée extraite
- `app/(tabs)/messages.tsx` — aiguillage démo / réel uniquement

### Activation (Dev Client, Metro 8082)
1. Se connecter à l’onglet **Messages** (gate auth inchangé).
2. Toucher **Ouvrir la démonstration locale** sous l’en-tête (liste non vide) ou sous l’empty state.
3. Bandeau : **« Démonstration locale — aucune conversation réelle »** ; panneau **Démonstration** → réinitialiser / quitter.

Alternative au lancement Metro : `EXPO_PUBLIC_MESSAGES_DEMO=1` (avec `__DEV__` uniquement ; **inactif en production**).

### Garanties d’isolation
- Aucun `getConversations`, cache inbox, Realtime, RPC masquage, `emitConversationRead`, navigation `/conversation/[id]` en démo.
- Vignettes = JPEG locaux déjà utilisés par la démo Accueil (`assets/demo/listings/`).
- Swipe = retrait **mémoire** ; **Réinitialiser** restaure les 8 fixtures.
- Tap = Modal « Conversation de démonstration » — **remplacé en dev par fil premium local** (Visual QA Demo) ; pas d’envoi, pas de badge onglet global modifié.

### Contrôles exécutés
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé messages : **PASS**
- Vitest messages + hide contract : **8 fichiers / 44 tests PASS**
- `git diff --check` : **PASS**

### Captures attendues (propriétaire)
- Haut inbox démo + bandeau jaune
- Grille de 8 lignes (photos + 2 placeholders)
- Pastilles non lus (conv 1 et 3)
- Modal aperçu + swipe local
- Retour inbox QA après **Quitter la démonstration**

### Risques résiduels
- **PASS iPhone non déclaré** ici.
- Catalogue QA réel peut rester vide ; la démo ne le remplace pas tant qu’elle n’est pas activée.
- Dette métier inbox réelle (masquage/badge) inchangée hors démo.


## UI-MESSAGES-01 — P0 crash iPhone (lazy démo) — 4 novembre 2026

### Symptôme
- Onglet **Messages** : `Element type is invalid… Lazy element type must resolve to: undefined` (stack `app/(tabs)/messages.tsx`).

### Cause racine confirmée
- `React.lazy` + `import()` avec remapping `{ default: m.MessagesDemoScreen }` alors que le module n’expose qu’un **export nommé** `MessagesDemoScreen`.
- Au runtime Metro/Hermes, `m.MessagesDemoScreen` pouvait être **`undefined`** → promesse lazy résolue sans composant valide (y compris à l’activation démo).

### Correctif
- **`app/(tabs)/messages.tsx`** : import **statique** de `MessagesDemoScreen` ; suppression de `React.lazy` / `Suspense`.
- **`src/features/messages/messagesScreenRoute.test.tsx`** : montage route inbox réelle vs démo ; garde « pas de lazy » + export nommé présent.

### Fichiers touchés (P0)
- `app/(tabs)/messages.tsx`
- `src/features/messages/messagesScreenRoute.test.tsx`
- `docs/ui-redesign/STATUS.md` (cette section)

### Contrôles exécutés (P0)
- `npx vitest run src/features/messages/` : **PASS** (8 fichiers / 37 tests)
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé messages : **PASS** (warnings import/first sur fichiers de test uniquement)
- `git diff --check` : **PASS**
- Bundle Metro 8082 : serveur **UP** (`/status` 200) ; rechargement app Dev Client requis pour valider le chunk Messages (pas de `React.lazy` dans `app/(tabs)/messages.tsx`)

### Recette iPhone (Metro QA **8082**)
1. Ouvrir **Messages** → pas de crash ; inbox QA si connecté.
2. **Ouvrir la démonstration locale** → 8 conversations, photos/placeholders.
3. Swipe local, tap → modal démo, **Quitter** → retour inbox réelle.
4. Vérifier absence d’appels messagerie Supabase en démo (logs réseau / comportement).

### Réserves
- **PASS iPhone non attesté** par l’agent (validation device requise).
- Import statique inclut le code démo dans le chunk de l’onglet (acceptable en Dev Client ; prod reste gated par `__DEV__` + env).


## UI-MESSAGES-01 — Final polish (inbox + démo) — 4 novembre 2026

### Finitions appliquées
1. **Séparateurs** — constante partagée `INBOX_ROW_SEPARATOR_MARGIN_LEFT` (`inboxDisplay.ts`) : alignement sur la colonne texte (padding + miniature 72 + gap) ; inbox réelle et démo synchronisées.
2. **Titres longs** — `InboxConversationRow` : `numberOfLines={2}` + ellipsize ; libellé VoiceOver **complet** ; fixture démo conv-04 ; modal démo sans troncature.
3. **Badges / sous-titre démo** — `countUnreadConversations` sur fixtures → **2 conversations non lues** (conv 01 et 03) ; pastilles ligne inchangées (dont 9+).
4. **Tactile / pressé** — `hitSlop={8}` sur la ligne ; fond `rowPressed` ; boutons démo et entrée démo `minHeight: 44`.
5. **Isolation démo** — swipe / réinitialisation = `setConversations` + `createMessagesDemoSnapshot` uniquement (tests source).
6. **Quitter la démo** — `onExit` → `setDemoActive(false)` → `MessagesInboxScreen` (test route).
7. **Production** — rendu démo `__DEV__ && demoActive` ; activation `onRequestDemo` seulement si `__DEV__` ; `isMessagesDemoEnabled(false, …)` → false.

### Métier préservé (non modifié)
- Services Supabase conversations, cache inbox, Realtime, badge onglet global, `hideConversationForMe`, fil `/conversation/[id]`, swipe métier inbox réelle.

### Fichiers touchés (polish)
- `src/features/messages/inboxDisplay.ts` (+ tests)
- `src/features/messages/MessagesInboxScreen.tsx`, `demo/MessagesDemoScreen.tsx`
- `InboxConversationRow.tsx` (+ tests), `MessagesInboxDemoEntry.tsx`
- `demo/messagesDemo.test.ts`, `messagesScreenRoute.test.tsx`, `messagesInbox.contract.test.ts`
- `docs/ui-redesign/STATUS.md`

### Contrôles exécutés
- `npx vitest run src/features/messages/` : **PASS** (8 fichiers / **49** tests)
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé `src/features/messages` + `app/(tabs)/messages.tsx` : **PASS** (warnings `import/first` tests mockés)
- `git diff --check` : **PASS**

### Recette iPhone à confirmer (Metro QA **8082**, reload après pull)
| # | Scénario | Attendu |
|---|----------|---------|
| 1 | Onglet Messages (démo off) | Inbox QA, séparateurs alignés sous le texte |
| 2 | Ligne conv-04 démo | Titre sur 2 lignes max ; tap → modal titre complet |
| 3 | Démo activée | Sous-titre header « 2 conversations non lues » ; pastilles conv 01 / 03 |
| 4 | Pressé ligne + boutons panneau démo | Retour visuel ; cibles ≥ 44 pt |
| 5 | Swipe + Réinitialiser | Liste locale ; **aucun** appel réseau messagerie |
| 6 | Quitter la démonstration | Inbox QA réelle (getConversations si session) |
| 7 | Build release / prod | Pas d’entrée « Ouvrir la démonstration locale » |

### Réserves
- Ajustement visuel séparateurs : vérifier sur device après correction d’inset (−16 pt vs ancienne formule).
- **PASS iPhone polish non signé** ici.


## UI-MESSAGES-01 — Fix réinitialisation démo — 4 novembre 2026

### Symptôme (recette iPhone)
- Swipe supprimer, fermeture swipe, miniatures, retour inbox QA : **PASS**.
- **Réinitialiser les 8 conversations** : **FAIL** — la liste restait à 7 lignes après reset (état React mis à jour mais **FlatList** / lignes `SwipeToDeleteRow` non remontées).

### Cause racine
- Après suppression locale, `setConversations` avec un nouveau snapshot de 8 éléments ne forçait pas le **remontage** de la liste virtualisée ni des lignes swipe (clés / `extraData` inchangés) → UI iPhone stale malgré un handler `onPress` correct.

### Correctif (`MessagesDemoScreen.tsx`)
- `resetLocal` : copies immuables des conversations, `openRowId` / preview / `swipeGuardRef` remis à zéro, **`listEpoch++`**.
- `FlatList` : `key={messages-demo-list-${listEpoch}}`, `extraData={listEpoch}`.
- Lignes : `key={${listEpoch}-${item.id}}` sur `SwipeToDeleteRow`.
- En-tête panneau extrait (`MessagesDemoListHeader`) + `accessibilityLabel` explicite sur le bouton Reset.

### Tests
- **`MessagesDemoScreen.reset.test.tsx`** : scénario interaction delete → 7 lignes → Reset → 8 lignes + epoch liste.
- Contrats `messagesDemo.test.ts` enrichis (`setListEpoch`, clé liste).

### Contrôles exécutés
- `npx vitest run src/features/messages/` : **PASS** (9 fichiers / **51** tests)
- `npx tsc --noEmit` : **PASS**
- ESLint ciblé messages : **PASS**
- `git diff --check` : **PASS**

### Revalidation iPhone (Metro **8082**, reload)
1. Démo → panneau **Démonstration** ouvert.
2. Swipe **Supprimer** sur une ligne → confirmer → **7** lignes.
3. **Réinitialiser les 8 conversations** → **8** lignes, ordre fixtures, pastilles/sous-titre cohérents.
4. Aucun appel Supabase / RPC / Realtime / cache inbox.

### Métier
- Inchangé (services, badge global, masquage réel, fil).


## UI-MESSAGES-01 — Clôture (décision CTO) — 4 novembre 2026

### Statut livrable
- **Inbox premium Design V2**, miniatures annonces, démo locale Dev Client, correctif crash lazy (P0) : **livrés**.
- Recette iPhone (hors reset démo) : **PASS** rapporté par le propriétaire (swipe démo, modal, retour inbox QA, etc.).

### Anomalie acceptée (non bloquante)
- **Reset des 8 conversations démo KO sur iPhone** — anomalie mineure acceptée, sans impact métier démontré.
- Hors parcours utilisateur réel ; pas de nouvelle investigation ni instrumentation DEV prévue.
- Tentative technique `listEpoch` / remontage liste : **non confirmée sur appareil** ; conservée comme meilleur effort sans garantie UX reset.

### Garde-fous vérifiés (préflight clôture)
- **Inbox réelle** : `MessagesInboxScreen.tsx` — `getConversations`, cache, Realtime, `hideConversationForMe`, navigation fil inchangés (contrats Vitest).
- **Production** : démo gated `__DEV__` + `isMessagesDemoEnabled` ; pas d’entrée démo sans `onRequestDemo` (tests route + `messagesDemo.test.ts`).

### Contrôles préflight (à rejouer avant commit)
- `npx tsc --noEmit`
- ESLint : `app/(tabs)/messages.tsx`, `src/features/messages/**`
- `npx vitest run src/features/messages/`
- `git diff --check`

### Commit local proposé (non exécuté — validation préflight requise)
- **Message suggéré** : `feat(ui): inbox Messages premium, démo locale et tests UI-MESSAGES-01`
- **Périmètre** : voir liste fichiers `git status` ci-dessous ; **exclure** `.cursor/`, logs QA, captures, `scripts/start-ui-home-metro.local.cjs` (outil local Metro).

---

## UI-MESSAGES-02 — Phase A (audit fil de conversation) — 4 novembre 2026

**Worktree** : `youmbia-ui-home` · **Branche** : `feat/ui-home-first-slice` · **HEAD audit** : `41993ed43c4c7c5f4aefe7f44ae3cef117047c65`
**Périmètre** : lecture seule — **aucune modification** du fil, backend, ni commit Phase B.

### A. Cartographie technique

| Couche | Fichiers / rôle |
|--------|------------------|
| **Route** | `app/conversation/[id].tsx` (~670 lignes) — écran monolithique : chargement, fil, composer, signalement, styles inline. |
| **Navigation** | Stack racine `app/_layout.tsx` (`conversation/[id]`, `headerShown: false`) — **hors onglets** → pas de tab bar sur le fil. Entrées : inbox `router.push(\`/conversation/${id}\`)`, fiche `getOrCreateConversation` → `/conversation/:id`, deep link auth `redirect=/conversation/:id`. |
| **UI partagée** | `@/components` : `Screen`, `AppHeader` (compact), `EmptyState`, `Button`, `KeyboardSafeView`, `UserAvatar`. `@/features/reports` : `ReportComposerModal`. `@expo/vector-icons`. |
| **Services (intouchables Phase B UI)** | `getConversationById`, `getConversations`, `getMessages`, `sendMessage`, `markConversationRead` — `src/services/conversations/*`. Signalement : `submitReport` (`targetType: 'conversation'`). Notifications : `syncMessageNotificationSnapshot`, `markConversationNotificationAsRead`. |
| **Realtime** | `src/lib/messagingRealtime.ts` — canal unique INSERT/UPDATE `public.messages` ; bus `message_inserted` / `message_updated` / `conversation_read` ; `setOpenConversationId` / `getOpenConversationId` ; `appendMessageDeduped`. |
| **Hooks globaux** | `useKeyboardInset` (padding bas composer si clavier fermé) ; `_layout` tabs : `useMessagingRealtime`, `useUnreadConversationsCount` (badge onglet, **≠** fil). |
| **Analytics** | `trackConversationViewed`, `trackMessageSent` / `trackMessageSendFailed` (via `sendMessage`). |
| **Cache métier fil** | **Aucun** cache local des messages ; inbox seule utilise `lightCache` (`MessagesInboxScreen`). |
| **Types** | `Message` : texte seul (`body`, `read_at`) — **pas de pièces jointes** au modèle. `Conversation` enrichie côté `getConversationById` (titre annonce, avatar interlocuteur). |

**Flux chargement (`load`)**
1. Gate auth → `buildAuthGateHref('messages', { redirect })`.
2. Parallèle : `getConversationById`, `getConversations`, `getMessages`.
3. Erreur conversation → écran `EmptyState` ; conversation absente → introuvable ; messages en échec non bloquant → fil vide + composer actif.
4. `syncMessageNotificationSnapshot` depuis liste inbox.

**Flux focus / lu**
- `setOpenConversationId(id)` à l’ouverture/fermeture du fil.
- `useFocusEffect` : `applyReadOptimistic` (read_at local + **`emitConversationRead`**) → `markConversationRead` (RPC `mark_conversation_read` + reset compteurs buyer/seller) → `markConversationNotificationAsRead` → `refreshMessages` (accusés « Lu » distants).
- Realtime fil : INSERT → append + read si message entrant + scroll fin ; UPDATE → fusion `read_at`.

**Flux envoi**
- Pas d’optimistic message avant réponse serveur ; `sendMessage` INSERT + update `last_message_at` + push edge (non bloquant). Succès → append + scroll ; échec → restore texte + `Alert`.

**Couplages inbox ↔ fil ↔ badge**

```
Inbox (MessagesInboxScreen)
  subscribeMessagingEvents → patchInboxOnIncoming / patchInboxOnRead
  emitConversationRead au masquage swipe (dette documentée UI-MESSAGES-01)
  tap → /conversation/[id]

Fil (conversation/[id].tsx)
  applyReadOptimistic → emitConversationRead → inbox patch + badge conversation_read
  markConversationRead RPC (source vérité serveur)
  setOpenConversationId → badge n’incrémente pas si message entrant sur fil ouvert

Badge onglet (useUnreadConversationsCount)
  getUnreadConversationsCount + Realtime + conversation_read
  indépendant du sous-titre inbox « X conversations non lues »
```

**Dette inbox (documentée séparément, hors Phase B fil)** : `emitConversationRead` au masquage sans attendre RPC ; sémantique badge vs pastille ligne ; cache stale possible — **ne pas corriger dans UI-MESSAGES-02 sans ticket dédié**.

---

### B. Fonctionnalités existantes à préserver (contrat produit)

- Auth gate + retour post-login vers le fil.
- Chargement conversation + messages ; états loading (skeleton bulles), error (retry), empty (CTA premier message).
- Affichage bulles moi / interlocuteur ; horodatage dans bulle ; « Envoyé » / « Lu » sous **dernier** message envoyé par moi uniquement.
- Envoi texte multiline (max 2000), désactivation pendant envoi, erreurs réseau/métier avec conservation du texte.
- Realtime réception + mise à jour read receipts.
- Marquage lu à l’ouverture (optimiste + RPC) cohérent badge/inbox via bus existant.
- Signalement conversation (`ReportComposerModal`, anti double signalement session).
- `keyboardShouldPersistTaps="handled"`, `KeyboardSafeView` iOS padding.
- Largeur max contenu 760 (aligné inbox).
- **Aucune** pièce jointe, offre, paiement, typing indicator, édition/suppression message — ne pas inventer.

---

### C. Risques de régression (Phase B UI)

| Risque | Sévérité | Mitigation tests |
|--------|----------|------------------|
| Casser `applyReadOptimistic` / ordre focus effects | **P0** | Contrats : conserver appels `emitConversationRead`, `markConversationRead`, `setOpenConversationId`. |
| Casser subscription Realtime / dedup | **P0** | Conserver `appendMessageDeduped`, handlers INSERT/UPDATE inchangés. |
| Modifier `handleSend` / flux `sendMessage` | **P0** | Conserver signature et séquence ; tests release existants `sendMessage.test.ts`. |
| Déplacer état messages hors route sans précaution | **P1** | Extraction pure presentational ; hooks métier restent colocalisés ou copiés à l’identique. |
| `keyboardVerticalOffset` / safe area composer | **P1** | Recette iPhone clavier ouvert/fermé, petit device. |
| Scroll auto agressif (`onContentSizeChange` + Realtime) | **P2** | Recette scroll manuel puis message entrant. |
| Signalement / modals | **P2** | Smoke test modal visible + submit inchangé. |

---

### D. Audit UI/UX actuel — **note : 5,5 / 10**

| # | Thème | Constat |
|---|--------|---------|
| 1 | En-tête | `AppHeader` blanc générique ; `titleNode` = avatar 28 + **titre annonce** tronqué (`numberOfLines={1}`) — **nom interlocuteur absent** du titre visible. |
| 2 | Bandeau annonce | **Absent** — pas de lien vers `listing/[id]`, pas de miniature annonce (`listing_id` disponible via `getConversationById` mais non stocké dans l’état écran). |
| 3 | Bulles | Vert `colors.primary` (moi) vs surface bordée (eux) — lisible ; ombre légère ; coins marketplace partiels. |
| 4 | Date/heure | Dans chaque bulle (`formatMessageTime`) — pas de séparateurs de jour ; hier/date longue OK. |
| 5 | Statuts | « Envoyé » / « Lu » texte xs sous dernière bulle sortante — pas d’icône ; cohérent métier. |
| 6 | Composer | Pill grise + bouton rond avion — fonctionnel ; `minHeight` 44. |
| 7 | Clavier / safe area | `KeyboardSafeView` sans `keyboardVerticalOffset` explicite (header compact ~40+safe) → **risque chevauchement iOS** à valider device ; `inputPaddingBottom` gère home indicator si clavier fermé. |
| 8 | Tab bar | Masquée (stack) — OK pour fil. |
| 9 | Scroll | `scrollToEnd` sur content size + nouveau message — **pas de préservation position** si l’utilisateur lit l’historique (comportement actuel à préserver ou améliorer en UX-only avec garde-fou). |
| 10 | Messages longs | `Text` body sans limite visuelle — OK ; pas de lien auto-detect. |
| 11 | Erreurs envoi | Alert + texte restauré — **OK** (correction audit launch). |
| 12 | A11y / texte agrandi | Tailles `typography.base/xs` fixes ; pas de `maxFontSizeMultiplier` ; labels send/signaler partiels — **perfectible**. |
| 13 | Petit iPhone | `maxWidth: 85%` bulles ; header dense — acceptable ; composer prioritaire. |

**Écart vs famille UI** : inbox Messages = bandeau vert `#0B4D3C`, marketplace ; fil = **AppHeader standard** → rupture visuelle forte.

---

### E. Design cible premium (10/10 visé — Phase B)

- **Header fil** : bandeau vert YOUMBIA (`#0B4D3C`, aligné `MessagesScreenHeader` / Favoris) — retour, **interlocuteur** (nom + avatar), action Signaler discrète.
- **Bandeau annonce** : carte compacte sous header — miniature listing (réutiliser pattern `InboxListingThumb` / service thumbs **sans** nouveau fetch si `listing_id` + titre déjà en conv) ; titre 2 lignes ; chevron → `listing/[id]` (navigation seule).
- **Fil** : fond `colors.background` neutre ; bulles moi vert maîtrisé (même famille que primary inbox) ; bulles eux blanc/surface, bordure light ; **séparateurs de jour** optionnels (UI pure, tri existant `created_at`).
- **Composer** : barre fixe surface + bordure top ; champ et CTA alignés inbox density ; safe area explicite.
- **Interdictions design** : faux badge vendeur, étoiles, CTA achat/paiement/offre, pièces jointes fictives, animations décoratives.

---

### F. Architecture composants minimale (Phase B proposée)

```
app/conversation/[id].tsx          → orchestration (hooks métier inchangés)
src/features/conversation/
  ConversationThreadHeader.tsx   → vert + peer + report
  ConversationListingBand.tsx    → contexte annonce (press → listing)
  ConversationMessageList.tsx    → FlatList + skeleton/empty
  ConversationMessageBubble.tsx  → item + time + read label
  ConversationComposer.tsx       → input + send
  conversationThread.styles.ts   → StyleSheet partagé
  conversationThread.contract.test.ts → non-régression bus/RPC/appels
```

Logique **`load` / Realtime / send / read / report** reste dans la route ou un hook `useConversationThread(id)` **copie fidèle** des callbacks actuels (pas de refactor métier).

---

### G. Fichiers à modifier (Phase B — liste prévisionnelle)

| Action | Fichier |
|--------|---------|
| Refactor route fine | `app/conversation/[id].tsx` |
| **Créer** | `src/features/conversation/*` (ci-dessus) |
| **Créer** | `src/features/conversation/conversationThread.contract.test.ts` (+ tests rendu bulles/composer si utile) |
| **Ne pas modifier** | `src/services/conversations/*`, `src/lib/messagingRealtime.ts`, `src/hooks/useUnreadConversationsCount.ts`, `app/(tabs)/_layout.tsx`, `MessagesInboxScreen.tsx`, Supabase, RPC, RLS |
| Doc | `docs/ui-redesign/STATUS.md`, éventuellement `DEMO.md` (note : pas de démo fil Phase B sauf décision ultérieure) |

---

### H. Plan tests automatisés + recette iPhone

**Automatisé**
- Contrat fil : présence `subscribeMessagingEvents`, `appendMessageDeduped`, `emitConversationRead`, `markConversationRead`, `sendMessage`, `setOpenConversationId`, pas de import demo.
- Tests rendu : bulles moi/eux, dernier message « Lu », composer disabled while sending (react-test-renderer + mocks RN).
- Régression : `sendMessage.test.ts`, `releaseCritical.contract.test.ts`, `hideConversationForMe.test.ts` — **PASS sans changement**.

**Recette iPhone (Phase B)**
1. Inbox → ouvrir fil QA ; header vert + bandeau annonce + retour.
2. Fil vide → premier envoi → bulle + scroll bas.
3. Réception simulée (autre client / Realtime) → append + read auto si fil ouvert.
4. « Lu » après lecture distante (UPDATE).
5. Erreur réseau envoi → texte conservé.
6. Signaler → modal → succès.
7. Clavier iOS ouvert/fermé — composer visible ; retour inbox → badge cohérent.
8. Texte agrandi iOS — pas de clipping critique.
9. Lien bandeau → fiche annonce.

---

### I. Verdict Phase A → implémentation UI

| Verdict | **GO** — refonte **UI/UX uniquement**, sous contrats stricts |
|---------|----------------------------------------------------------------|
| Conditions | Aucun changement services/RPC/Realtime/badge/masquage ; extraction presentational ; tests contrat fil obligatoires avant merge ; dette inbox inchangée ; reset démo KO reste accepté (UI-MESSAGES-01). |
| NO-GO si | Tentative d’ajouter PJ, offres, pagination serveur, ou correction dette badge/masquage dans le même lot. |

**État Git audit** : HEAD `41993ed` ; non suivis locaux inchangés (`.cursor/`, logs QA, Metro local) — **aucun commit Phase A** (documentation STATUS uniquement).

---

## UI-MESSAGES-02 — Phase B (fil premium) — 4 novembre 2026

### Avant / après

| Zone | Avant (baseline) | Après Phase B |
|------|------------------|---------------|
| En-tête | `AppHeader` blanc, titre = annonce | **`ConversationHeader`** vert `#0B4D3C`, **interlocuteur** + avatar, Signaler |
| Contexte annonce | Absent | **`ConversationListingBanner`** — titre, prix si `getListingsByIds`, vignette ou placeholder, tap → `/listing/[id]` |
| Bulles | Inline styles route | **`ConversationMessageBubble`** — séparateurs jour, a11y, « Lu » / « Envoyé » inchangés |
| Composer | Inline | **`ConversationComposer`** — même validation / envoi / erreurs |
| Métier | — | **Identique** (load, Realtime, read RPC, signalement, pas d’optimistic send inventé) |

### Fichiers modifiés / créés

- `app/conversation/[id].tsx` — orchestration allégée
- `src/features/conversation/ConversationHeader.tsx`
- `src/features/conversation/ConversationListingBanner.tsx`
- `src/features/conversation/ConversationMessageBubble.tsx`
- `src/features/conversation/ConversationComposer.tsx`
- `src/features/conversation/conversationThreadDisplay.ts`
- `src/features/conversation/useConversationListingPresentation.ts` — **1× `getListingsByIds`** (service listings existant, hors conversations)
- Tests : `conversationThread.contract.test.ts`, `ConversationMessageBubble.test.tsx`, `ConversationListingBanner.test.tsx`

**Non modifiés** : `src/services/conversations/*`, `messagingRealtime.ts`, hooks badge, inbox, Supabase, RPC, RLS.

### Contrôles exécutés

- `npx tsc --noEmit` : **PASS**
- ESLint `app/conversation` + `src/features/conversation` : **PASS**
- `npx vitest run src/features/conversation/ src/features/messages/` : **PASS** (73 tests agrégés sur les deux dossiers)
- `npx vitest run src/services/conversations/sendMessage.test.ts` : **PASS**
- `git diff --check` : **PASS**

### Évaluation UI/UX (cible)

- Cohérence marketplace avec inbox Messages : **forte** (header vert, bandeau annonce).
- Note estimée post-Phase B : **8,5 / 10** en statique — **10/10** subjectif après recette iPhone (clavier offset, texte agrandi, QA visuelle).

### Réserves QA / recette iPhone (non exécutée par l’agent)

- **PASS iPhone non attesté** — Dev Client QA + reload Metro requis.
- Protocole : ouverture fil → bandeau (photo/prix si catalogue QA) → envoi → Realtime → lu après focus → clavier/scroll → retour inbox badge → erreur réseau → texte agrandi.
- Données QA vides : bandeau placeholder + prix absent = acceptable ; pas de démo fil auto (hors scope).
- Dette inbox / reset démo UI-MESSAGES-01 : **inchangée**.

### État Git

- **HEAD commit** : `41993ed43c4c7c5f4aefe7f44ae3cef117047c65`
- **Modifications locales non commitées** : Phase B code + Visual QA Demo fil + `STATUS.md` (incl. audit Phase A)
- **Aucun commit / push** (arrêt avant validation iPhone définitive)

### Hors scope immédiat
- Pagination messages, PJ, correction dette badge/masquage inbox.

---

## UI-MESSAGES-02 — Visual QA Demo (fil local) — 4 novembre 2026

### Objectif

Remplacer la **modal descriptive** UI-MESSAGES-01 par une **prévisualisation plein écran** du fil premium (composants Phase B), **Dev Client + `EXPO_PUBLIC_MESSAGES_DEMO=1` uniquement**, sans `router.push('/conversation/msg-demo-…')` ni appel Supabase.

### Comportement

- Tap ligne inbox démo → **`ConversationThreadDemoScreen`** (header, bandeau annonce, bulles, composer).
- Messages seed **`messagesThreadDemoFixtures.ts`** (8 conversations : entrants/sortants, multiligne, dates variées, conv-05 vide, conv-08 sans prix miniature).
- Prix bandeau : **map locale FCFA** (`getDemoThreadListingPriceLabel`) — pas de `getListingsByIds`.
- Envoi : **`createLocalDemoSentMessage`** — état React uniquement, statut « Envoyé ».
- Retour : **`onBackPress`** sur `ConversationHeader` → inbox démo.
- Bandeau jaune : « Prévisualisation fil — aucun envoi Supabase ».
- Tap annonce : **Alert** (pas de navigation listing fictive).

### Fichiers

- `src/features/messages/demo/ConversationThreadDemoScreen.tsx`
- `src/features/messages/demo/messagesThreadDemoFixtures.ts`
- `src/features/messages/demo/MessagesDemoScreen.tsx` — branche preview
- `src/features/conversation/ConversationHeader.tsx` — prop optionnelle `onBackPress`
- Tests : `messagesThreadDemo.test.ts`

### Contrôles exécutés

- `npx tsc --noEmit` : **PASS**
- `npx vitest run src/features/messages/demo/messagesThreadDemo.test.ts` (+ agrégat demo/conversation) : **PASS** (28 tests sur périmètre exécuté)

### Recette iPhone Visual QA (non attestée agent)

1. Dev Client, `EXPO_PUBLIC_MESSAGES_DEMO=1`, onglet Messages → **Démonstration**.
2. Ouvrir conv-01 (photo + échanges), conv-04 (titre long + FCFA), conv-05 (placeholder + fil vide + envoi simulé), conv-06 (multiligne).
3. Vérifier scroll, clavier, retour inbox, absence crash / requête réseau fil.

### État Git

- **HEAD commit** inchangé : `41993ed43c4c7c5f4aefe7f44ae3cef117047c65`
- **Non commité** : Phase B + Visual QA Demo + STATUS
- **Aucun commit / push** sans GO explicite

---

## UI-MESSAGES-02 — Verify Device Preview — 4 novembre 2026 (soir)

### Constat agent (sans modification métier)

| Point | Résultat |
|-------|----------|
| Metro **8082** | **Actif** — cwd `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-home`, commande `expo start --dev-client --lan --port 8082` |
| Metro **8081** | **Aucun** second bundler |
| `MessagesDemoScreen.tsx` | Branche `if (preview)` → **`ConversationThreadDemoScreen`** ; **pas de `Modal`** |
| `React.lazy` | **Absent** du périmètre `messages/demo/` |
| Bundle iOS servi par 8082 | URL `…/node_modules/expo-router/entry.bundle?platform=ios&dev=true` — **~18 Mo**, HTTP 200 |
| Contenu bundle — fil démo | **`ConversationThreadDemoScreen` présent** ; module `MessagesDemoScreen` **sans `Modal`** |
| Chaîne « Conversation de démonstration » | Toujours dans le bundle via **`MESSAGE_DEMO_PREVIEW_BODY`** (fixtures, **non utilisé** par l’UI fil) — **ne prouve pas** la modal |
| Worktree Cursor `youmbia-mobile` | **Ne contient pas** Visual QA Demo — le Dev Client doit pointer le Metro **ui-home** |

### Cause probable iPhone (modal encore visible)

**Bundle JS obsolète sur l’appareil** (reload non effectué après déploiement du fil démo), ou Dev Client connecté à **un autre hôte/port** que `192.168.1.89:8082`. Le code et le bundler 8082 servent déjà le fil premium.

### Procédure exacte — fil premium sur iPhone

1. **Un seul Metro** : depuis `youmbia-ui-home`, script local `node scripts/start-ui-home-metro.local.cjs` (ou équivalent `expo start --dev-client --lan --port 8082` avec **cwd ui-home**).
2. Vérifier dans le terminal Metro : **« Serving …/youmbia-ui-home »** (pas `youmbia-mobile` seul sans worktree).
3. Sur iPhone, Dev Client YOUMBIA : menu développeur → **Change bundle location** / URL → `http://<IP-LAN-Mac>:8082` (ex. `192.168.1.89:8082`).
4. **Recharger le JS** : secouer l’app → **Reload**, ou touche **`r`** dans le terminal Metro (clients connectés). En cas de doute : **fermer complètement** l’app puis rouvrir depuis le Dev Client (sans lancer un second Metro).
5. Onglet **Messages** → **Ouvrir la démonstration locale** (ou démarrage direct si `EXPO_PUBLIC_MESSAGES_DEMO=1` au lancement Metro).
6. Tap une ligne (ex. conv-01) → attendu : **header vert**, bandeau jaune **« Prévisualisation fil — aucun envoi Supabase »**, bulles, composer — **pas** de sheet « Conversation de démonstration ».

### Contrôles exécutés (verify pass)

- `npx tsc --noEmit` : **PASS**
- ESLint ciblé demo fil + `MessagesDemoScreen.threadPreview.test.tsx` : **PASS** (1 warning `import/first` test, même pattern que reset test)
- `npx vitest run src/features/messages/demo/` : **PASS** (incl. **`MessagesDemoScreen.threadPreview.test.tsx`** — chemin inbox → fil → retour)
- `git diff --check` : **PASS**

### Aucun changement code métier

Supabase, Realtime, routes conversation réelles, cache et badges : **inchangés**. Seuls ajouts : test de montage + doc STATUS/DEMO.

---

## UI-MESSAGES-02 — Final Visual Polish — 4 novembre 2026 (soir)

### Finitions appliquées (UI-only)

| Zone | Ajustement |
|------|------------|
| **Bulles sortantes** | Fond `colors.primaryDark`, texte `colors.surface`, horodatage `colors.primaryLight` — tokens uniquement, contraste renforcé vs `#16A34A` + hex blanc |
| **Largeur / padding bulles** | Colonne max **`83 %`** (`CONVERSATION_BUBBLE_MAX_WIDTH`), padding `spacing.sm` / `spacing.md` |
| **Liste messages** | Marge horizontale fil `spacing.sm` (route réelle + démo) |
| **Bandeau annonce** | Kicker **« Annonce »** (plus léger visuellement) ; `accessibilityLabel` complet inchangé (`Annonce : …`) |
| **Composer** | Padding horizontal `spacing.screenHorizontal` + champ `spacing.base` / `spacing.sm` — **props `onSend` / `sending` inchangées** |
| **Démo fil sans tab bar** | `useDemoThreadTabBarHidden` dans **`MessagesDemoScreen` uniquement** (`__DEV__`, `tabBarStyle: { display: 'none' }` pendant preview) — routes `/conversation/[id]` intactes |
| **Bandeau jaune démo fil** | Tokens `warningLight` / `badgeWarningText`, padding vertical réduit |

### Métier préservé

Envoi, Realtime, lu/non lu, signalement, cache inbox, badge, navigation conversation réelle : **non modifiés** (hors padding liste UI partagée).

### Tests

- `conversationThreadVisual.test.ts` — tokens bulles, kicker, hook tab bar démo, composer
- Mocks `useDemoThreadTabBarHidden` sur tests `MessagesDemoScreen` existants

### Contrôles

- `npx tsc --noEmit` : **PASS**
- ESLint ciblé conversation + demo hook : **PASS**
- `npx vitest run src/features/conversation/ src/features/messages/` : **PASS** (73 tests)
- `git diff --check` : **PASS**

### Checklist validation iPhone (dont clavier ouvert)

- [ ] Démo Messages → ouvrir conv-01 : **pas de tab bar** sous le fil (aligné stack réelle).
- [ ] Bulles sortantes vert **plus profond** (`primaryDark`), texte lisible, largeur ~83 % max.
- [ ] Bandeau annonce : libellé **« Annonce »** discret ; titre + prix toujours lisibles (VoiceOver : « Annonce : … »).
- [ ] Composer : champ et bouton envoi alignés bords écran ; **44 pt** min conservés.
- [ ] **Clavier ouvert** : composer collé au clavier, pas de trou blanc excessif ; liste scrollable jusqu’au dernier message ; dismiss clavier OK.
- [ ] Retour header → tab bar **réapparaît** sur inbox démo.
- [ ] Fil **réel** QA (hors démo) : même rendu bulles/bandeau/composer ; envoi + Realtime inchangés.

### État Git

- **HEAD** : `41993ed43c4c7c5f4aefe7f44ae3cef117047c65` — **aucun commit**

---

## UI-MESSAGES-02 — Recette iPhone validée — 4 novembre 2026 (nuit)

### Verdict propriétaire

**8 scénarios / 8 PASS** sur Dev Client (Metro `youmbia-ui-home`, port 8082).

| # | Scénario | Résultat |
|---|----------|----------|
| 1 | Tab bar masquée dans le fil démo, restaurée au retour inbox | **PASS** |
| 2 | Bulles vert profond, largeur ~83 %, alignements | **PASS** |
| 3 | Bandeau annonce, titre long, prix FCFA | **PASS** |
| 4 | Composer visible avec clavier iOS ouvert | **PASS** |
| 5 | Scroll jusqu’au dernier message, clavier ouvert | **PASS** |
| 6 | Envoi simulé démo affiché, sans appel Supabase | **PASS** |
| 7 | Retour inbox démo correct | **PASS** |
| 8 | Navigation / tab bar OK après fermeture et réouverture app | **PASS** |

### Contrôles automatisés (préflight commit)

- `npx tsc --noEmit` : **PASS**
- ESLint ciblé UI-MESSAGES-02 : **PASS** (warnings `import/first` sur fichiers de test Vitest mockés uniquement)
- `npx vitest run src/features/conversation/ src/features/messages/ src/services/conversations/sendMessage.test.ts` : **PASS** (16 fichiers, **74** tests)
- `git diff --check` / `git diff --cached --check` : **PASS** (après staging)
- Contrats route : `conversationThread.contract.test.ts` (Realtime, read, `sendMessage`, composants premium)
- Isolation démo : `messagesThreadDemo.test.ts`, `MessagesDemoScreen.threadPreview.test.ts`, `messagesDemo.test.ts`
- **Aucun** `React.lazy` sur le périmètre fil / démo

### Réserves QA connectée (hors commit)

- Fil **réel** Supabase : recette complète Realtime / badge / erreur réseau **non re-jouée** dans ce GO (UI démo + refonte visuelle route validées séparément).
- Bandeau annonce réel : prix/image dépendent toujours de `getListingsByIds` (hook existant, inchangé côté conversations).

### Limitations mode démonstration

- Messages seed + envoi **mémoire locale** uniquement ; pas de RPC, Realtime, badge global, notification.
- Pas de navigation `/conversation/msg-demo-*` ni `/listing/msg-demo-*` (Alert ou no-op).
- Activation : `__DEV__` + entrée explicite ou `EXPO_PUBLIC_MESSAGES_DEMO=1` (refusé si `__DEV__` false).

### Dette historique non traitée (documentée, non rouverte)

- **UI-MESSAGES-01** : bouton « Réinitialiser les 8 conversations » **KO iPhone** (anomalie mineure acceptée CTO) — **inchangé** dans UI-MESSAGES-02.
- Inbox : sémantique badge vs pastille, `emitConversationRead` au masquage, cache stale possible — tickets séparés.

### Décision préflight

- **GO préflight / staging** — commit atomique proposé, **en attente autorisation CTO explicite**.
- Périmètre staged : Phase B fil premium + Visual QA Demo + finitions visuelles + docs ; **exclus** logs QA, `.cursor/`, Metro local, secrets.
- Message proposé : `feat(ui): refondre le fil de conversation premium (UI-MESSAGES-02)`
