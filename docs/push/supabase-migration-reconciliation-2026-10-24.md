# YOUMBIA — réconciliation des migrations Supabase

> **Mise à jour du 24 octobre :** cette note conserve les faits de réconciliation historique. Son ancien verdict NO-GO était antérieur à l’E2E sur baseline complète. Le statut actuel, les décisions de policy et les écarts qualifiés figurent dans [le rapport final baseline/E2E](./supabase-final-baseline-e2e-2026-10-24.md).

Audit en lecture seule de Supabase PROD le 24 octobre 2026. Le dépôt de travail est `feat/ymb-transactional-push-p0-p1`, HEAD initial `14731d40e20f02aa5042d911413ada02b50ca3f9`. Le dépôt Web de référence est `tommykamga/youmbia@c0de54189ad9cb6a6968e186e387731a4a759f7d`. Aucun SQL n’a été exécuté sur PROD; aucune donnée métier ou clé n’a été lue. L’instance de validation locale est `youmbia-push-reconcile-20261024`, PostgreSQL 17 sur `127.0.0.1:56422`.

## Inventaires et correspondances

Les trois inventaires, les SHA-256 Git exacts, l’ordre des fichiers, les objets DDL repérés, les références qualifiées, le registre distant et les limites de l’extraction sont dans [la matrice JSON exhaustive](supabase-migration-reconciliation-2026-10-24.json). Les objets DDL et dépendances des fichiers sont des candidats extraits lexicalement; le SQL dynamique, les effets de données et les références construites à l’exécution demandent une revue du contenu.

L’inventaire de catalogue distant couvre `public` et `private` (ainsi que `push_private` si présent), sans colonnes ni lignes Auth/Storage et sans lignes métier : 27 tables, 233 colonnes, 105 contraintes, 107 indexes, 17 triggers, 58 policies, 89 fonctions et 2 types enum. Les définitions de fonctions sont représentées par signature, ACL et empreinte du corps; aucun corps ni secret n’est exporté. Pour chaque objet DDL détecté dans un fichier Web/Mobile, la matrice indique sa présence actuelle par nom; cette présence ne prouve pas son historique d’application.

| Source | Entrées | Résultat de comparaison |
|---|---:|---|
| Web épinglé | 39 migrations | Le manifeste E2E précédent n’en retenait que 13; 26 étaient omises. Deux scripts Web personnalisés d’administration/suppression sont exclus du rejeu QA. |
| Mobile, HEAD de branche | 33 migrations | 25 versions correspondent exactement au registre PROD. |
| Registre PROD | 29 migrations | Les entrées ne contiennent ni SQL appliqué ni hash de contenu. |

Les huit versions mobiles sans correspondance exacte se répartissent ainsi : trois migrations au même nom fonctionnel avec un timestamp différent, deux migrations mobiles historiques et trois nouvelles migrations push/sécurité. Le registre PROD a en plus l’entrée `20261019093404_mobile_marketing_consent_prompt` sans fichier à cette version dans le HEAD mobile.

