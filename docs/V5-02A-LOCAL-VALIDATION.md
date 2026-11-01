# V5-02A — SQL QA Recovery — 1 novembre 2026

**GO pour la qualification PostgreSQL/RLS V5-02A.** Le blocage SQL est levé.
Ce verdict ne certifie ni les binaires publics 4.7.x, ni la release native, ni les
API HTTP Auth/Storage. Aucune écriture Production, migration distante, modification
de campagne/Cron existant, déploiement, build ou push. Les commits locaux de
consolidation sont autorisés séparément après cette qualification.

## Instance isolée

- Docker Desktop déjà installé, relancé ; moteur 29.5.3.
- Colima et OrbStack absents. Homebrew PostgreSQL 18.3 disponible mais non utilisé.
- Supabase CLI 2.109.1 disponible ; aucune commande de mutation distante exécutée.
- Image ARM64 : public.ecr.aws/supabase/postgres:17.6.1.063, PostgreSQL 17.6.
- Digest : sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426.
- Nouveau conteneur dédié : youmbia-v5-02a-qa-20261101, aucune base/volume existant réutilisé.
- Endpoint : 127.0.0.1:55432 ; base postgres ; timezone UTC.
- Réseaux : réseau dédié interne et bridge Docker pour rendre le port loopback
  accessible depuis le Mac. Le conteneur n'est donc pas hermétique au réseau.
- Aucun service GoTrue, PostgREST, Storage HTTP, Edge ou SMTP lancé. Aucun secret
  Production ni job Cron importé ; aucune requête pg_net observée.
- Mot de passe QA généré aléatoirement, conservé seulement dans runtime.json sous
  /private/tmp/youmbia-v5-02a-qa-i4xr7tdp, permissions 0600 ; absent du dépôt.
- Le conteneur est arrêté à la fin de la qualification, conservé pour reprise.

## Origine et qualification de la baseline

Le schéma historique Web et les dumps locaux retrouvés ne sont pas la baseline
courante : certains ont des catégories UUID, status texte et timestamps/types
différents. Ils n'ont pas été présentés comme qualifiés.

Baseline reconstruite mécaniquement depuis les catalogues du projet
ainzxommczlyjhymuwgu, consultés exclusivement par SELECT en lecture seule :
76 tables public/auth/storage, 127 fonctions hors extensions, 65 politiques RLS,
colonnes/types/nullité/defaults/génération, contraintes, triggers, enums, droits,
propriétaires et rôles. Aucun contenu de table Production n'a été copié.
Les rôles et extensions natifs proviennent de l'image Supabase PostgreSQL.

Comparaison avec le même rôle postgres et le même search_path :
- 460 contrôles de catalogue strictement identiques sur 461.
- 1 écart de décompilation dans profiles_shop_slug_format_check : regroupement
  associatif des AND, sans changement logique ; 12 évaluations concordantes,
  y compris NULL, chaîne vide, format, casse et frontières 48/49 caractères.
- Les ACL sont comparées comme ensembles ; l'ordre textuel n'est pas un droit.
- Aucun écart sur listings, listing_images, auth.uid/auth.jwt/is_admin, les
  triggers de vente/renouvellement ou les droits RLS critiques.

Il s'agit d'une reconstruction de schéma pour ce périmètre, pas du rejeu historique
du ledger complet ni d'un clone intégral des services Supabase. Les versions de
migrations distantes sont conservées comme provenance ; elles ne sont pas marquées
artificiellement comme appliquées localement. Les jobs, flags, secrets et données
marketing ne sont pas importés. Les fonctions/triggers sont restaurés à l'identique.

Preuves : [qualification](evidence/v5-02a-sql-qa/baseline-qualification.json),
[résumé de consolidation](evidence/v5-02a-sql-qa/consolidation-results.json),
[empreintes des preuves conservées](evidence/v5-02a-sql-qa/COMMITTED-SHA256SUMS.json).
Les captures brutes des catalogues, le schéma reconstruit et les outils de
reconstruction restent locaux, hors commit : aucun dump Production n’est livré.

