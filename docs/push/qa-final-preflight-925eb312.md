# YOUMBIA Push QA — préflight final au commit 925eb312

> Mise à jour après qualification du runner : les constats d'accès distant ci-dessous restent historiques pour cette session. Le runner local et ses tests sont décrits dans [qa-runner-qualification-925eb312.md](./qa-runner-qualification-925eb312.md), qui remplace le constat antérieur indiquant qu'aucun exécuteur spécifique n'était disponible. Aucune écriture distante n'a été effectuée.

Préflight local en lecture seule distante, effectué le 24 octobre 2026. Référence : branche `feat/ymb-transactional-push-p0-p1`, HEAD `925eb312ad46b40e6ee541bdabb03f92052087cd`. La cible déclarée est `YOUMBIA-PUSH-QA` / `youmbia-push-qa`, ref `wagvrytcguutgbjzhvak`, région `eu-west-1`; la production `ainzxommczlyjhymuwgu` reste exclue du manifeste et non inscriptible.

## Résultat du préflight

| Contrôle | Résultat | Preuve |
|---|---|---|
| Branche et HEAD | PASS | `git branch --show-current` = `feat/ymb-transactional-push-p0-p1`; `git rev-parse HEAD` = SHA attendu. |
| Worktree de référence | PASS | Aucun changement suivi; seuls les rapports locaux de préflight sont non suivis. Le checkout principal de l'espace de travail est une autre branche et n'a pas été utilisé. |
| Connexion Supabase nommée | BLOQUÉ | Cette session ne présente pas de sélecteur `YOUMBIA Push SMS`. Conformément à la consigne, aucune nouvelle tentative via TESKA SAS n'a été faite. L'identité QA n'a donc pas été interrogée depuis cette session. |
| CLI Supabase | PARTIEL | Le binaire est installé, mais même `supabase --help` échoue avant affichage car il tente d'écrire `~/.supabase/telemetry.json`, hors des chemins autorisés. Aucun login, link ou appel réseau CLI n'a été tenté. |
| État distant et journal initial | NON VÉRIFIÉ ICI | L'état `ACTIVE_HEALTHY`, le journal vide et l'absence de fonctions restent les preuves du contrôle indépendant fourni par l'utilisateur. Aucun accès distant n'a été tenté dans cette mission. |
| Production | PASS, aucune action | Aucun outil ou secret PROD n'a été utilisé; aucun changement distant n'a eu lieu. |

## Manifeste

Le manifeste [qa-deployment-manifest-925eb312.json](./qa-deployment-manifest-925eb312.json) contient 77 entrées ordonnées. Les contrôles locaux ont confirmé : séquence 1–77 sans trou, chemins tous distincts, 33 versions de migrations mobiles distinctes, et exactement une occurrence de chacune des trois migrations Push aux positions 73–75. Les 77 empreintes concordent avec l'artefact de qualification `/private/tmp/ymb-final-baseline-hashes-77.json`; pour la migration récupérée de consentement, la source historique a un libellé de provenance différent, mais le SHA-256 est identique.

Parmi les octets sources présents dans les deux checkouts locaux, 76/77 correspondent directement au hash du manifeste. L'entrée 35 est l'exception attendue : le checkout Web temporaire contient la copie corrigée pour le cast vers `public.report_status` (SHA `049154a4…`), tandis que le manifeste conserve le SHA de la source Web originale épinglée (`f6598546…`) et la correction déterministe déjà qualifiée. Le checkout Web n'a pas de métadonnées Git; le hash original n'a pas été recalculé depuis son objet Git dans cette mission. Les 76 autres fichiers disponibles sont exacts, dont les 33 migrations mobiles et les deux compléments SQL QA.

Les groupes sont : fondation Web schema/RLS (2), migrations Web retenues (37), compléments observés (2), migrations mobiles (33), consentement Web récupéré (1), désactivation/règles réseau QA (1) et grants minimaux `shops` QA (1). Les trois migrations Push sont déjà dans le groupe mobile; elles ne doivent pas être rejouées une seconde fois. Les fichiers historiques conservent leurs noms et leurs octets source. Ne pas convertir les 77 entrées en faux fichiers de migration horodatés.

## Dépendances et barrières vérifiées localement

