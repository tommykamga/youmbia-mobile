# YOUMBIA — baseline Supabase complète et qualification Push E2E

**Référence testée :** `feat/ymb-transactional-push-p0-p1` à `f0e4cd18f56dbb24cd93f1c7a133d81ef8f41c14`, avec les corrections locales décrites ici. Source Web épinglée : `c0de54189ad9cb6a6968e186e387731a4a759f7d`.

## Décision

**VERDICT : GO QA AVEC RÉSERVES** pour provisionner un projet QA distinct, après validation humaine de la policy boutiques et du périmètre des tables Web additionnelles. Le lot push est fonctionnel et sécurisé sur la baseline complète locale. La preuve ne certifie pas l’identité historique du SQL appliqué en production et ne justifie aucune écriture ou migration distante. Aucun projet cloud, build, credential distant ou envoi réel n’a été créé ou modifié.

## Résultats

| Contrôle | Résultat | Preuve |
|---|---|---|
| Policy `shops` | PASS; changement QA volontairement plus strict que PROD, 12 assertions HTTP positives/négatives | Catalogue PROD lu en lecture seule; [shops-policy.py](../../supabase/tests/e2e/shops-policy.py); `shops_select_public` locale = active seulement |
| Sept colonnes observées | PASS; types, nullabilité et defaults vérifiés sur le catalogue PROD, complément QA rejoué | `observed-columns.sql`; manifeste source final, 76 entrées |
| Cast enum Web | PASS en replay local; deux CASE reçoivent un cast explicite vers `public.report_status`, sans modifier le dépôt Web | Source épinglée et hash contrôlé dans [reconcile_baseline.py](../../supabase/tests/e2e/reconcile_baseline.py) |
| Baseline reproductible | PASS; schéma/RLS Web + 37 migrations Web non personnelles + compléments + 33 migrations Mobile + migration consentement sourcée + neutralisation réseau + ACL QA boutiques | `/private/tmp/ymb-final-baseline-hashes-77.json`; 77 fichiers/corrections, aucun journal Supabase ni jeu de données importé |
| Différences structurelles | PASS avec écarts classés ci-dessous; aucune suppression pour forcer l’égalité | Inventaire PROD JSON du 24/10 et SQL source épinglés |
| RLS et sécurité | PASS; vrais JWT distincts, refus tiers/spoofing, identité immuable, ACL natives, tables de credentials non exposées | `backend.py`, `native-security.py`, `shops-policy.py` |
| E2E Auth/PostgREST/Edge | PASS; 44 assertions HTTP sur GoTrue, PostgREST, Edge Runtime 1.74.2 (Deno compatible 2.1.4) et mock Expo local | [backend.py](../../supabase/tests/e2e/backend.py), simulateur Node local; aucune requête Expo réelle |
| P0 messages | PASS; premier contact, messages suivants, réponse, fan-out, bon destinataire, ouverture conversation, contenu privé absent, aucun doublon | 44 assertions E2E |
| P1 favoris | PASS; ajout/retrait/réajout, auto-favori, annonce inactive, préférences et cooldown | 44 assertions E2E |
| Concurrence / idempotence | PASS; conversation unique, un seul premier contact, claims Edge sans doublon | E2E concurrent PostgREST et deux workers |
| SQL / RLS natifs | PASS; SQL push rollback-only, vrais rôles, `auth.uid()`, ACL, extensions, RLS de toutes les tables publiques | [transactional-sql.py](../../supabase/tests/e2e/transactional-sql.py), [native-security.sql](../../supabase/tests/e2e/native-security.sql) |
| Vitest | PASS — 71 fichiers, 525 tests | `npm run test` |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS, 0 erreur; 2 avertissements préexistants hors périmètre | `npm run lint` |
| Deno statique | Non lancé comme commande standalone (binaire absent de l’hôte); compilation/runtime Edge exercés par les appels E2E | Edge Runtime 1.74.2, compatible Deno 2.1.4 |
| Lint SQL `push_private` | PASS | `supabase db lint --local --schema push_private --fail-on error` |
| Lint SQL global | FAIL sur deux défauts historiques documentés ci-dessous | `supabase db lint --local --fail-on error` |
| Production inchangée | PASS; lecture de catalogue et policy/ACL uniquement | Aucun SQL de mutation, migration distante ou appel de fonction PROD |

