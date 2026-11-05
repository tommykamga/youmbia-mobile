# V5-02C — Validation locale

Date : 2026-11-01. Verdict : **GO pour commits locaux ciblés**. Aucune livraison Production.
Baselines Mobile `036cafa010a71a3df5d01f80dee71f87cf61f2f5`, Web `c46f7b8e97775aad52a86885cc5ea3953e0fe346`.

## Architecture et comportement

- AUD-07/12 : fait SQL append-only `listing_first_publications`, date serveur
  `first_published_at` immuable. Une insertion active ou transition draft→active
  crée un seul fait ; une insertion de brouillon, réactivation ou renouvellement
  n'en crée pas. Le fait survit à la suppression de l'annonce. RLS : lecture de ses
  propres faits seulement, aucune écriture client. Aucun nouvel événement marketing.
- Limite de 100 premières publications dans `(maintenant − 24 h, maintenant]`,
  sous verrou transactionnel par vendeur. Les anciens brouillons sont comptés à leur
  publication effective. Le contrôle Mobile est indicatif ; le trigger arbitre
  aussi les écritures historiques directes et le Web. Une transaction refusée ne
  consomme aucun fait. Aucun usage de `created_at` pour ce quota.
- AUD-08/10 : UPDATE conditionné par le statut lu, propriétaire et identifiant.
  Résultat retourné vérifié. Une ligne absente, refusée ou perdue dans une course
  ne donne pas de succès. Même statut : no-op idempotent explicite. Suppression
  absente : échec explicite. Renouvellement : contrôle SQL existant de 72 h conservé.
  L'événement de vente Mobile suit uniquement une mutation confirmée.
- AUD-09 : relecture avant chaque contact Mobile/Web ; rafraîchissement au retour
  au premier plan/focus et toutes les 60 s pendant consultation visible.
  Cache détail Mobile de 90 s conservé pour les seules annonces actives, invalidé
  aux événements d'authentification. Cache d'URL signées invalidé également ; une
  réponse de signature provenant d'une session précédente est abandonnée.
  Les lectures d'écran en vol sont protégées par génération de session.
- AUD-11 : extension du calcul existant, avec détail des points par dimension.
  Catégorie, ville/quartier et disponibilité explicitement connue sont représentés.
  Dimensions historiques inconnues exclues du dénominateur ; prix non applicable
  exclu. Pas de confirmation de disponibilité inventée : le formulaire indique
  son absence. Score indicatif, sans modifier la validation serveur B ni le fil.

## PostgreSQL réel et provenance

Instance existante `youmbia-v5-02a-qa-20261101`, PostgreSQL Supabase 17.6 ARM64,
connexion loopback `127.0.0.1:55432`, base `postgres`. Données QA synthétiques.
Baseline schema-only qualifiée précédemment : 460 comparaisons exactes sur 461,
une contrainte équivalente démontrée ; migrations A/B déjà présentes.
La migration C est appliquée exclusivement à cette instance locale.
Aucun nouveau dump, appel ou accès Production pendant cette phase.

Les assertions propriétaire/autre utilisateur/modération utilisent les rôles natifs
`authenticated`/`anon` et le contexte JWT SQL ; l'administrateur sert aux fixtures.
Le vieux brouillon est simulé en datant une fixture sous privilège avant de
réactiver le guard A ; toutes les assertions propriétaire exécutent les guards.
Les suites transactionnelles terminent par ROLLBACK ; les courses nettoient
uniquement leurs identifiants synthétiques. Fin : 0 annonce et 0 fait résiduels,
guard A toujours activé. Le conteneur et ses données sont conservés.

## Tests exécutés

- Mobile : **57 PASS, 0 FAIL**, six fichiers concernés, doubles de transport.
- Web : **22 PASS, 0 FAIL**, trois fichiers ; actions réelles transpilées exécutées
  avec transport simulé, règles lifecycle et huit cas de disponibilité/contact.