- La migration `shops` conserve le filtre public `status = 'active'`; la migration/grants QA n'ajoutent pas DELETE, TRUNCATE, REFERENCES ou TRIGGER aux rôles clients. Les preuves de policy et d'accès propriétaire/tiers restent celles du rapport de qualification.
- Les grants/RLS de `user_credentials` et `auth_flow_tokens` restent inchangés depuis le commit qualifié. Le delta depuis `24bd50dc251c0ad56943c10d4b6a22d578b96ed` ne change pas migrations, fonctions Edge ni `supabase/config.toml`.
- `transactional_push_config.messages_enabled` et `favorites_enabled` ont un défaut SQL `false`; le worker `TRANSACTIONAL_PUSH_WORKER_ENABLED` doit être `false` et `EXPO_ACCESS_TOKEN` absent.
- `send-message-push` contient encore un POST direct à `https://exp.host/--/api/v2/push/send` lorsque le flag outbox est faux. Le contrôle qui le rend inoffensif en QA est de **ne pas déployer cette fonction et de ne jamais l'invoquer**. La combinaison flag OFF + fonction historique déployée n'est pas sûre.
- `dispatch-transactional-push` contient des appels Expo lorsque le worker est activé. Même déployé ultérieurement, le laisser OFF et ne pas définir de secret/token Expo. L'Edge Runtime n'est pas soumis à un pare-feu sortant global par le SQL.
- Exclure `dispatch-saved-search-alerts` de ce déploiement. Les migrations créent des tâches cron, mais les fonctions d'envoi vérifient leurs secrets Vault et retournent avant `pg_net` si ceux-ci sont absents. Garder Vault vide pendant toute l'application; ensuite désactiver tous les jobs et exécuter le garde `qa-network-safety.sql`, qui échoue si un job reste actif ou si Vault/pg_net ne sont pas vides.
- Ne créer aucun token Expo, compte réel ou secret. Les jeux de données de la recette doivent être synthétiques.

## Ordre d'application préparé — aucune étape exécutée à distance

1. Utiliser une identité CLI explicitement autorisée pour YOUMBIA QA. Vérifier par lecture que le ref retourné est exactement `wagvrytcguutgbjzhvak`, que l'URL hôte est `wagvrytcguutgbjzhvak.supabase.co`, l'organisation `youmbia-push-qa`, le projet sain et le schéma/journal applicatif vides. Refuser le moindre autre ref; ne pas utiliser le lien ou les identifiants TESKA.
2. Recalculer le manifeste depuis les deux sources épinglées et les artefacts QA. Exiger 77 hashes vérifiés, y compris la source originale de l'entrée 35 et son correctif explicite. Contrôler à nouveau le schéma et le journal juste avant la première application.
3. Appliquer les positions 1–75 dans l'ordre du JSON, une seule entrée à la fois, sans seed ni données métier. Avant et après chaque entrée, vérifier un journal d'exécution QA dédié indexé par ordre, source et SHA-256. Un SHA différent, une entrée déjà commencée sans statut réussi, une divergence de schéma ou toute erreur arrête le lot; ne pas reprendre automatiquement une entrée à état indéterminé.
4. Exécuter l'entrée 76 (`qa-network-safety.sql`) immédiatement après les migrations qui installent les cron. Vérifier zéro job actif, Vault vide et files/réponses `pg_net` vides; puis exécuter l'entrée 77 (ACL `shops`) et revérifier grants/RLS et flags OFF.
5. Pour un déploiement Edge ultérieur autorisé, déployer uniquement `dispatch-transactional-push` avec worker OFF, secret propre à QA si l'endpoint doit être protégé; ne pas fournir `EXPO_ACCESS_TOKEN`. Ne pas déployer ni appeler `send-message-push` ou `dispatch-saved-search-alerts`. Une validation distante du transport doit rester simulée et sans URL Expo réelle.
6. Après chaque phase, journal expurgé ne contenant que ref QA, ordre, nom de source, hash, statut, temps et erreur normalisée. Ne jamais journaliser URL de connexion complète, mot de passe, PAT, clés Supabase ou secrets.

La commande standard `supabase db push` ne convient pas à ce manifeste : la configuration du dépôt a `db.migrations.enabled = false`, les migrations Web historiques ne suivent pas toutes le format de version horodatée requis par la CLI, et `db push` applique les migrations locales enregistrées dans `supabase_migrations.schema_migrations`. Renommer ces sources pour les faire accepter changerait la traçabilité demandée. La CLI officielle documente aussi que `db push` suit les versions locales et les marque dans son journal; il ne constitue donc pas un exécuteur transparent du manifeste qualifié ([référence CLI `db push`](https://supabase.com/docs/reference/cli/supabase-db-push), [création et format d'une migration](https://supabase.com/docs/reference/cli/supabase-migration-new)). Aucun exécuteur distant spécifique n'a été créé ni testé dans cette session; il faut le fournir et tester ses contrôles fail-closed avant le GO d'application.

## Contrôles exécutés et verdict

Exécutés : assertions structurelles/hash du manifeste contre l'artefact de qualification; vérification des hashes locaux disponibles; lecture ciblée des migrations Push, de `shops`, des grants QA, du garde cron/Vault/pg_net et des trois fonctions Edge; validation JSON et `git diff --check`. Aucun test historique Vitest/E2E, lint, TypeScript ou SQL n'a été relancé; aucune écriture distante, migration, fonction, secret, compte ou notification n'a été créée.

**NO-GO** — la cible ne peut pas être authentifiée/relue dans cette session par la connexion dédiée, la CLI ne s'exécute pas dans le sandbox actuel, et l'exécuteur qui journalise/contrôle chaque étape n'est pas implémenté ni testé. Le prochain prérequis minimal est de rendre disponible une session CLI autorisée QA isolée, puis de livrer et valider localement le runner fail-closed sur le manifeste complet avant toute migration distante. Aucun recours à TESKA n'est requis ni autorisé.