## Écarts résolus pour QA

### Policy des boutiques

Le catalogue PROD attribue la table à `postgres`. Ses policies observées sont : `shops_select_public` pour `PUBLIC`, `USING (true)`; SELECT propriétaire pour `authenticated`, `owner_id = auth.uid()`; INSERT propriétaire par `WITH CHECK (owner_id = auth.uid())`; UPDATE propriétaire avec `USING` et `WITH CHECK` identiques; aucune policy DELETE. Les grants de table PROD sont très larges pour `anon`, `authenticated` et `service_role`, mais les writes client restent filtrés par RLS.

La branche contient déjà `shops_public_active_only`. Je la retiens pour QA : public et comptes authentifiés non propriétaires voient uniquement les boutiques `active`; le propriétaire garde la lecture de ses propres boutiques `hidden`/`suspended`. Le déclencheur `enforce_shop_status_rules` appelle `is_admin()` et réserve suspension/réactivation aux administrateurs; `set_shops_updated_at` ne fait que dater la modification. Les deux fonctions de déclencheur ne sont pas `SECURITY DEFINER`. La seule fonction applicative observée qui référence `shops` est `delete_my_account`, qui supprime les ressources du compte; aucune fonction ou trigger boutique n’envoie de push. Le E2E confirme qu’un propriétaire PRO voit ses trois statuts, qu’un autre compte ne peut ni créer sous son identité, ni modifier/transférer/supprimer sa boutique, et qu’aucun changement boutique ne crée d’événement push.

Le replay local échouait d’abord par `42501` sur INSERT : l’ancien complément de grants n’incluait pas la table créée par les migrations Mobile. `qa-shops-grants.sql` corrige ce défaut pour QA avec SELECT public et INSERT/UPDATE authentifiés, sans DELETE/TRUNCATE/REFERENCES/TRIGGER client. Le même comportement effectif RLS est préservé avec des privilèges explicites minimaux. La différence de visibilité `true` → `status='active'` est une décision de sécurité et de produit propre à la branche; elle doit être acceptée pour QA, et ne prétend pas représenter la policy PROD.

### Colonnes et cast

Les sept colonnes ont été vérifiées dans le catalogue PROD en lecture seule :

| Colonne | Type | Nullable | Défaut | Usage observé |
|---|---|---:|---|---|
| `profiles.avatar_url` | `text` | oui | aucun | avatar de profil, vendeur et participant conversation |
| `profiles.bio` | `text` | oui | aucun | présentation vendeur |
| `profiles.shop_slug` | `text` | oui | aucun | URL publique de boutique |
| `profiles.avatar_updated_at` | `timestamptz` | oui | aucun | invalidation/cache-bust des avatars |
| `listings.boosted` | `boolean` | oui | `false` | tri et présentation des annonces |
| `listings.urgent` | `boolean` | oui | `false` | badge annonce |
| `listings.district` | `text` | oui | aucun | localisation de l’annonce |

Aucune migration d’origine de ces colonnes n’existe dans les deux historiques épinglés. Le complément versionné QA recrée exactement leurs métadonnées sans données. Elles servent des parcours Web/Mobile réels; leur absence casserait les sélections et mises à jour de profil ou d’annonce.

Le replay brut de `2026_04_28_reports_status_align_open_reviewed_action_taken_dismissed.sql` échoue parce que les branches `CASE` produisent du `text` affecté à `report_status`, enum PostgreSQL, sans cast implicite. Le runner vérifie le SHA source (`f6598546…`) et l’unicité des deux motifs avant d’ajouter uniquement `::public.report_status` à la copie temporaire. Le rejeu complet depuis une DB vierge valide cette correction; le fichier Web versionné reste intact.

## Différences restantes et classement

