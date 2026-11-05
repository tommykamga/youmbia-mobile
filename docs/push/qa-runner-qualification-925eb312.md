# Qualification du runner Supabase QA — YOUMBIA Push P0/P1

Date : 24 octobre 2026. Référence de code : `feat/ymb-transactional-push-p0-p1` à partir du commit mobile `925eb312ad46b40e6ee541bdabb03f92052087cd`. Cible codée en dur : `wagvrytcguutgbjzhvak` (`YOUMBIA-PUSH-QA`, organisation `youmbia-push-qa`, région `eu-west-1`). La production `ainzxommczlyjhymuwgu` est explicitement refusée.

## Résultat

Le runner est qualifié pour une future application contrôlée à la cible QA après autorisation distincte. Il n'a effectué aucune connexion Supabase, migration distante, modification de fonction, création de compte, notification, build EAS ou accès à la production. Le dry-run n'ouvre aucune connexion à la base.

## Contrôles

| Contrôle | Résultat | Preuve |
|---|---|---|
| Branche et HEAD de départ | PASS | Branche `feat/ymb-transactional-push-p0-p1`; HEAD `925eb312ad46b40e6ee541bdabb03f92052087cd`. |
| Manifeste | PASS | 77 entrées ordonnées, chemins uniques, 33 versions mobiles uniques, trois migrations Push aux rangs 73–75 une seule fois; SHA-256 du JSON `d8675dfd03f6dea2986c6c49f8574ec14741a533afcc8a7bdc4822d88f04bb7c`. |
| Provenance source | PASS | Les sources Web et Mobile sont lues dans leurs objets Git épinglés; les 77 SHA-256 sont comparés au manifeste. Entrée 35 : SHA source historique `f6598546…`; correction qualifiée des casts vers `public.report_status` faite en mémoire, avec empreinte appliquée distincte. |
| Dry-run final | PASS | `python3 scripts/qa/qa_migration_runner.py --dry-run --web-repo "$YOUMBIA_WEB_REPO"`; rapport JSONL local. 77 événements `planned_migration`, connexion DB `none`. |
| Target guard | PASS | Hôte DB, ref projet, nom, région et slug d'organisation sont constants. URLs PROD, autre projet, options TLS faibles, secrets absents et identité Management API/DB divergente sont rejetés par tests. |
| Journal/reprise | PASS | Journal `qa_runner` atomique et privé, verrou advisory, préfixe appliqué contigu, hashes provenance/source/appliqué, timestamps, empreintes de schéma avant/après. Le checkpoint propre reprend sans double application; un état `started`, `failed` ou divergent exige une réconciliation manuelle. |
| SQL | PASS | Une entrée à la fois, transaction PostgreSQL; une erreur intermédiaire annule les effets partiels de l'entrée. Commandes psql et SQL non transactionnel sont refusés. |
| Sorties réseau et push | PASS AVEC RÉSERVE | SQL refuse les appels `net.http_*` non approuvés; les deux seules sources connues sont allowlistées après contrôle statique du garde Vault et du retour anticipé. Avant chaque étape : Vault, files/réponses `pg_net`, flags push et tokens contrôlés; cron désactivés après chaque étape. Aucune fonction Edge n'est déployée par cet outil. |
| Tests locaux | PASS | 15 tests Python sur PostgreSQL 18.3 jetable via socket Unix temporaire, supprimé après le test; pas de connexion cloud. Scénarios : manifeste, dry-run, source absente/hash altéré, cible PROD/autre ref, identité de projet et DB, secret absent, réseau interdit, SQL non transactionnel, succès/rejeu, reprise propre, rollback, interruption après SQL, provenance altérée. Durée : 32,787 s. |
| Portée distante | NON EXÉCUTÉE | Les migrations et permissions du projet managé n'ont pas été testées dans cette qualification locale. Aucun accès Supabase n'était nécessaire ou tenté. |

## Barrières d'exécution

- `--dry-run` est le mode par défaut et ne construit aucun client DB.
- `--apply` requiert une URL dont l'hôte exact est `db.wagvrytcguutgbjzhvak.supabase.co`, `sslmode=verify-full`, un bundle CA, et un jeton Management API fourni par l'environnement; les secrets ne figurent ni dans les arguments ni dans les logs.
- Les opérations Management API sont des `GET` sur l'identité QA. Aucun alias TESKA ni identifiant PROD n'est résolu automatiquement.
- Les rapports ne contiennent que la ref, le rang, le chemin, les empreintes, l'état, les timestamps et la classe d'erreur. Le fichier est créé avec permissions `0600`.
- Le runner n'expose aucune commande de déploiement Edge, de seed, de push ou de modification PROD.

## Réserves avant application distante

1. Vérifier le projet sain et vide, le coût zéro, le slug d'organisation et l'accès QA avec le compte `YOUMBIA Push SMS` au moment de l'application. Cette session n'a pas relu l'état distant.
2. Fournir les credentials DB et CA propres au projet QA via le gestionnaire de secrets, puis utiliser une identité Management API explicitement autorisée pour cette opération. La connexion distante n'est pas incluse dans les tests locaux.
3. Le SQL de baseline n'a pas été rejoué contre l'émulation PostgreSQL : la suite d'intégration valide l'exécuteur, le journal, les transactions et les contrôles sur 77 migrations synthétiques; le dry-run valide les 77 sources réelles. Les extensions, privilèges gérés, cron, Vault et `pg_net` doivent donc être vérifiés sur le projet QA après autorisation d'application.
4. Un arrêt à état indéterminé bloque la reprise automatique. Cela évite le rejeu aveugle mais demande un diagnostic DBA.

Référence d'installation, commande autorisée et procédure de reprise : [qa-deployment-runner-925eb312.md](./qa-deployment-runner-925eb312.md).

**VERDICT : RUNNER READY AVEC RÉSERVES** — prêt pour un déploiement QA explicitement autorisé, après préflight de l'identité, de l'état vide et des credentials. Aucun déploiement distant n'a été effectué.
