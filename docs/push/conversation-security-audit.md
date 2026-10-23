# YOUMBIA — sécurité conversations et push, 23 octobre 2026

## Périmètre, préflight et contrat

Correction L3 sur `feat/ymb-transactional-push-p0-p1`, worktree `/private/tmp/youmbia-transactional-push`, référence `610da38b3b74192da051697013b3e47146938453`, base `250edc2`. Rapport temporaire initial et documentation disponibles, lus. Les 20 fichiers du commit initial ont été examinés, notamment l'outbox, les fonctions Edge, les permissions et les fixtures. Checkout release `codex/release-4.6.2` à `b5e2196` préservé avec ses trois dossiers Lifecycle non suivis ; checkout Web inspecté en lecture seule, aucune modification.

Skills appliqués : tsk-orchestrator, tsk-security, tsk-build, tsk-qa-gate. Aucun AGENTS.md ni QA_POLICY.md supplémentaire trouvé dans le worktree. Aucun agent délégué. Contrôles requis avant commit : lint, TypeScript, Deno pour les deux fonctions Edge, Vitest, reproduction avant correction, SQL/RLS après correction, concurrence, inspection des privilèges et diff. QA Android/iOS et Supabase isolé réel explicitement hors de cette exécution ; aucun test simulé ne les remplace.

Production `ainzxommczlyjhymuwgu` consultée uniquement par SELECT de métadonnées et agrégats. Aucun SQL de mutation, migration distante, secret modifié, envoi réel, déploiement, merge, push Git ou build. PostgreSQL distant 17.6 ; PostgreSQL local 18.3 : limite de représentativité conservée.

## Audit initial et preuves

Observations distantes à l'heure de l'audit : 66 conversations, zéro participant nul/identique, zéro annonce manquante, zéro vendeur différent du propriétaire actuel, zéro groupe dupliqué `(listing_id,buyer_id,seller_id)`. Contraintes existantes : PK, FK vers listings/users avec suppression cascade et UNIQUE du triplet. Ces compteurs ne prouvent pas l'identité historique de l'auteur d'une conversation ; aucune réparation automatique n'en découle.