| Écart | Classement | Effet QA |
|---|---|---|
| Trois timestamps Web/Mobile renumérotés; définitions de fonctions actuelles contrôlées identiques pour les routines disponibles | `HISTORICAL_UNVERIFIABLE` | Le registre PROD ne stocke pas le SQL/hash historique; ne bloque pas la baseline de sources ni les tests fonctionnels |
| Deux migrations mobiles historiques absentes du registre PROD; provenance de `claim_my_push_token` absente malgré définition active identique | `HISTORICAL_UNVERIFIABLE` | Aucun effet observé sur le comportement courant; provenance conservée comme limite |
| `shops_select_public` PROD `true` contre filtre `active` sur la branche | `ACCEPTABLE_ADDITIVE` (durcissement de sécurité, décision QA requise) | Behavior change testé; owner et notifications qualifiés |
| Tables Web uniquement `listing_drafts`, `auth_flow_tokens`, `user_credentials` | `UNRELATED_PREEXISTING` pour le push | `listing_drafts` a RLS par propriétaire; tables tokens/credentials n’ont aucune policy ni grant aux rôles client dans le replay QA. Aucun accès client testé; aucune donnée chargée |
| Colonnes Web uniquement `categories.deprecated`, `reports.reviewed_at`, `reports.reviewed_by` | `UNRELATED_PREEXISTING` pour le push | Aucune dépendance push; pas de suppression pour égaliser les schémas |
| Table PROD `email_preferences_backup_2026_10_18` | `UNRELATED_PREEXISTING`, exclue | Table de backup et ses données non copiées en QA |
| SQL Web `create_system_report_for_listing` : 5 colonnes, 4 valeurs | `UNRELATED_PREEXISTING` / dette fonctionnelle Web | Reproduit sur annonce synthétique : SQLSTATE `42601`, transaction sans report ni événement push. Même définition active observée en PROD; correctif à traiter séparément |
| Lint `delete_my_account` sur SQL dynamique `listing_reports` optionnelle | `UNRELATED_PREEXISTING` / diagnostic statique | Le runtime local passe avec la table absente; compte et annonce synthétiques supprimés; corps correspond au fingerprint précédemment observé en PROD |

La bascule du push ne touche pas les tables de credentials Web, les migrations de modération ni le backup. La seule fonction qui joint les boutiques au cycle de suppression de compte reste protégée par `auth.uid()` et supprime seulement le compte appelant. La révocation hors ligne demeure une limite déjà testée : sans requête serveur, le token peut rester associé jusqu’à reconnexion/réattribution; aucun push déjà accepté par un fournisseur ne peut être rappelé.

## Environnement et reproduction

Projet de test local `youmbia-push-e2e-local`, API `127.0.0.1:55421`, PostgreSQL `127.0.0.1:55422`, PostgreSQL 17. Le replay final a été produit par la procédure de [README E2E](../../supabase/tests/e2e/README.md). Manifeste local privé : `/private/tmp/ymb-final-baseline-hashes-77.json`. Les credentials et le secret synthétiques n’ont existé que le temps du test en fichiers mode 0600, puis ont été supprimés; aucun contenu de credential n’est dans Git ou ce rapport.

Le replay crée trois tâches cron héritées des migrations Web. `qa-network-safety.sql` les désactive via `cron.alter_job`, puis échoue si une tâche reste active, si Vault contient un secret ou si `pg_net` contient une requête ou réponse. Contrôle final local : trois jobs inactifs, Vault vide, file et réponses pg_net à zéro. Les deux jobs ayant eu un tick pendant un replay exploratoire précédent se sont terminés avec Vault vide; aucune requête pg_net n’a été créée. Le worker normal reste `false`; aucune destination privée n’est configurée. Le transport E2E n’accepte que la destination Expo attendue puis substitue le serveur Node local; ce simulateur n’a aucun client sortant. La recette physique Android/iOS, les builds et l’activation distante ne sont pas couverts.

Réserve historique : le registre de migrations ne permet pas d’attester quelles octets SQL ont été exécutés par le passé. La baseline QA décrit exactement les sources épinglées et les compléments qualifiés; toute divergence ultérieure devra repasser ce runner avant création du projet distant.
