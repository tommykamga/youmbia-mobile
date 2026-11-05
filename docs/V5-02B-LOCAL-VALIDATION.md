# V5-02B — Publication préparée et finalisation serveur

**GO technique local**, sur les baselines Mobile bc6acb72 et Web af843998.
Pas de GO Production : aucune migration distante, publication, campagne/Cron,
push ou build natif exécuté. Aucun changement du classement V5-03.

## Architecture

Migration additive : publication_managed (false par défaut) et
publication_finalized_at (reçu serveur), sans nouvelle valeur de statut.
Les nouveaux brouillons des clients modifiés sont managed=true dès leur INSERT.
Un ancien brouillon peut rejoindre ce protocole via prepare_listing_publication.
Une annonce engagée ne peut pas désactiver le protocole pour contourner les règles.

Le serveur verrouille la ligne propriétaire FOR UPDATE. Les écritures de photos
et d'attributs du protocole prennent le même verrou parent. Le trigger valide les
transitions draft -> active, y compris via un UPDATE Supabase direct : ce n'est
pas une confiance accordée au seul client ou à la seule RPC.

finalize_listing_publication est SECURITY INVOKER, propriétaire authentifié
uniquement, avec les RLS existantes. Après succès, un nouvel appel retourne le
reçu existant sans nouvel UPDATE ni réexécution des effets de publication.
Les dates created_at/renewed_at/last_published_at gardent leur sens et leur tri.

## Règles de finalisation

- Titre trimé : 5–80 caractères ; description : 20–2000.
- Prix strictement positif, conforme au contrat Mobile actuel. Le référentiel
  utilisé n'a aucune exemption de prix par catégorie ; aucune exemption inventée.
  Le nouveau wizard Web est aligné sur cette règle, contrairement à son ancien
  service qui admettait zéro. Les écritures legacy restent compatibles.
- Ville renseignée, 2–20 caractères, sans séparateurs de villes multiples.
- Catégorie existante, finale : sélectionner une sous-catégorie si des enfants existent.
- 1–4 métadonnées photos ; chaque chemin correspond à un objet Storage du bon
  propriétaire et de la même annonce, avec une taille positive et sans delete marker.
- Définitions dynamiques effectives, avec priorité catégorie sur profil et le
  repli electronics déjà utilisé par les clients. Obligatoires présents ; types,
  nombre fini, texte utile, boolean false, date et option rattachée à la bonne
  définition validés. Les champs vidés sont supprimés avant finalisation.

Les sauvegardes de brouillon restent souples. Aucun durcissement rétroactif des
éditions ordinaires des annonces historiques n'est ajouté.

## Parcours et reprise

Mobile : création/reprise privée, mémorisation de l'identifiant avant les médias,
enregistrement des attributs, copie/upload des photos, relecture des photos DB,
finalisation RPC, puis écran de succès et événements de publication. Les ordres
photos restent stables pour les retries d'un transfert partiel dans la session.
Tous les attributs effectifs sont accessibles, sans rester limités au pilote.

Web : brouillon persistant via l'autosave existant, préparation/enrôlement,
attente bornée d'un upload en cours, photos puis attributs avant finalisation.
Les chemins et identifiants photos dérivent du contenu et de l'annonce : un retry
ne crée pas une nouvelle métadonnée pour la même photo. Les erreurs d'upload en
arrière-plan sont capturées et ne déclenchent jamais un succès de publication.

Les doubles clics sont bloqués synchroniquement par refs. Les interruptions
laissent le brouillon dans Mes annonces ; les photos/attributs réellement sauvés
sont relus lors de la reprise. Une réponse de finalisation perdue est récupérée
par le reçu serveur ; l'UI indique un état non confirmé et invite à vérifier ou
réessayer, sans affirmer à tort que la publication a échoué.

## Effets secondaires

Les triggers existants de recherches sauvegardées, cycle de vente et email service
suivent la transition finale. Un échec SQL d'un effet secondaire annule la transaction,
y compris statut et reçu, puis autorise une nouvelle tentative du même identifiant.

L'attribution existante utilisait aussi la date générée lors d'un INSERT brouillon.
Son trigger conserve exactement sa branche legacy ; une branche managed distincte
ne convertit les sessions qu'après draft -> active réussi. Aucune campagne, règle
de consentement, activation de flag ou planification Cron n'est changée.
Le calcul de récence et le marketing growth existants ne sont pas refondus.

## Compatibilité 4.7.x et limite impérative

publication_managed=false par défaut préserve les INSERT active, les brouillons
et les UPDATE des anciens clients. Le service historique Mobile publishListingDraft
et les contrats legacy demeurent disponibles. Les nouveaux clients ne font aucun
fallback vers une publication active non validée si les nouvelles RPC manquent.
Le backend doit donc être livré avant ces clients, lors d'une phase autorisée.

