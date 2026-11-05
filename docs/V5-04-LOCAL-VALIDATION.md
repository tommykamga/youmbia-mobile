# V5-03B / V5-04 — Livraison locale et qualification

Référence `0ec7194`, branche `feat/marketing-command-center-v2-1-lifecycle`.
Verdict : **GO pour intégration locale ; NO-GO pour publication de la release**
sans les gates physiques et opérationnelles ci-dessous. Aucun push, migration
Production, merge, déploiement ou build EAS.

## Sources et périmètre exact

[PRD directeur Notion](https://app.notion.com/p/40980247caf3816c9470f71aa6657750),
[plan Linear](https://linear.app/tsk-io/document/youmbia-500-plan-dexecution-consolide-et-kpis-marketplace-mcc-hors-60572cf482e7)
et [TOM-104](https://linear.app/tsk-io/issue/TOM-104) ont été lus. Ils fixent V5-04 :
intentions par canal, réponse depuis messages internes, disponibilité déclarée,
confiance vérifiable et réutilisation messagerie/push. TOM-101 et TOM-102 lus pour
éviter de rouvrir les fonctions historiques Done. Aucun ticket/page externe modifié.
Le quota Linear est documenté : les lots ne sont pas des tickets distincts.
Les outils vendeurs V5-05, le MCC V5-06 et les campagnes restent hors périmètre.

## Phase 1 — Clôture V5-03B

Commit `4d8a79f`. Rapport détaillé : `docs/V5-03B-CLOSURE.md`.
RPC maintenant typée nativement, cast supprimé. Le feed conserve son ordre global
et affiche « Découvrir ». Aucune modification de formule ou de priorité sponsorisée.
Fallback legacy seulement sur RPC absente ; une erreur de permission reste une erreur.
16 tests unitaires/contrats PASS, 8 assertions PostgreSQL/RLS PASS : 10 vendeurs
synthétiques dans le top 10 organique, pages cohérentes, pas de doublon sur jeu fixe,
statuts privés exclus pour anon/propriétaire/autre utilisateur, limites et épuisement.
La pagination offset ne constitue pas un snapshot si le catalogue évolue entre pages.

## Phase 2 — Architecture livrée V5-04

- **Intention de contact** : `contact_cta_clicked` version 1 avec UUID CSPRNG, canal
  message/WhatsApp/appel/SMS, entrée directe ou retour auth, source, plateforme,
  ville/catégorie. Journal SQL séparé du marketing, dimensions copiées de l'annonce
  côté serveur, horodatages serveur d'observation/réception. Pas de téléphone,
  contenu de message, titre ou email dans le journal. Le clic est instrumenté avant
  l'action : échec d'ouverture, conversation vide et vente ne sont jamais assimilés
  à un message envoyé. Les événements historiques restent distincts.
- **Fiabilité** : un UUID par intention ; double tap dans 1,5 s coalescé, tentative
  réseau ambiguë retentée une fois avec le même UUID. Replay identique idempotent,
  replay contradictoire/inter-compte refusé. Verrou transactionnel par acteur et
  plafond de 60 faits/minute, hors replays. Compte authentifié non anonyme et annonce
  active d'un autre vendeur requis. Changement de session : nonce/pending purgés,
  requête ancienne abandonnée. Hors ligne/backend absent : collecte marquée absente,
  parcours contact conservé ; aucune file locale persistante de données de contact.
- **Réponse vendeur** : nouvelles colonnes `messages.server_received_at` et
  `server_context_key` remplies par trigger, immuables sur UPDATE. Les payloads
  existants restent valides. Une RPC admin renvoie éligibles, répondues,
  non-répondues, exclusions et médiane en secondes. Premier vrai message vendeur
  strictement après le premier acheteur ; message vendeur antérieur/à égalité et
  conversation sans acheteur ne créent pas de réponse. Ni contenu ni identifiant
  de conversation n'est exposé dans le résultat agrégé.
- Le contrat historique autorise la mutation des participants d'une conversation.
  Il est conservé : l'empreinte serveur liée au listing/acheteur/vendeur empêche
  d'attribuer ses anciens messages au nouveau contexte. Le vendeur doit correspondre
  au propriétaire de l'annonce. `excluded_legacy_conversations` compte les sources
  non certifiables : historique sans réception serveur OU contexte changé/incohérent.
  Zéro délai n'est pas inventé quand les données sont insuffisantes : médiane NULL.
  Les métriques portent sur les données internes encore présentes et qualifiables,
  pas sur WhatsApp/appels ni sur des messages historiques rétro-validés.
- **Disponibilité facultative** : annonce active propriétaire : « Toujours disponible »
  et « Disponibilité inconnue ». Vente réutilise le statut existant et ses guards.
  RPC atomique avec verrou de ligne et statut attendu ; timestamp serveur, RLS
  propriétaire/public actif. Une transition legacy invalide l'ancienne déclaration.
  « Inconnu » ne réactive pas une annonce vendue. L'affichage qualifie la déclaration
  et sa date ; aucune promesse permanente de disponibilité.
- **Confiance** : Pro est explicitement un statut déclaré. Vérifié exige un reçu
  serveur issu d'une preuve + version de politique dans un schéma privé. Les anciens
  booléens ne sont pas convertis en preuves. Aucune politique métier ni preuve réelle
  n'est inventée/provisionnée. Profil, détail, boutique et rail utilisent ces reçus ;
  lecture batch bornée à 50 pour le rail, sans RPC par carte. Les caches publics
  existants sont conservés ; révocation visible à la prochaine relecture/expiration.
- **Deep links messages** : l'ancien parseur acceptait un suffixe arbitraire après
  `/conversation/`. Seuls les UUID sont maintenant acceptés ; traversée de chemin,
  encodage et query injectée refusés. Route historique et coordinateur post-auth
  préservés. Aucun pipeline push, consentement ou campagne changé.

## Sécurité, dépendances et compatibilité

Migration additive locale `supabase/migrations/20261101131847_v5_04_contacts_response_trust.sql`.
Fonctions privilégiées dans `v5_marketplace_private`, wrappers publics invoker,
privilèges explicites, search_path vide, RLS sur les nouvelles tables, références
CASCADE pour les contacts/déclarations, aucune écriture directe client. Réception
et contexte des nouveaux messages ne sont pas forgeables par le client.
Les anciennes écritures de messages, annonces et participants restent compatibles.
Aucun changement de `created_at`, cooldown, enum de statut ou RPC 4.7.x existante.

`react-native-get-random-values` 1.11.0, déjà installé et verrouillé comme dépendance
transitive, devient explicite ; le graphe verrouillé n'est pas renouvelé. Aucune
installation native ou build effectué. Exécution binaire 4.7.0 non démontrée ici.
Les clients 4.7.x ne produisent pas ces nouveaux faits : la couverture est partielle.

Rétention des contacts : 30 jours, purge dédiée service_role préparée et testée.
Aucun Cron n'est ajouté/activé ; son exécution opérationnelle devra être validée
avant toute livraison. Les preuves privées nécessitent une vraie politique de
vérification, de révocation et de conservation avant de provisionner des badges.

## Tests réellement exécutés et preuves

QA existante : Supabase PostgreSQL 17.6 ARM64, `127.0.0.1:55432`, conteneur
`youmbia-v5-02a-qa-20261101`. Baseline schema-only qualifiée précédemment :
460 comparaisons exactes/461 et une équivalence prouvée ; A/B/C déjà appliquées.
Cette phase ajoute 03B puis 04 sur cette QA, sans nouvel accès Production.
Fixtures uniquement synthétiques. Les assertions RLS exécutent anon/authenticated
et contexte JWT SQL, pas seulement postgres. Suites transactionnelles : ROLLBACK.
Les courses nettoient leurs seuls UUID. Les données/conteneur existants sont conservés.

- V5-04 : **38 tests unitaires/contrats PASS, 0 FAIL**, sept fichiers concernés,
  transport simulé ; session, doublon/retry, erreur/offline, confiance, disponibilité
  et deep links/coordinateur. Ce ne sont pas des tests natifs ou HTTP Supabase.
- PostgreSQL réel V5-04 : **37 assertions PASS, 0 FAIL** : anti-replay, quota,
  droits, purge, disponibilité, preuves/révocation, sender forgé, timestamps/contexte,
  première réponse stricte, médiane, non-réponse et exclusions.
- Concurrence PostgreSQL réelle : **4 scénarios PASS** : même UUID, 59+2 intentions
  plafonnées à 60, suspension contre disponibilité, double vente conditionnelle.
- Non-régression SQL A : **67 assertions PASS** sur transitions propriétaire/modération,
  RLS, timestamps et contrats historiques. Native SQL n'est pas un binaire 4.7.0.
- TypeScript : PASS. Lint ciblé : PASS, 0 warning. `git diff --check` : PASS.
- Catalogue local : nouvelles RLS/privilèges/triggers conformes ; fin des tests :
  0 annonce, contact, message, déclaration ou preuve synthétique restant.
- Advisor CLI tenté avec URL loopback explicite : **non qualifié**, connexion
  `LegacyDbConnectError`. Aucun advisor distant utilisé ; les tests RLS natifs et
  contrôles de catalogue ont réellement été exécutés. Aucun PASS advisor inventé.

Reproduction : tests listés dans `docs/evidence/v5-04/unit-tests.log` ;
`npm run typecheck` ; lint sur les seuls fichiers modifiés ; lanceur
`scripts/run-v5-04-sql.sh` avec `V5_04_BASELINE_QUALIFIED=1`,
`V5_04_BASELINE_EVIDENCE`, `V5_04_PGPORT=55432`, credentials QA hors Git.
Concurrence : mêmes preuves + `V5_04_RUNTIME_FILE`, puis
`python3 scripts/test-v5-04-concurrency.py`. Aucun replay complet du ledger
historique, PostgREST/GoTrue/Storage HTTP ni appareil physique réalisé ici.

## Réserves et verdict

GO local pour ces correctifs et commits. NO-GO release : migration non déployée,
QA physique iOS/Android et deep links externes réelle non exécutées, policy/preuves
réelles et exécution de rétention à valider avant Production. La parité
instrumentation Web et l'interface MCC relèvent de leurs lots/autorisations ; aucun
changement de dépôt Web ou de dashboard effectué. Mesure explicitement partielle,
aucun KPI certifié de conversion ou de délai vendeur publiquement promis.

Modifications préexistantes, `eas.json`, `.env` et fichiers non suivis préservés
par comparaison des empreintes ; exclus des commits. Aucun travail de monétisation,
marketing, Cron, stores, build, push, merge ou déploiement.

## Liste exacte des fichiers V5-04

- `app/listing/[id].tsx`
- `app/shop/[slug].tsx`
- `package-lock.json`
- `package.json`
- `scripts/run-v5-04-sql.sh`
- `scripts/test-v5-04-concurrency.py`
- `src/features/listings/ListingCard.tsx`
- `src/features/shops/ProSellerActivationCard.tsx`
- `src/features/shops/ProSellerBadge.tsx`
- `src/features/shops/VerifiedShopsSection.tsx`
- `src/lib/conversationDeepLink.test.ts`
- `src/lib/conversationDeepLink.ts`
- `src/lib/marketplaceEventId.test.ts`
- `src/lib/marketplaceEventId.ts`
- `src/lib/shopSeller.ts`
- `src/services/listings/contactIntent.test.ts`
- `src/services/listings/contactIntent.ts`
- `src/services/listings/getListingById.ts`
- `src/services/listings/listingTrust.test.ts`
- `src/services/listings/listingTrust.ts`
- `src/services/notifications.ts`
- `src/services/shops/getPopularShops.ts`
- `src/services/shops/getShopListings.ts`
- `src/services/users/getUserProfile.ts`
- `src/types/database.ts`
- `src/types/shops.ts`
- `supabase/migrations/20261101131847_v5_04_contacts_response_trust.sql`
- `supabase/scripts/v5_04_contacts_trust_tests.sql`

Ce rapport et les preuves non sensibles `docs/evidence/v5-04/` sont ajoutés.
La liste exacte de ces preuves figure dans `SHA256SUMS.json`.
