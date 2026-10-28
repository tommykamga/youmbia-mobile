# YOUMBIA Push QA — manifeste et préflight distant

Référence locale : `feat/ymb-transactional-push-p0-p1` à `925eb312ad46b40e6ee541bdabb03f92052087cd`. Projet QA demandé : `wagvrytcguutgbjzhvak` (`YOUMBIA-PUSH-QA`, organisation `youmbia-push-qa`, `eu-west-1`). PROD `ainzxommczlyjhymuwgu` reste strictement hors cible.

## État du préflight

Le seul ensemble d’outils Supabase exposé dans cette session est `mcp__codex_apps__supabase_*`; il ne propose aucun paramètre de sélection de connexion. Ses réponses listent uniquement l’organisation `TESKA SAS` et refusent `get_project`, `list_migrations` et `list_edge_functions` pour le ref QA. Il ne confirme donc pas la connexion nommée **YOUMBIA Push SMS**. L’état `ACTIVE_HEALTHY`, la liste de migrations vide et l’absence de fonctions restent des preuves fournies par l’utilisateur, non revérifiées par le connecteur actif. Aucun SQL ni changement distant n’a été lancé.

Le HEAD demandé est exact. Le commit `925eb312` descend de `24bd50d`; son delta ne touche que `supabase/tests/e2e/native-security.sql` et `supabase/tests/e2e/shops-policy.py`. Les migrations, fonctions Edge et `supabase/config.toml` sont identiques au commit de qualification de la baseline. Aucun audit historique ni test local n’a été rejoué. La qualification antérieure et ses résultats sont consignés dans [supabase-final-baseline-e2e-2026-10-24.md](./supabase-final-baseline-e2e-2026-10-24.md).

## Manifeste exact

Le JSON associé contient les 77 entrées avec leur ordre et SHA-256 : deux fichiers schema/RLS Web, 37 migrations Web non personnelles, deux compléments issus de métadonnées, 33 migrations mobiles, une migration Web consentement récupérée et deux compléments QA. Le lot push correspond aux trois migrations `20261023200527`, `20261023202544` et `20261023205854`, déjà incluses dans ces 33 migrations mobiles : ne pas les appliquer une seconde fois. La source Web est épinglée à `c0de54189ad9cb6a6968e186e387731a4a759f7d`. La correction de cast enum de la migration de statut report est une correction déterministe appliquée seulement au replay local; le manifeste conserve le hash de la source originale et la note de correction.

Le manifeste qualifié n’est pas l’historique de migrations Supabase : le runner local applique du SQL directement et refuse explicitement les cibles non loopback. `supabase/config.toml` désactive aussi la migration CLI. Le provisionnement distant devra donc utiliser une procédure QA dédiée, auditée et épinglée au ref, avec un journal d’application explicite; ne pas lancer `supabase db push` en supposant qu’il appliquerait cette baseline.

## Contrôles sécurité et services sortants

- `shops_select_public` conserve le filtre `status = 'active'`; le complément ACL QA accorde seulement `SELECT` aux rôles clients, `INSERT/UPDATE` à `authenticated` et `service_role`, sans privilèges de suppression ou de trigger.
- `user_credentials` et `auth_flow_tokens` gardent RLS sans droits Data API clients; la baseline source n’accorde pas non plus `service_role`. Ne pas élargir ces droits.
- `transactional_push_config.messages_enabled` et `favorites_enabled` ont un défaut `false`; les événements et livraisons restent privés et accessibles au service selon les grants versionnés.
- Le SQL `qa-network-safety.sql` désactive les cron et échoue si un cron reste actif, si Vault contient un secret ou si `pg_net` contient une requête/réponse. Il doit être exécuté après les migrations qui installent des schedulers et le contrôle final doit confirmer zéro job actif. Les migrations Web peuvent créer des jobs cron; tout déploiement devra garder Vault vide durant l’application.
- `dispatch-transactional-push` a `verify_jwt = false`, mais vérifie le header `X-Transactional-Push-Secret` d’au moins 32 caractères, puis le flag `TRANSACTIONAL_PUSH_WORKER_ENABLED`. Initialement, ce flag doit rester `false` et `EXPO_ACCESS_TOKEN` absent. L’Edge runtime n’est pas isolé du réseau sortant par les gardes SQL.
- `send-message-push` conserve une branche de compatibilité qui POST directement à Expo quand le flag outbox est `false`. Ne pas déployer/invoquer ce chemin tant qu’un garde QA fail-closed dédié n’est pas établi; le test local Expo mock ne doit jamais être déployé. `dispatch-saved-search-alerts` est hors du lot transactionnel ciblé.

## Ordre de provisionnement proposé

1. Réautoriser/choisir la connexion **YOUMBIA Push SMS** et vérifier à nouveau que `list_organizations` et `list_projects` retournent respectivement `youmbia-push-qa` et exactement `wagvrytcguutgbjzhvak`; contrôler les métadonnées du projet, son état sain et l’absence de migrations/fonctions. Si le connecteur reste sur TESKA, arrêter.
2. Juste avant chaque action distante ultérieure, relire les métadonnées du projet et comparer son ref exact; vérifier aussi la cible `https://wagvrytcguutgbjzhvak.supabase.co`. Aucun fallback vers PROD, YOUMGO, anivia ou autre projet.
3. Après autorisation de migration distincte, appliquer les entrées 1–77 du JSON dans cet ordre depuis la source épinglée, sans seeds ni données métier. Préserver la correction enum indiquée, le filtre `shops active`, les restrictions des tables auth Web et les trois migrations push sans duplication.
4. Exécuter le garde QA réseau après les migrations scheduler puis à la fin; vérifier cron inactif, Vault vide et `pg_net` vide. Conserver les flags push `false`.
5. Déployer seulement le dispatcher transactionnel QA avec worker OFF et secret propre à QA; ne pas fournir de token Expo réel, ne pas appeler l’API Expo, et ne pas déployer l’adaptateur/mock E2E. Le legacy message sender reste bloqué jusqu’à un garde fail-closed QA.
6. Une fois les accès et la méthode de déploiement journalisée établis, faire un préflight final sur les grants/RLS/extensions/cron/Vault/pg_net du projet QA; obtenir un GO distinct avant toute écriture distante.

## Verdict

**NO-GO — préparation locale terminée, accès par la connexion QA non vérifiable dans cette session.** Action minimale : rendre disponible la connexion Supabase **YOUMBIA Push SMS** au connecteur de cette session, puis confirmer le ref QA par ses seules opérations en lecture. Aucune migration, fonction, secret ou donnée synthétique n’a été écrit à distance.
