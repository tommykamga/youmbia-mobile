# Notifications transactionnelles P0/P1 — préparation locale, 23 octobre 2026

Validation Supabase locale exécutée : [rapport E2E](supabase-isolated-e2e.md). Backend/Edge/PostgREST, upgrade et cron testés avec Expo simulé ; appareils physiques non testés.

Mise à jour corrective : [audit sécurité des conversations](conversation-security-audit.md). Le correctif local d’identité et les tests associés remplacent la réserve initiale sur les participants ; les validations Supabase isolé et physiques restent à faire.

## Périmètre et préflight

Niveau L3 : événement PostgreSQL, privilèges serveur, livraison asynchrone et compatibilité mobile. Spec : demande utilisateur jointe « Notifications Push Transactionnelles P0/P1 ». Aucun déploiement, push Git, PR, build, envoi réel, migration distante ou changement Auth/Lifecycle autorisé/exécuté.

Départ observé : `codex/release-4.6.2`, HEAD `b5e2196`, index vide, trois dossiers Lifecycle non suivis. Préservés dans le checkout initial. `main` local `61e3565` est en retard sur `origin/main` `250edc2`. La release contient 40 fichiers de changements TOM-104/auth/marketing en dehors de main ; ils ne sont pas embarqués. Branche dédiée `feat/ymb-transactional-push-p0-p1`, worktree `/private/tmp/youmbia-transactional-push`, base `250edc2`. Aucun fetch ni push effectué : fraîcheur du remote à revérifier avant intégration. Aucun AGENTS.md ni `.tsk/policies/QA_POLICY.md` trouvé aux emplacements inspectés ; contrat de contrôle défini ci-dessous, sans prétendre appliquer une politique absente.

## Audit initial de l'existant (avant correctif de sécurité)

Audit distant en lecture seule sur `ainzxommczlyjhymuwgu`, métadonnées uniquement :

- `send-message-push` active v10 (brief v8), JWT plateforme activé ; code récupéré : lookup message, validation expéditeur JWT, lookup conversation, tokens puis Expo. Absence de ledger, claim, receipts, contrôle HTTP et appartenance explicite du sender. Le code local reçoit le contrôle d'appartenance et le verrou de bascule.
- `dispatch-saved-search-alerts` active v9 (brief v7), JWT plateforme désactivé ; pattern local avec secret dédié, claim/complete et délais. Ce chemin reste inchangé.
- RLS activée sur messages, conversations, favorites, listings, user_push_tokens. Insertion messages : sender=auth.uid et participation à la conversation ; favoris : user_id=auth.uid. Tokens : gestion du seul utilisateur courant. L'UPDATE existant des conversations permet aux participants de modifier la ligne : intégrité des participants à renforcer séparément avant activation (voir risques).
- Unique trigger distant observé sur les surfaces inspectées : `trg_conversations_undelete_on_new_message` AFTER INSERT. Aucun trigger push message/favori. Les trois jobs cron observés concernent recherches sauvegardées et Lifecycle ; aucun dispatcher transactionnel.
- Schéma distant confirmé : conversations buyer_id/seller_id/listing_id ; messages id/conversation_id/sender_id/body ; favorites id/user_id/listing_id ; listings user_id/status ; tokens id/user_id/expo_push_token/updated_at.
- `sendMessage.ts` appelle encore l'ancienne fonction après INSERT. Conservé en compatibilité flag OFF ; quand le flag serveur passe ON, l'ancienne fonction retourne sans envoyer, y compris avec d'anciens clients. Web ne dépend pas de cet appel avec le flag ON.
- `toggleFavorite.ts` ne déclenche aucun push client. Inchangé : INSERT serveur constitue la seule source.
- `notifications.ts` possède permissions, canal Android `default`, claim atomique du token, listeners et routes conversation/listing. Canal réutilisé pour compatibilité du socle stable ; ne dépend pas des changements de canal TOM-104.
- `pushSessionSync.ts` synchronise restauration/login/refresh ; `app/_layout.tsx` resynchronise au retour au premier plan et attend restauration de session/navigation pour consommer l'ouverture. La conversation redirige vers le gate avec le chemin de retour si la session manque. Aucune modification nécessaire de ces deux fichiers.
- Logout existant : désinscription du token courant avant signOut, erreur seulement journalisée si le réseau échoue. Pas de modification du parcours Auth autorisé. La suppression FK des deliveries interdit ensuite l'envoi de ce token par l'outbox.
- Fallback local natif supprimé pour les messages : un cache local absent ne prouve pas que le serveur n'a aucun token. Expo Go conserve son fallback local, désormais sans identité dans le corps.