| Divergence | Preuve disponible | Qualification |
|---|---|---|
| `seller_stats_v1`: PROD `20260909143052`, mobile `20260909130000` | Le MD5 de `pg_get_functiondef(public.get_my_seller_stats())` est identique en PROD et sur le candidat local (`9a3af18c5e3008cabb6c8f44aa416fd5`). | Définition active identique; hash du SQL historique et raison du renumérotage non récupérables. |
| `lifecycle_service_vs_marketing`: PROD `20261017213553`, mobile `20261017220000` | Les empreintes des fonctions de service/marketing et de revalidation vérifiées sont identiques en PROD et local. Voir la matrice pour les hashes individuels. | Équivalence des définitions actives vérifiée; identité du fichier exécuté non prouvée. |
| `lifecycle_draft_reminders_prep`: PROD `20261018130008`, mobile `20261018010000` | Les empreintes de `lifecycle_draft_reminders_as_service_enabled()` et `acknowledge_lifecycle_draft_reminders_notice()` sont identiques en PROD et local. | Équivalence des définitions actives vérifiée; le registre ne permet pas de certifier le SQL exécuté. |
| `mobile_marketing_consent_prompt` | Le fichier du commit adjacent `f39fbf4765352c7ce279e543ac814bff7fd60b2f` est conservé sous `supabase/tests/e2e/provenance/` avec son SHA-256. Le MD5 de la fonction courante `lifecycle_has_verifiable_marketing_consent(uuid)` correspond exactement à PROD (`a657b0fa6cce07cd80ac997643905203`). | Effet et source de code retrouvés; version de cette source (`20261019000100`) différente du registre PROD (`20261019093404`). Aucun hash de la migration appliquée n’est disponible. |
| `claim_my_push_token` `20261003230000` | Le registre PROD ne contient pas cette version, mais la fonction est présente et son MD5 est identique au fichier mobile (`ea12b21833e75227f26d0f2e90cbfe7d`). | Effet courant présent sans provenance dans le registre; ne pas déduire son mode d’application. |
| `shops_public_active_only` `20261021000100` | Le fichier mobile impose `status = 'active'`; la policy PROD `shops_select_public` a `USING (true)`. | Présent uniquement dans Git et appliqué au candidat QA; changement fonctionnel non déployé en PROD. Décision explicite requise pour QA. |
| Trois migrations push `20261023200527`, `20261023202544`, `20261023205854` | Absentes du registre et des tables push PROD. | Absence attendue; lot local non déployé. |

La similarité des versions et les définitions actives identiques ne prouvent jamais quelles migrations ont été exécutées. Le registre ne conserve pas leur SQL ni leur hash. Le manifeste JSON distingue cette preuve de schéma de la provenance historique.

## Baseline candidate et corrections démontrées

Le runner versionné [reconcile_baseline.py](../../supabase/tests/e2e/reconcile_baseline.py) construit une baseline source Web complète dans une base fraîche PostgreSQL 17, sans charger de seed ni écrire de ligne dans le journal Supabase. Il exige le HEAD Web épinglé et un URL PostgreSQL loopback; il refuse toute cible distante. Il applique les snapshots Web, les 37 migrations non personnelles, les compléments de métadonnées relevés en lecture seule, les 33 migrations mobiles et la source marketing provenant du commit adjacent.

Deux dépendances absentes ont été qualifiées et corrigées dans le complément local, sans modification du dépôt Web ni de PROD :

- `profiles.avatar_url` était appelé par le trigger `handle_new_user()` mais absent du snapshot Web; PROD a aussi `bio`, `shop_slug` et `avatar_updated_at`.
- PROD a les colonnes `listings.boosted`, `urgent` et `district`, également absentes des deux historiques versionnés.

Le complément utilise les types, nullabilité et defaults lus dans le catalogue de PROD. Il ne copie aucune valeur de colonne ni aucune ligne réelle. Le rejeu complet a aussi démontré qu’une migration Web échoue sur `reports.status`: les branches `CASE` renvoient du texte alors que la migration antérieure a déjà converti la colonne en enum `public.report_status`. Le runner vérifie le SHA-256 source attendu et applique uniquement à la copie locale des casts vers cet enum. Le SQL Web source reste inchangé.

Après ce complément, les colonnes fonctionnelles principales sont disponibles. La structure n’est toutefois pas identique à PROD : le candidat conserve les tables `auth_flow_tokens`, `listing_drafts`, `user_credentials`, les colonnes `categories.deprecated`, `reports.reviewed_at` et `reports.reviewed_by`, issues des sources; PROD possède une table de sauvegarde `email_preferences_backup_2026_10_18` qui n’est pas copiée. La policy des boutiques diffère également à cause de la migration de branche. Aucune table ou colonne n’a été supprimée pour faire passer une comparaison. Ces écarts interdisent d’appeler le candidat un snapshot structurel équivalent.

