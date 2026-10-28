# YOUMBIA Push P0/P1 — validation Supabase isolé, 23 octobre 2026

> **Mise à jour du 24 octobre :** ce rapport conserve les preuves du harness représentatif (15 migrations Web). Il ne qualifie pas à lui seul la baseline Web complète. Pour le replay exhaustif et l’E2E Auth/PostgREST/Edge, suivre le rapport final [baseline complète et qualification push](./supabase-final-baseline-e2e-2026-10-24.md), qui remplace son verdict de readiness.

## Verdict et périmètre

**PASS AVEC RÉSERVES pour le backend isolé ; NO-GO production.** Le passage technique à une recette physique dédiée est possible après un GO explicite pour les appareils/builds et envois réels de test. Aucune réception Android/iOS n'est prouvée ici.

Le préflight de recette physique du 23 octobre 2026 est documenté dans [physical-qa-preflight.md](./physical-qa-preflight.md) : NO-GO tant que les environnements EAS ciblent Supabase production et qu'aucun appareil n'est disponible.

Référence initiale : `0a9d961aac1a6555f7982e04abdfa3089bfeff25`, branche `feat/ymb-transactional-push-p0-p1`, worktree `/private/tmp/youmbia-transactional-push`. Rapports précédents disponibles et lus. Release `codex/release-4.6.2`, HEAD `b5e2196`, index et trois dossiers Lifecycle non suivis conservés. Aucune opération Git sur main/TOM-104, aucun push ni PR.

Contrat avant exécution : identité locale obligatoire avant mutation, migration vierge puis baseline sourcée, upgrade avec données fictives, Auth/PostgREST/Edge réels, Expo HTTP simulé, RLS/ACL natifs, concurrence, tickets/receipts/retries/timeouts/logout, pg_cron/Vault/pg_net réels, lint/TypeScript/Deno/Vitest et revue des procédures. Skills repris : tsk-orchestrator, supabase, tsk-security, tsk-build, tsk-qa-gate ; diagnostic avant/après sur les défauts reproduits. Aucune délégation.

## Identité et isolation démontrées

Projet CLI neuf `youmbia-push-e2e-local`, répertoire `/private/tmp/ymb-push-e2e-local`, API `http://127.0.0.1:55421`, DB `127.0.0.1:55422`. Aucun `.env` ni `.temp/project-ref` de production copié. Les conteneurs ont tous le label `com.supabase.cli.project=youmbia-push-e2e-local`. Les clients refusent toute autre URL API/DB ; bootstrap/SQL ciblent un nom de conteneur fixe.

Versions réellement exécutées : PostgreSQL `17.6.1.143` (serveur 17.6, même version majeure/mineure que celle observée en production), GoTrue `v2.192.0`, PostgREST `v14.14`, Edge Runtime `v1.74.2` / Deno compatible 2.1.4. Extensions natives : pg_cron `1.6.4`, pg_net `0.20.3`, Vault `0.3.1`.

Uniquement comptes `.invalid`, annonces, messages, favoris et tokens Expo synthétiques. Aucun dump utilisateur, token réel, secret ou donnée personnelle de production importé. Les lectures cloud ont été limitées aux métadonnées de colonnes/ACL/objets/fonction ; aucune commande distante de mutation. Aucun projet cloud payant créé.

Le dispatcher normal est resté OFF par variable serveur. Trois assertions supplémentaires ont validé le vrai endpoint legacy authentifié : no-op avec outbox ON, refus du destinataire injecté et distribution uniquement par outbox. L'adaptateur E2E est présent seulement dans la copie locale, importe le vrai handler/store et change uniquement le flag de test et le transport Expo. Il vérifie le marqueur du projet et le hostname Docker local ; toutes les requêtes send/receipts sont forcées vers le simulateur HTTP local `host.docker.internal:55541`. Le simulateur n'a aucun droit réseau externe. Secrets de test générés localement, hors Git, fichiers mode 0600 et preuves expurgées.

## Migrations : résultats exacts

1. Le config historique désactive les migrations (`db.migrations.enabled=false`) : un simple `supabase db reset` initial réussit **sans appliquer les deltas**. Ne pas le présenter comme un PASS de migrations.
2. Option activée seulement dans la copie jetable : `supabase db reset --local --no-seed` échoue avec `baseline_schema_missing` à la garde initiale. Le dépôt mobile n'est toujours pas une baseline greenfield autonome. La garde n'a pas été supprimée ni contournée par des tables factices.
3. Baseline représentative construite depuis 15 fichiers SQL Web versionnés au ref `c0de541` : schema/RLS, moderation/trust, favoris, conversations/messages, taxonomy, etc. Les migrations admin/personnelles et seeds utilisateur ont été exclus. Compléments explicites de seules métadonnées observées : colonnes profiles historiques manquantes et grants legacy de tables omis des anciens SQL. Aucun DDL de table marketplace inventé. Manifest et hashes des fichiers appliqués conservés.
4. Les 32 deltas du HEAD initial passent dans l'ordre sur cette baseline vide. Le nouveau delta de grants a ensuite été appliqué, soit 33 deltas testés. Un second passage repart de la baseline + 30 deltas antérieurs au push, crée de vraies données fictives par Auth/PostgREST, puis applique les trois deltas push/sécurité/grants dans l'ordre.
5. Snapshot avant/après égal sur utilisateurs (IDs), profiles, annonces, conversations, messages, favoris et tokens : données métier conservées. Flags OFF, aucun backfill d'événement historique. Lookup et unsubscribe JWT fonctionnels après upgrade.