## Exécution et résultats

Migration 20261101080731_v5_02a_listing_lifecycle_owner_guards.sql appliquée
uniquement à cette instance. La migration, la suite et le lanceur existants
n'ont pas été modifiés pendant cette récupération.

Trois comptes fictifs @v5-02a.example.test sont créés localement : propriétaire,
autre utilisateur et modérateur. Aucun compte Production ni mot de passe utilisateur
n'est repris. Les actions métier utilisent SET LOCAL ROLE authenticated avec
request.jwt.claims approprié ; les lectures visiteurs utilisent anon. Ces deux
rôles sont réellement non-superuser et sans BYPASSRLS. La modération est testée
sous authenticated avec l'autorisation is_admin(), pas seulement en superuser.

Le lanceur scripts/run-v5-02a-sql.sh est exécuté sans contourner ses gardes,
avec la preuve de qualification, le port 55432 et l'hôte 127.0.0.1.

**67 assertions de résultat PASS, 0 FAIL**, réparties ainsi :
- 25 transitions vendeur ;
- 5 statuts initiaux vendeur ;
- 25 transitions modération ;
- 1 assertion de lecture des photos propriétaire couvrant les cinq statuts ;
- 4 assertions timestamps/édition historique/publication du même brouillon ;
- 2 assertions renouvellement à 72 h et rejet d'une répétition immédiate ;
- 2 assertions isolation autre utilisateur ;
- 1 assertion visibilité anonyme ;
- 2 assertions identité admin et restauration d'une suspension.

Méthode de comptage : chaque itération de matrice compte une assertion ; une
condition composée compte une assertion. Le préflight et les instructions SQL
de préparation ne sont pas comptés. Les neuf groupes de sortie sont PASS.
Rejeu via le même lanceur : PASS identique, 67 assertions ; ce second passage
prouve la répétabilité mais n'est pas présenté comme une couverture supplémentaire.

Preuves : [résultats](evidence/v5-02a-sql-qa/test-results.json),
[premier passage](evidence/v5-02a-sql-qa/sql-suite-first.sanitized.log),
[rejeu](evidence/v5-02a-sql-qa/sql-suite-repeat.sanitized.log).

Après ROLLBACK : 0 annonce, 0 métadonnée photo de test ; seuls les trois comptes
fictifs de préparation sont conservés. 0 job Cron, 0 secret Vault, 0 runtime flag,
0 email outbox, 0 requête et 0 réponse pg_net.
[Contrôle](evidence/v5-02a-sql-qa/post-test-safety.json).

Delta de migration vérifié : une fonction, un trigger sur listings et une politique
SELECT propriétaire sur listing_images. Aucun changement des colonnes, contraintes,
enums, rôles, droits de table ni des autres fonctions/politiques existantes.
[Delta](evidence/v5-02a-sql-qa/migration-delta.json).

## Compatibilité et verdict

Les chemins SQL historiques disponibles sont démontrés : INSERT active/hidden,
édition ordinaire, brouillon incomplet puis publication du même identifiant,
pause, vente, réactivation et renouvellement. Aucun nouvel endpoint obligatoire.
Les protections created_at et le cooldown n'altèrent pas le contrat de classement.
Les anciens binaires 4.7.x ne sont toutefois pas exécutés : leur compatibilité
complète reste NON CERTIFIÉE. Les tests ne prouvent pas non plus la validation
cryptographique JWT par HTTP ni la signature HTTP d'URL Storage.

GO PostgreSQL/RLS pour V5-02A sur le périmètre testé. Pas de GO de migration
Production ou de release native. Aucun nouveau défaut de migration détecté par la
suite. Les risques résiduels restent les limites ci-dessus et les autres lots de
l'audit, sans réouverture de l'audit fonctionnel ni traitement de V5-03.