- PostgreSQL/RLS : C **10 PASS**, non-régression A **67 PASS**, B **39 PASS**.
- Courses réelles à deux connexions : C **4 scénarios PASS** (vente/renouvellement,
  suspension/réactivation, double vente, 99+2 publications plafonnées à 100).
  Double finalisation B : **8 assertions PASS**, plus **1** fait C unique vérifié.
- Garde-fous lanceurs : **3 refus attendus PASS**, sans connexion SQL.
- TypeScript Mobile/Web : PASS. ESLint limité aux fichiers concernés : PASS,
  zéro avertissement. `git diff --check` : PASS. 60 empreintes de fichiers sales
  préexistants comparées : zéro différence.

Reproduction : `npm run typecheck -- --incremental false` dans chaque dépôt ;
les journaux indiquent les fichiers de tests. Lanceur SQL C : variables
`V5_02C_BASELINE_QUALIFIED=1`, `V5_02C_BASELINE_EVIDENCE`, `V5_02C_PGPORT=55432`
et identifiants QA fournis hors Git. Le test de concurrence exige aussi
`V5_02C_RUNTIME_FILE` vers le fichier local de credentials (jamais versionné).
Les lanceurs A/B sont inchangés. Les preuves ci-jointes sont expurgées ; aucun
schéma brut, dump, secret ou identifiant personnel n'est inclus.

## Compatibilité et réserves

Contrats SQL historiques 4.7.x démontrés sur la baseline QA : INSERT active,
brouillon→active, édition ancienne incomplète, pause, vente, réactivation,
renouvellement 72 h. Aucun nouvel RPC ni champ obligatoire pour ces clients.
Les binaires 4.7.x, PostgREST/GoTrue, Storage HTTP et interactions sur appareils/
navigateurs ne sont pas exécutés ici : cette qualification reste SQL + unitaire.

Les dates de première publication antérieures à la migration restent inconnues.
Le quota démarre donc sur les faits observés après migration ; ses premières
24 heures ne peuvent reconstituer les publications historiques non tracées.
Une ancienne annonce en pause/vendue est traitée comme réactivation, sans faux
fait de première publication. La migration doit précéder les nouveaux clients.
La revalidation avant contact limite les données périmées mais ne verrouille pas
une annonce pendant l'ouverture d'une application téléphonique externe.
Les URL déjà délivrées restent valides jusqu'à expiration Storage ; leur cache
applicatif est purgé au changement de session. QA interactive requise avant livraison.

Aucun changement de classement V5-03, campagnes, Cron, monétisation, fonctions
hors périmètre ou configuration EAS. Aucun push, merge, build ou déploiement.

## Fichiers ciblés

Mobile :

- `app/listing/[id].tsx`
- `app/sell/index.tsx`
- `src/lib/listingImageUrl.ts`
- `src/lib/listingImageUrl.test.ts`
- `src/lib/listingQualityScore.ts`
- `src/lib/listingQualityScore.test.ts`
- `src/services/listings/checkListingPublishDailyQuota.ts`
- `src/services/listings/checkListingPublishDailyQuota.test.ts`
- `src/services/listings/deleteListing.ts`
- `src/services/listings/listingDetailSessionCache.ts`
- `src/services/listings/renewListing.ts`
- `src/services/listings/updateListing.ts`
- `src/services/listings/updateListingStatus.ts`
- `src/services/listings/listingReliability.test.ts`
- `src/types/database.ts`
- `supabase/migrations/20261101100827_v5_02c_first_publication_quota.sql`
- `supabase/scripts/v5_02c_quota_tests.sql`
- `scripts/run-v5-02c-sql.sh`
- `scripts/test-v5-02c-concurrency.py`

Web :

- `app/(main)/(public)/account/listings/actions.ts`
- `components/ContactActions.tsx`
- `lib/listingActions.reliability.test.ts`
- `lib/listingContactAvailability.ts`
- `lib/listingContactAvailability.test.ts`

Rapports : `docs/V5-02C-LOCAL-VALIDATION.md` dans chaque dépôt.
Preuves Mobile : `docs/evidence/v5-02c/` (liste exacte dans les SHA256).