Cette baseline est sourcée et reproductible via le dépôt Web plus les compléments documentés. Elle ne constitue pas un export complet et certifié de tout l'historique production. Les migrations ont été appliquées explicitement par psql au conteneur local ; ne pas confondre ce manifeste avec un historique CLI cloud migré.

## Défauts démontrés puis corrigés

### Grants user_push_tokens — migration locale additive

Sur les nouveaux defaults Supabase, `claim_my_push_token` (definer) enregistrait le token mais un vrai JWT recevait `403 / 42501` lors de SELECT/DELETE par PostgREST. La table historique n'avait pas de GRANT explicite et dépendait des anciens defaults. Cela affectait l'unsubscribe connecté et la lecture legacy.

`20261023205854_explicit_push_token_grants.sql` accorde SELECT/INSERT/UPDATE/DELETE à authenticated et service_role, refuse anon/PUBLIC et ne restaure pas TRUNCATE/REFERENCES/TRIGGER. Les quatre politiques owner-only existantes sont conservées. Avant/après reproduit dans `upgrade.py`, puis contrôle RLS inter-utilisateur et logout connecté dans `backend.py`.

### Métadonnée mobile — colonne réelle

Le mobile écrivait `conversations.updated_at`, absent du schéma, et ignorait l'erreur. Le test ajouté échoue avant correction ; le HTTP réel confirme PGRST204 pour ce champ. Le mobile écrit maintenant `last_message_at`, existant. Test après correction PASS, messages/outbox non bloqués, aucune modification de compteurs ou de logique Auth.

### Scheduler — cible configurable, accès privé

Le script imposait une URL de production ; son appel avec l'URL isolée échoue avant toute requête réseau. La cible attendue provient désormais de `push_private.dispatch_target`, table owner-only avec RLS, aucun grant client ni service_role. Elle doit correspondre à l'URL stockée dans le Vault. NULL/mismatch/secret absent ⇒ refus. Une tentative de paramètre `app.settings.*` a été abandonnée après refus par Supabase ; aucun prérequis superuser n'a été ajouté.

Le script installe toujours le cron **inactif**. Le test a vérifié ce défaut, configuré seulement la cible locale, activé le vrai cron minute, observé son statut succeeded et une delivery acceptée via pg_net/Edge/mock, puis désactivé le job sans supprimer les données. Sept assertions, tick observé en environ 51 secondes.

### Accès injectable au transport, sans variante métier

Le code du handler/store a été déplacé de l'entrypoint dans une factory `createTransactionalPushHandler`. L'entrypoint normal utilise toujours Deno.env et fetch natif ; aucun paramètre client ne choisit une URL Expo. Le test importe exactement cette factory dans son adaptateur local. L'adaptateur et le simulateur ne doivent jamais être déployés en production.

## Résultats E2E

44 assertions du scénario HTTP complet : vrais utilisateurs GoTrue, login et identité JWT ; création conversation ; refus de vendeur/participants/annonce arbitraires ; refus tiers/spoof sender ; outbox sans fuite d'événement après INSERT refusé ; messages Web/Mobile équivalents HTTP ; premier contact unique ; calcul serveur du destinataire ; fanout cinq devices pour trois messages et aucun appareil expéditeur/tiers ; contenu privé absent du payload ; IDs de navigation ; RPC lecture et compteurs ; contrôle HTTP secret/payload ; dispatcher normal OFF ; tickets persistés, receipts sans resend.

Favoris : deux appareils du propriétaire ; retrait/réajout, auto-favori, annonce inactive, préférence indépendante et cooldown propriétaire/annonce ne génèrent pas de nouveau push. Pas d'agrégation ajoutée : plafond d'un événement par couple/24h, conformément à l'implémentation existante.

Fiabilité réelle Edge/DB + HTTP Expo simulé : 429/500/MessageRateExceeded donnent un retry avec backoff, pas de resend immédiat ; succès après avancement contrôlé de l'échéance. Cinq erreurs explicites épuisent définitivement la delivery. Le simulateur reçoit une requête puis retarde la réponse au-delà du timeout : uncertain persistant, aucune relance. JSON invalide : même quarantaine. DNR ticket et receipt : suppression de la version exacte du token ; ancien receipt DNR après réinscription ne supprime pas la version renouvelée.

Concurrence : deux clients HTTP créent exactement une conversation par unicité ; deux INSERT messages concurrents créent deux événements et un seul first_contact ; deux workers Edge concurrents ne distribuent chaque delivery qu’une fois. Une lease SQL expirée devient uncertain sans renvoi. Les suites SQL concurrentielles précédentes restent versionnées et ont été conservées.