RLS SELECT conversations/messages : participants uniquement. INSERT messages : `sender_id=auth.uid()` et participation ; aucune politique UPDATE/DELETE messages. INSERT conversation : acheteur **ou vendeur** connecté, sans relation à l'annonce. UPDATE conversation : participant avant et après, sans immuabilité des autres participants. DELETE conversation : aucune politique. Les rôles anon/authenticated avaient des grants table excessifs comprenant TRUNCATE ; RLS ne protège pas cette commande. Le schéma public n'accorde pas CREATE à ces rôles (pas d'exploitation de search_path démontrée).

Les fonctions mark_conversation_read/hide_conversation_for_me sont SECURITY DEFINER, contrôlent auth.uid et la participation, mais possédaient des grants anon explicites ; révoquer PUBLIC seul dans les migrations historiques n'avait pas supprimé ces grants. Leur search_path était public. La fonction trigger conversations_undelete_on_new_message avait EXECUTE PUBLIC et anon/authenticated. Une fonction trigger ne s'appelle pas comme une RPC ordinaire ; aucun contournement direct ainsi démontré. Les nouvelles fonctions outbox ont un search_path vide et leurs RPC de distribution sont service_role uniquement. Les événements et deliveries ont RLS et aucun grant client ; la préférence est limitée à auth.uid.

Flux mobiles : getOrCreateConversation lit l'annonce active, fixe buyer au user connecté et seller au propriétaire ; les mises à jour ne changent pas d'identité. markConversationRead remet le compteur courant à zéro après la RPC sécurisée. hideConversationForMe utilise la RPC. sendMessage insère le sender connecté ; son UPDATE updated_at préexistant cible une colonne absente du schéma distant, erreur actuellement ignorée, pas introduite/corrigée ici.

Flux Web observé dans le checkout voisin `Youmbia-web`, HEAD `c0de541` (pas une preuve du code Web actuellement déployé) : lib/messageActions.ts → lib/data/conversations.ts. Le client Supabase serveur utilise la session utilisateur, pas service_role. buyer provient de getUser, sellerId provient de l'action ; aucune validation du propriétaire côté serveur applicatif. Les mises à jour légitimes portent sur last_message_at, last_message_preview et les deux compteurs. La suppression pour soi et les RPC de lecture ne touchent aucune identité. Les nouvelles règles PostgreSQL sont donc compatibles avec les écritures observées ; le Web n'a pas besoin d'une nouvelle API. En course de création, l'unicité était déjà présente, mais le perdant pouvait afficher une erreur ; le mobile récupère désormais le gagnant sur 23505. Le checkout Web reste inchangé et peut encore demander une nouvelle tentative après un conflit d'unicité, sans créer de doublon.

## Vulnérabilités confirmées et sévérité

| Constat | Gravité | Justification et traitement |
|---|---|---|
| Réassignation buyer/seller/listing par un participant | Haute | Peut partager l'historique avec une nouvelle identité et détourner les notifications. Reproduit localement avec les politiques observées, refusé après trigger d'immuabilité. |
| Création vendeur initiée ou vendeur sans lien avec l'annonce | Haute | Usurpation du rôle/contexte et routage trompeur. Reproduction locale d'un seller arbitraire, création contrôlée buyer/auth.uid + propriétaire + statut + verrou après correctif. |
| Grants TRUNCATE clients | Moyenne, latente | Destruction hors RLS possible pour une session SQL avec ces rôles ; aucune route REST/RPC permettant TRUNCATE n'a été démontrée. Privilèges supprimés sur conversations/messages et tables liées inspectées. |
| Grants RPC anon / helper trigger public / search_path public | Faible, défense en profondeur | Les RPC contrôlent déjà auth.uid, et public n'est pas writable par les clients. Retrait des grants inutiles, search_path vide, corps métier conservés. |
| Lookup legacy message avant authentification | Faible | Oracle d'existence pour un appel direct non authentifié si la barrière plateforme est absente. Authentification déplacée avant lookup et requête limitée au sender authentifié. |
| Nettoyage legacy DNR par token seul | Moyenne | Une réinscription/transfert entre envoi et réponse pouvait être supprimée. Nettoyage conditionné par id/propriétaire/version. |
| Token conservé après logout hors ligne | Moyenne, résiduelle | Serveur non informé, notifications génériques possibles jusqu'à une désinscription ou réattribution. Limite constatée, proposition ci-dessous. |

La reproduction avant migration est exécutée dans conversation_security_repro.sql sur des utilisateurs synthétiques : faux seller et mutation acceptés, puis rollback. Le même mécanisme est refusé par conversation_security.sql après migration. Les SELECT distants prouvent la configuration observée, **pas une exploitation active en production**.

## Correctifs réellement implémentés

Migration locale `20261023202544_conversation_identity_security.sql` :

- Trigger BEFORE INSERT OR UPDATE dans push_private, SECURITY DEFINER à search_path vide, aucun droit EXECUTE client/service sur le helper. INSERT : auth.uid non nul = buyer, buyer différent du seller, propriétaire réel et annonce active/published. FOR SHARE sur l'annonce empêche une validation sur ancien propriétaire/statut pendant une écriture concurrente.
- UPDATE : id, buyer_id, seller_id, listing_id immuables pour tous les writers, y compris service_role. Aucun contournement par user_metadata, rôle déclaré dans un payload ou profondeur de trigger. Aucune API de réaffectation administrative créée ; une correction administrative exceptionnelle nécessiterait un changement contrôlé et autorisé séparément. Les autres colonnes restent inchangées et leurs écritures autorisées selon les droits/RLS existants. Les discussions existantes restent utilisables après passage de l’annonce à sold/hidden ; le statut n’est contrôlé que lors d’une nouvelle création.
- Policy INSERT remplacée pour imposer aussi buyer=auth.uid et relation annonce/seller ; trigger constitue la défense indépendante des politiques permissives. RLS SELECT/UPDATE participants et message INSERT/SELECT conservées.
- Aucun ajout de colonne, réécriture, suppression, nouvelle contrainte d'unicité ou dédoublonnage. La contrainte UNIQUE existante arbitre les créations simultanées.
- Retrait des grants anon/PUBLIC sur conversations/messages et des droits de maintenance clients hors RLS ; message UPDATE/DELETE et conversation DELETE clients révoqués. Les mutations service nécessaires aux traitements de compte et les RPC definer conservent leurs droits. Retrait aussi de TRUNCATE/REFERENCES/TRIGGER clients sur listings/favorites/user_push_tokens, sans supprimer leurs opérations métier.
- search_path vide et ACL précis sur les trois anciennes fonctions de lecture/masquage/unhide ; fermeture des helpers d'enqueue et table cooldown privés.

Edge : le endpoint legacy n'accepte que `{message_id: UUID}` ; tout recipient, receiver ou token supplémentaire est refusé. JWT vérifié avant lecture privilégiée ; sender filtré par le user validé ; receiver toujours calculé avec les participants persistés. Le dispatcher exige son secret dédié avant tout travail, n'accepte qu'un objet vide de réveil, puis charge les deliveries réclamées par RPC. Un destinataire/token ne peut pas être fourni par l'appelant. Les tests HTTP n'exécutent jamais de fetch réel.

Le nettoyage DNR legacy utilise id/user_id/updated_at pour ne pas supprimer une nouvelle inscription. Le nouveau dispatcher possédait déjà ce contrôle dans invalidate_transactional_push_token. Payloads sans contenu privé inchangés. Le flag serveur continue à neutraliser le legacy quand l'outbox est ON.

## Tests et contrôles

Le fixture local a été enrichi avec les colonnes, FK, unicité et RLS observées, au lieu de tester uniquement comme service_role. Il reste un sous-ensemble de l'historique Supabase et ne remplace pas sa répétition complète. Les scripts ciblent exclusivement le socket `/private/tmp`, port 55439, base synthétique `ymb_conversation_security`. Sur un cluster jetable neuf, exécuter `python3 supabase/tests/run_conversation_security.py` depuis le worktree : il crée une nouvelle base, applique les prérequis listés, reproduit avant correction, teste après migration et lance les deux suites concurrentielles. Il refuse une base déjà existante et ne la supprime jamais.

| Contrôle | Preuve exécutable |
|---|---|
| Création légitime et refus tiers, seller arbitraire, seller initiateur, annonce cachée/manquante | conversation_security.sql, rôle authenticated avec uid distincts |
| Mutations seller par buyer, buyer par seller, listing/id, même en service_role | conversation_security.sql, erreurs 42501 attendues |
| SELECT/UPDATE tiers, messages tiers/spoof sender, DELETE/TRUNCATE, accès anon | conversation_security.sql ; aucune lecture/écriture non autorisée |
| Messages acheteur puis vendeur, premier contact unique, favoris et fanout | SQL vérifie 3 événements message, 1 premier contact, 1 favori, 7 deliveries, aucun token tiers |
| Compteurs, read_at, hide et unhide | RPC historiques exécutées avec rôles authentifiés après durcissement |
| EXECUTE et search_path | Assertions pg_proc/has_function_privilege + inspection migration |
| Conversations concurrentes et mutation pendant un INSERT message après attente de verrou | conversation_security_concurrency.py, 2 connexions authenticated |
| Propriétaire d'annonce modifié pendant création | même script, refus du seller obsolète après attente de verrou |
| Premier contact simultané / claims concurrents | transactional_push_concurrency.py, régression du mécanisme existant |
| Destinataire/token arbitraire et requêtes worker | transactionalPushSecurity.test.ts, HTTP simulé et callback de travail non appelé |
| Mobile conflit 23505 et absence de réécriture | getOrCreateConversation.test.ts |
| Nettoyage token échoué puis retry connecté | notifications.test.ts, aucun faux succès serveur |
| Expo réponse perdue, tickets, receipts et backoff | transactionalPushWorker.test.ts, tests simulés conservés |

Les résultats exacts, codes retour, SHA et empreinte finale sont consignés hors de l'arbre dans `/private/tmp/ymb-conversation-delivery.md` et les logs `/private/tmp/ymb-conversation-*.log`. Lint conserve deux warnings historiques hors périmètre. Aucun test physique exécuté.

## Déconnexion hors ligne : constat et protection proposée

Le signOut actuel tente unregisterCurrentPushToken, journalise l'échec puis poursuit le logout. La fonction de cleanup garde le token local en cas d'erreur ; le test vérifie un retry connecté réussi. La connexion suivante réclame atomiquement le token au nouveau propriétaire via claim_my_push_token. Cela protège le changement de compte après reconnexion, **pas** un appareil qui se déconnecte définitivement sans réseau. Une notification déjà acceptée ne peut pas être rappelée.

Aucune garantie de révocation instantanée n'est possible hors ligne. Proposition avant activation générale : (1) queue locale persistante de révocations avec compte d'origine, retry uniquement sous une session autorisée correspondante et avant toute nouvelle inscription ; (2) réattribution atomique sur changement de compte ; (3) bail serveur borné fondé sur last_seen_at, renouvelé au login/foreground et appliqué aux deux chemins de distribution. La durée doit être décidée avec le produit et testée : une durée trop courte supprimerait les notifications aux utilisateurs légitimement inactifs. Ne pas créer un endpoint public de suppression sur simple token, ni conserver un JWT après logout pour contourner l'autorisation.

Cette proposition est documentée, **pas implémentée** ici : ajout de protocole de révocation et choix d'une durée changeraient les garanties métier au-delà du correctif d'identité. Les 21 tokens distants observés ont moins de 30 jours, sans que cela justifie un seuil arbitraire. Le risque reste explicite pour la décision d'activation.

## État de livraison incertain

Aucun retry ajouté pour timeout/JSON invalide/ticket absent/perte de persistance. Une lease sending expirée devient uncertain sans requeue. Un receipt manquant provoque uniquement une nouvelle lecture de receipt, bornée, jamais un nouvel envoi. Les réponses 429/5xx explicites restent réessayées selon le mécanisme existant et borné ; l'absence d'exactly-once chez Expo/FCM/APNs reste une limite. Un receipt OK atteste la prise en charge fournisseur, pas la réception au téléphone. Aucune remise manuelle uncertain→pending prévue automatiquement.

## Données préexistantes et plan non destructif

Aucune anomalie détectée dans le diagnostic distant actuel. Avant toute migration isolée puis production, relancer le diagnostic d'agrégats : participants nuls/égaux, annonces orphelines, vendeur/propriétaire incohérent et triplets dupliqués. Si résultat non nul : ne pas réaffecter ni fusionner automatiquement. Suspendre l'activation, faire qualifier chaque cas par un administrateur autorisé, distinguer transfert historique légitime d'une falsification et préparer une remédiation revue, sauvegardée, traçable. Le trigger ne modifie pas les identités des anciennes lignes. Un changement de propriétaire **postérieur** à une création validée ne transfère jamais la conversation au nouveau propriétaire : les participants historiques restent immuables.

## Prochain GO recommandé

GO pour **préparer une validation sur Supabase isolé**, après autorisation de créer/utiliser cet environnement et de ses coûts éventuels. NO-GO pour activation/production dans cette mission.

Sur l'environnement isolé : répéter les schémas/grants/triggers/RPC représentatifs du backend 17.6 sans données personnelles, appliquer uniquement les deux nouvelles migrations dans l'ordre après les prérequis historiques, rejouer reproduction avant correctif puis tests RLS/concurrence après correctif. Exécuter advisors et vérifier les ACL effectifs, vérifier PostgREST avec JWT utilisateur/tiers/anon et requêtes HTTP interdites. Tester Web et mobile : création, 23505, envoi, compteurs, lecture, hide/unhide, favoris, logout/relogin, liens à froid/chaud. Tester le scheduler pg_net/Vault/cron sur cet environnement, OFF initialement ; les envois réels requièrent un GO distinct et des appareils dédiés.

Ensuite seulement : recette physique Android/iOS, choix du protocole de révocation hors ligne, revue des écarts, autorisations distinctes de migration/déploiement/envoi. Aucun merge dans main/TOM-104 ni publication automatique.

## Sources officielles

[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL privilèges](https://www.postgresql.org/docs/current/ddl-priv.html), [Expo limites de livraison](https://docs.expo.dev/push-notifications/faq/). Les choix de verrouillage et les garanties locales sont également vérifiés par les tests SQL concurrentiels exécutés, pas déduits de la seule documentation.