## ADR : outbox transactionnelle et distribution par appareil

Aucun changement architectural ne peut couvrir les messages Web, l'idempotence et les receipts. Deux options : webhook direct (simple mais pas de registre durable et résultat ambigu difficile à gérer), ou outbox SQL avec dispatcher périodique (plus de schéma, concurrence et reprise vérifiables). Outbox retenue ; aucune nouvelle dépendance mobile ni nouveau fournisseur.

Le trigger message BEFORE INSERT verrouille la conversation puis crée un événement sans contenu privé. BEFORE permet de sérialiser la détection du premier message ; l'événement et le message deviennent visibles ensemble au COMMIT. Un rollback supprime les deux. Le trigger favoris AFTER INSERT vérifie propriétaire, statut active, préférence indépendante et cooldown de 24 h par couple propriétaire/annonce. Pas de trigger DELETE. Les erreurs d'enqueue sont confinées dans une sous-transaction et émettent un warning générique : le message/favori ne dépend pas de la disponibilité de la notification, au prix d'une éventuelle perte d'événement à surveiller.

Tables : config (deux flags OFF), préférences utilisateur, événements uniques `(kind,source_id,recipient_id)`, deliveries uniques `(event_id,token_id)` et cooldown privé. RLS activée partout ; aucun accès anon/authenticated aux événements, tokens de livraison ou config. Préférences limitées à auth.uid. Fonctions privilégiées internes dans push_private ; wrappers public réservés service_role. Aucun body de conversation ni identité de l'auteur d'un favori conservé dans l'événement/payload.

Le claim RPC prend au plus 10 appareils par invocation Edge (RPC borné à 100) avec FOR UPDATE SKIP LOCKED, snapshot des appareils une seule fois par événement, puis revalidation de propriété/version du token, préférence et état de l'annonce. Zéro appareil = événement clôturé pour la distribution ; pas de backfill lors d'une connexion ultérieure. Événements plus vieux que 24 h non envoyés. Les messages ne modifient ni unread ni Realtime.

Une delivery suit pending → sending → accepted → delivered/failed. `delivered` signifie receipt Expo OK (prise en charge par FCM/APNs), **pas preuve d'affichage au téléphone**. HTTP 429/5xx explicitement reçus et MessageRateExceeded : backoff 30/60/120/240 s, cinq tentatives maximum, Retry-After numérique plafonné à une heure. Timeout, JSON/ticket absent et lease expirée après cinq minutes : uncertain, aucune relance automatique. Persistance du ticket échouée : arrêt de l'invocation, lease vers uncertain. Expo ne fournit pas de garantie exactly-once de bout en bout ; ses propres doublons restent possibles.

Receipts interrogés après 15 minutes, puis toutes les heures, 24 consultations maximum. Les erreurs receipts ne renvoient jamais le push. DeviceNotRegistered supprime uniquement le token de même id, propriétaire et updated_at ; une réinscription ou un transfert postérieur reste intact. Les mises à jour Edge utilisent claim_id/state comme compare-and-set. L'endpoint exige un secret serveur dédié d'au moins 32 caractères, comparaison sur longueur fixe, aucun JWT utilisateur accepté. `verify_jwt=false` explicite pour cet endpoint uniquement. Second interrupteur environnement `TRANSACTIONAL_PUSH_WORKER_ENABLED`, OFF si absent.

## Contrat de contrôle et reproduction

Requis avant commit : npm run lint, npm run typecheck, npm test, deno check des fonctions modifiées, git diff --check, migration et tests SQL/RLS sur PostgreSQL éphémère, concurrence deux connexions. Tests Expo uniquement simulés ; aucun accès réseau Expo pendant les tests. Tests matériels et validation complète de migration sur une copie représentative de Supabase restent requis avant activation.