SQL natif : vrais rôles Supabase/auth.uid, ACL/RLS, participants et tiers, droits tokens, pas de TRUNCATE client, RPC serveur non accessible, trois extensions réelles, toutes les tables publiques sous RLS. Transaction de contrôle rollbackée. Les RPC historiques lecture/masquage ont été exercées par HTTP.

## Qualité et signal statique qualifié

- Vitest : **68 fichiers, 512 tests PASS**.
- ESLint : exit 0, deux warnings préexistants hors périmètre.
- TypeScript et Deno check (entrypoints, adapter, mock) : PASS.
- SQL natif, E2E backend, upgrade et scheduler : PASS, logs et JSON expurgés hors arbre.
- `db lint --local --schema push_private --fail-on error` : PASS.
- Lint SQL global : exit 1 sur un EXECUTE conditionnel visant `listing_reports`, table optionnelle absente. Signal conservé, pas masqué. Le corps de `delete_my_account` local et celui observé à distance ont le même MD5 `6ba7fe963ce986e3be4058ddbb59b8e0` et un garde `to_regclass`. La RPC a été exécutée avec succès sur un compte/annonce fictifs et les a supprimés sans toucher les autres données. Il s'agit ici d'un diagnostic statique d'un chemin gardé, pas d'une régression runtime démontrée ; aucune modification de la RPC/Auth effectuée.

Le SHA final et l'empreinte de l'arbre testé, les commandes/codes et les hashes des logs sont consignés dans `/private/tmp/ymb-e2e-delivery.md`. Aucun PASS physique n'est revendiqué.

## Révocation hors ligne : garanties et limite

Le SDK Supabase installé a aussi été exécuté avec un transport réellement en erreur réseau : signOut renvoie une erreur avant de retirer la session locale. L’écran actuel ne redirige pas en cas d’erreur. Il ne faut donc pas affirmer que la tentative hors ligne a forcément terminé la déconnexion ; la réserve porte sur l’éligibilité serveur et la clarté de cet état, pas sur un succès de logout prouvé.

Le logout connecté peut supprimer le token serveur : testé par vrai JWT après correction des grants, puis zéro nouvel envoi à cet appareil. Appareil sans Internet : absence de requête de désinscription, association serveur inchangée, événement reçu par le simulateur pour A. C'est la limite reproduite, pas une garantie de sécurité absolue.

Après reconnexion et claim atomique du même token par B, un nouvel événement pour A ne produit plus de delivery sur ce device. Cela n'annule pas un push déjà accepté ou mis en file par un fournisseur. La queue de révocation liée au compte et un bail serveur borné restent des propositions ; durée/protocole nécessitent une décision pour ne pas désactiver les alertes d'utilisateurs légitimement inactifs. Aucune révocation publique sur simple token ni conservation de JWT après logout ajoutée.

## Rollback et recette physique

Le rollback local du scheduler a été exécuté : cron dédié inactif, dispatcher normal OFF, données conservées. Pour une future opération autorisée, stopper worker/cron en gardant messages_enabled=true pour neutraliser le legacy ; ne pas remettre accepted/uncertain en pending. Revenir au legacy seulement après drainage/clôture des claims et sans replay du backlog. Conserver les migrations additives ; aucun DROP de données métier pour revenir en arrière. Un push accepté ne se rappelle pas.

Pour installer le scheduler sur un environnement autorisé : configurer les deux secrets/URL Vault côté serveur, installer le script OFF, puis renseigner `push_private.dispatch_target.url` avec l'URL **de cet environnement**. Le matching avec Vault est obligatoire et fail-closed. Aucun secret ni service_role dans le client.

Recette physique NON EXÉCUTÉE : deux comptes fictifs et appareils Android/iOS dédiés, plus second device pour fanout ; vérifier credentials FCM/APNs et projectId du build ; permission accordée/refusée/révoquée sans reprompt automatique ; premier/second message, réponse et envoi Web ; foreground/background/app terminée ; ouverture conversation/listing à chaud/froid et session restaurée ; absence de doublon local/distant ; lecture, compteurs, Realtime et recherches sauvegardées ; favoris/cooldown/opt-out ; logout connecté/hors ligne/reconnexion/changement de compte. Conserver version/build, événement, ticket/receipt et observation sur appareil sans exporter le token.

Conditions : GO explicite pour l'environnement et les appareils/builds/envois réels de test, aucun utilisateur réel, décision sur le risque hors ligne, baseline/source de déploiement qualifiée. **GO technique conditionnel pour cette recette isolée ; NO-GO production, merge, publication ou activation dans cette mission.**

## Reproduction

Voir `supabase/tests/e2e/README.md`, le manifest sourcé, bootstrap/upgrade/backend/scheduler et tests natifs. La production `ainzxommczlyjhymuwgu` reste lecture seule ; les commandes d'exécution utilisent le projet local fixe, jamais `--linked`.

Sources officielles consultées : [Supabase — grants Data API explicites](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [Expo — tickets et receipts](https://docs.expo.dev/push-notifications/sending-notifications/). Les receipts simulés ne sont pas des preuves de livraison mobile.