Le lint SQL remonte deux diagnostics historiques : `create_system_report_for_listing` déclare cinq colonnes mais ne fournit que quatre expressions; son empreinte de définition en PROD et locale est identique (`1bfd2572ffe30b6373800cf37ee09733`) et l’erreur a été reproduite uniquement sur une annonce fictive puis annulée. Le deuxième diagnostic statique porte sur `delete_my_account` et `public.listing_reports`; son `to_regclass()` conditionnel fonctionne au runtime sur un compte fictif, avec rollback, bien que le lint signale cette référence dynamique.

## Validation locale

Rejeu reproductible exécuté sur `youmbia-push-reconcile-20261024` : les snapshots Web, 37 migrations Web (deux scripts personnels exclus), compléments de colonnes et de privilèges, 33 migrations mobiles et la migration marketing sourcée ont réussi. Le runner n’a créé aucun journal de migrations. Aucun seed métier n’a été chargé; les tests SQL ont utilisé des utilisateurs, annonces, messages, favoris et tokens synthétiques en `.invalid`.

| Contrôle | Résultat |
|---|---|
| Tests transactionnels outbox/favoris/tokens | PASS : flags OFF par défaut, participants uniquement, anti-doublon, fan-out multi-appareil, opt-out, cooldown, erreurs, invalidation versionnée, RLS et privilèges. |
| Concurrence PostgreSQL | PASS : première prise de contact unique, deux workers `SKIP LOCKED` sans livraison en double. |
| RLS et privilèges natifs | PASS : lecture participant, tiers masqué, identité immuable, refus `anon` et appels serveur refusés aux clients. |
| RPC historique de suppression | PASS au runtime avec compte fictif; rollback complet. |
| TypeScript | PASS (`npm run typecheck`). |
| Vitest | PASS : 71 fichiers, 525 tests. |
| ESLint | PASS sans erreur; deux avertissements préexistants dans `send-lifecycle-template-previews.mjs` et `avatarImageUrl.ts`. |
| Lint Supabase SQL | FAIL sur les deux diagnostics historiques détaillés ci-dessus. |
| E2E Auth/PostgREST/Edge avec Expo simulé sur cette baseline complète | NON EXÉCUTÉ. |
| Build Android/iOS, migration distante, notification réelle | NON EXÉCUTÉS. |

Le contrôle du clone local indique 33 tables publiques, RLS activée sur toutes, les flags `messages_enabled` et `favorites_enabled` à `false`, et aucun schéma de journal de migration créé par le runner.

## Écarts résiduels et décision

Avant de créer le projet QA ou d’utiliser ce candidat pour un GO build, le responsable backend doit :

1. Retrouver la provenance des trois versions PROD renumérotées ou valider formellement les fingerprints des définitions actives comme seule preuve de compatibilité; le registre seul ne suffira pas à certifier l’historique.
2. Décider si les trois tables et colonnes supplémentaires issues des sources Web doivent faire partie du QA, et pourquoi la sauvegarde PROD `email_preferences_backup_2026_10_18` est exclue.
3. Confirmer si QA doit appliquer la policy mobile `shops_select_public` filtrée sur `active`, absente de PROD.
4. Corriger ou accepter explicitement l’erreur runtime historique de `create_system_report_for_listing` avant de prétendre à la non-régression de tous les parcours Web.
5. Faire exécuter l’E2E Auth/PostgREST/Edge avec transport Expo simulé sur la baseline complète une fois les choix précédents validés.

Les trois migrations transactionnelles push se rejouent localement et leurs tests SQL/RLS/concurrence passent. La création d’un projet Supabase QA n’est pas encore justifiée par une équivalence structurelle complète.

**VERDICT : NO-GO** pour le provisionnement QA distant et le GO build, jusqu’à résolution des écarts de schéma et de policy ci-dessus. La baseline complète est reproductible localement et utile à la revue, mais elle n’est pas certifiée équivalente à l’état courant de PROD.