Tests SQL : `supabase/tests/transactional_push_fixture.sql` est un **contrat minimal observé**, pas l'historique complet de production. Sur une base jetable avec rôles Supabase absents, appliquer ce fixture, la nouvelle migration, puis `supabase/tests/transactional_push.sql` avec psql ON_ERROR_STOP. Ne jamais utiliser le fixture sur une vraie base. `transactional_push_concurrency.py` cible exclusivement `/private/tmp`, port 55439, base synthétique ymb_conversation_security : premier message simultané et deux claims concurrents. Le script nettoie ses seules données synthétiques, réservé à cette instance jetable.

Couverture : premier message acheteur, deuxième message, réponse vendeur, insertion directe SQL représentant le Web, exclusion tiers, multi-appareil, auto-favori, retrait/réajout, opt-out au trigger et avant distribution, annonce inactive, idempotence, leases incertaines, RLS lecture/écriture inter-utilisateur, suppression token/version, auth dispatcher, tickets/receipts, backoff borné, erreurs ambiguës, routes mobile, permissions révoquées, fallback local.

Les preuves des commandes sont conservées hors de l'arbre dans `/private/tmp/ymb-push-*.log`. L'empreinte finale et le SHA sont consignés dans le rapport de livraison externe à l'arbre. Les deux warnings lint existants (script Lifecycle et avatarImageUrl) ne sont pas corrigés hors périmètre.

## Recette physique à réaliser (NON EXÉCUTÉE)

Deux comptes (acheteur/vendeur), Android physique et iPhone physique, plus un second appareil par compte si disponible. Builds signés existants compatibles, credentials FCM/APNs et EAS projectId vérifiés. Expo Go ne valide pas le push distant. Permissions jamais redemandées automatiquement ; opt-in depuis l'action utilisateur existante.

Pour chaque OS, tester app foreground, background puis terminée : premier contact → un seul push vendeur et bonne conversation ; second message → push standard ; réponse vendeur → acheteur ; envoi depuis Web → mobile. Noter heure, version native, source id, delivery id, ticket, receipt, observation de l'appareil sans copier les tokens. Contrôler zéro push expéditeur sur tous ses appareils et un push par appareil autorisé du destinataire.

Ouvrir notification à chaud, à froid avec session restaurée, puis sans session (login et retour conversation). Vérifier unread, lecture et Realtime. Favori actif → propriétaire ; retrait, auto-favori, annonce inactive, opt-out et rafale de réajouts → aucun nouvel envoi. Révoquer permission système puis revenir foreground : suppression token serveur et aucun prompt ; logout connecté puis changement de compte : ancien compte ne reçoit plus sur cet appareil. Simuler absence réseau au logout et documenter la limite existante.

Comparer les alertes recherches sauvegardées avant/après (foreground/background/cold start) ; elles doivent rester fonctionnelles et leur cron ne change pas. Un ticket accepté seul ne valide aucun scénario matériel.

## Activation progressive future — non exécutée

1. Revue du diff et du schéma sur un environnement isolé représentatif ; rejouer tests SQL/RLS et inspection advisors. Résoudre les risques d'intégrité des conversations et tester les builds RC : cette branche part volontairement du main stable.
2. Obtenir autorisation distincte pour chaque migration distante, déploiement et envoi réel. Appliquer seulement la nouvelle migration revue ; flags restent OFF. Ne pas appliquer en bloc les migrations main non déployées (dont shops PR26).
3. Déployer l'ancienne fonction avec son verrou de bascule **avant** tout flag ON. Vérifier que le mode OFF préserve les messages legacy. Déployer le nouveau dispatcher OFF. Configurer EXPO_ACCESS_TOKEN côté serveur si la sécurité renforcée Expo est active.
4. Configurer un secret aléatoire dédié identique dans Deno et Vault (`transactional_push_dispatch_secret`), plus l'URL Vault `transactional_push_dispatch_url`. Aucun secret en Git/mobile. Le script `supabase/operations/transactional_push_scheduler.sql` crée le cron chaque minute **inactif** ; exécution uniquement après autorisation. pg_cron/pg_net/Vault requis ; script testé depuis sur Supabase local. Configurer la cible owner-only `push_private.dispatch_target.url` de cet environnement, identique à celle du Vault ; le cron reste OFF.
5. Sur environnement de recette, activer worker et cron, messages seulement, favoris OFF. Attendre la fin des invocations legacy en vol avant le passage ON ; fenêtre contrôlée et aucun rejeu manuel. Vérifier les appareils et le Web ; surveiller erreurs, warnings d'enqueue, backlog, uncertain, receipts manquants, credentials et DNR. L'ancien appel mobile devient un no-op serveur quand messages_enabled=true.
6. Après recette et autorisation production, répéter P0 sur une fenêtre de faible trafic ; observer, puis autoriser séparément P1. Le déploiement global n'a pas de ciblage cohortes intégré : canary sur environnement séparé, puis bascule P0/P1 distincte. Préférences indépendantes du marketing, défaut favoris autorisé sous permission OS.
7. Définir SLO et seuils avant activation : backlog plus de cinq minutes, hausse de uncertain/failed/enqueue warnings ou retour doublons ⇒ stopper worker et investiguer. Prévoir une purge administrative documentée des événements terminaux >30 jours, jamais des claims actifs ; pas de purge automatique incluse.