**Le verrouillage global de toutes les écritures directes n'est pas réalisé :**
un acteur peut encore utiliser le protocole legacy tant qu'il doit rester ouvert
aux 4.7.x. AUD-03 est corrigée sur les lignes managed ; fermer le protocole legacy
nécessitera une décision de remplacement des anciens clients. Cette limite est
inhérente à la compatibilité demandée, et non masquée par un contrôle d'interface.

## Tests exécutés

- Mobile : 221 tests PASS, dont 7 nouveaux tests du service de publication sûre.
  Services Supabase/Storage simulés pour les erreurs attributs/photos, retry et
  réponse perdue après finalisation. Contrats historiques conservés.
- Web : 64 tests PASS, dont 8 nouveaux tests d'orchestration et de contenu photo
  stable. Ces tests ne constituent pas une QA navigateur interactive.
- PostgreSQL 17.6 Supabase ARM64, instance dédiée qualifiée V5-02A :
  **39 assertions/scénarios transactionnels PASS**, rôles authenticated et anon,
  validations, contournements directs, reprise legacy, effets et rollback.
- Deux connexions PostgreSQL réelles : **8 contrôles PASS**. La seconde attend
  effectivement un verrou, puis reçoit already_published=true. Une seule mise à
  jour finale, created_at inchangé, aucun renouvellement.
- Suite SQL V5-02A inchangée : **67 assertions de non-régression PASS** après V5-02B.
- Typecheck Mobile et Web avec incremental=false : PASS. ESLint ciblé : PASS.
  Revue React ciblée : hooks stables, refs anti-double-clic, attente upload bornée,
  erreurs privées et aucune interface de publication partielle publique.
- git diff --check et vérification des modifications préexistantes : PASS.

Les tests SQL utilisent des métadonnées Storage fictives. Ils valident les contrôles
PostgreSQL et les RLS, pas le transfert HTTP des octets ni la signature HTTP d'URL.
Les binaires publics 4.7.x ne sont pas exécutés : leurs chemins SQL disponibles
sont qualifiés, leur compatibilité complète n'est pas certifiée.

Preuves : [contrôles](evidence/v5-02b/checks.json),
[SQL transactionnel](evidence/v5-02b/sql-tests.log),
[concurrence](evidence/v5-02b/concurrency.json),
[non-régression SQL](evidence/v5-02b/legacy-v5-02a.log),
[Mobile](evidence/v5-02b/mobile-tests.log), [Web](evidence/v5-02b/web-tests.log),
[empreintes](evidence/v5-02b/SHA256SUMS.json).
Aucun dump de Production, identifiant personnel ou secret n'est inclus.

## Fichiers du périmètre

### Mobile — code, migration et tests

- app/sell/index.tsx
- src/services/listings/createListingDraft.ts
- src/services/listings/index.ts
- src/services/listings/listingDraft.contract.test.ts
- src/services/listings/listingDuplicate.contract.test.ts
- src/services/listings/publishListingSafely.ts
- src/services/listings/publishListingSafely.test.ts
- src/types/database.ts
- supabase/migrations/20261101090258_v5_02b_listing_publication_finalization.sql
- supabase/scripts/v5_02b_publication_tests.sql
- scripts/run-v5-02b-sql.sh
- scripts/test-v5-02b-concurrency.py

### Web

- app/(main)/(public)/vendre/actions.ts
- lib/data/listingDrafts.ts
- lib/listingDraftContract.ts
- lib/listingDrafts.contract.test.ts
- lib/listingPublicationProtocol.ts
- lib/listingPublicationProtocol.test.ts
- src/components/ListingForm/ListingWizardV2.tsx

### Rapport et preuves

- docs/V5-02B-LOCAL-VALIDATION.md
- docs/evidence/v5-02b/checks.json
- docs/evidence/v5-02b/sql-tests.log
- docs/evidence/v5-02b/concurrency.json
- docs/evidence/v5-02b/legacy-v5-02a.log
- docs/evidence/v5-02b/mobile-tests.log
- docs/evidence/v5-02b/web-tests.log
- docs/evidence/v5-02b/SHA256SUMS.json

## Risques résiduels et verdict

GO pour les commits locaux ciblés, sans push. Avant toute livraison : migration
backend qualifiée puis QA interactive iOS/Android/Web, notamment uploads réels,
fermeture de l'app, reprise depuis Mes annonces et réseau instable. Des fichiers
Storage orphelins peuvent rester après interruption avant écriture des métadonnées ;
aucun nettoyage automatique ou job n'est ajouté. Les éditions ultérieures restent
sur leurs contrats existants : la validation forte porte sur la finalisation.
La compatibilité legacy et les limites HTTP/natives ci-dessus restent explicites.