## Rollback

Arrêt immédiat : désactiver le cron dédié et mettre TRANSACTIONAL_PUSH_WORKER_ENABLED=false. Garder messages_enabled=true pendant l'arrêt : cela maintient l'ancien sender neutralisé et évite une double source. Les messages restent utilisables ; l'outbox attend, sans garantie d'alerte pendant l'arrêt.

Pour revenir au legacy, attendre les invocations actives, traiter accepted/uncertain sans les remettre pending, clôturer les pending de la fenêtre puis désactiver les flags sous contrôle opérationnel. Aucun replay du backlog sur ce retour. Garder la fonction legacy avec garde et la migration additive tant que des clients la sollicitent. Ne pas supprimer les tables, préférences ni modifier les données métier lors du rollback. Un push déjà accepté ne peut pas être rappelé. Toute commande distante de rollback reste soumise à autorisation.

## Risques et écarts explicites

- NO-GO activation tant que QA Android/iOS et répétition sur Supabase isolé représentatif ne passent pas. PostgreSQL local différent de la version distante ; fixtures partielles, pas un test de migration de tout le projet. Scheduler pg_net/cron/Vault exécuté depuis en local, voir rapport E2E.
- Intégrité des conversations : réserve initiale corrigée localement par `20261023202544_conversation_identity_security.sql` (création validée et identités immuables). Tests avec rôles authentifiés et concurrence dans l’audit complémentaire ; production inchangée.
- Une erreur d'enqueue est volontairement non bloquante : notification perdue possible ; alerte sur le warning générique nécessaire. Unicité SQL n'est pas une garantie de livraison ni d'exactly-once chez Expo/FCM/APNs.
- Timeout = uncertain sans retry : choix anti-doublon, pertes possibles. 429/5xx retriés selon recommandations Expo, sans garantie absolue contre un fournisseur ayant accepté avant erreur.
- Logout hors ligne : le parcours existant continue malgré l'échec de désinscription ; token peut rester associé jusqu'à la prochaine synchronisation/réclamation. Révocation OS inconnue du serveur avant retour foreground ou receipt fournisseur. Fenêtre entre claim et requête réseau pour logout/opt-out inévitable, payloads génériques uniquement.
- Réenregistrement du token entre enqueue et claim : delivery ignorée si updated_at change ; privilégie sécurité à livraison. Token supprimé fait disparaître ses deliveries par FK, événement métier reste auditable.
- Pas d'agrégation favoris : plafond d'une notification propriétaire/annonce/24h ; pas de quota global propriétaire toutes annonces confondues. Pas de contenu conversation ni identité favori.
- Pas de PR/push automatique : autorisation distante absente et CI/deploy hooks non qualifiés. Code et tests locaux seulement.

## Documentation officielle consultée

[Expo envoi, tickets, receipts, limites et retries](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) (l'URL v54 redirige vers latest : API existante vérifiée aussi par types SDK installés), [Supabase sécurisation Edge Functions](https://supabase.com/docs/guides/functions/auth), [changelog Supabase](https://supabase.com/changelog), [grants explicites Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [changements PostgreSQL septembre 2026](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Les changements ltree/crypto/GiST ne concernent aucun objet ajouté ici ; grants explicites inclus.
