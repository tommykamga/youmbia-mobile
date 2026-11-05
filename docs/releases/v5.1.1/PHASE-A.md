# YOUMBIA Mobile — V5.1.1 / PHASE A (sécurisation)
**Pilotage :** TOM-104 · **Base exacte :** `ed507db19e412923df2867e71350de650298f3b4` (5.1.0, iOS build 8, Android code 42) · **Branche isolée :** `fix/v5.1.1-stabilization`.
**État au 05/11/2026 :** audit distant initial, aucun correctif exécuté ; QA physique obligatoire sur iPhone et Android. Ce fichier est le contrat court commun pour Codex (audit/critique/QA) et Cursor (correctifs). Référentiel backlog complet : https://linear.app/tsk-io/issue/TOM-104/p0-youmbia-mobile-master-v511-correctifs-iosandroid-historique-v500

## Règles non négociables
1. **Phase A = P0 uniquement.** Aucun redesign carte/header, aucune optimisation générale ni bump de version ; ces chantiers relèvent des phases B/C. Un correctif à la fois, un commit isolé et tests précis.
2. Ne jamais écrire dans `main`, `release/*`, ni dans les branches actives 5.1.0. Ne pas déployer, ne pas publier EAS, ne pas migrer Supabase, ne pas supprimer de données ou secrets. Ne jamais lancer `git reset --hard`, `git clean -fd`, `npm audit fix --force`.
3. Avant tout : `pwd; git status --short --branch; git rev-parse HEAD; git worktree list`. **Si dirty, divergence inattendue ou source différente, STOP** et remonter un résumé sans effacer quoi que ce soit. Utiliser si possible un worktree dédié au repo mobile existant et suivre les instructions AGENTS.md applicables.
4. L'audit est fondé sur le SHA 5.1.0 ; ne pas confondre une capture iOS/Android prise dans un état ou appareil différent avec un bug causé par l'OS.
5. Coût tokens : ne pas relire tout le repo ni produire de longs logs. Ouvrir seulement les fichiers des P0 et les tests associés. Compte rendu final **≤ 15 lignes** : SHA, fichiers, racine du bug, tests, risques et actions utilisateur. Ne jamais coller un diff ou un log géant.

## P0-A1 — Clavier Android / composer couvert
**Symptôme :** le clavier Android couvre le champ de saisie et/ou le bouton d'envoi.
**Fichiers à inspecter en priorité :** `app/conversation/[id].tsx`, `src/features/conversation/ConversationComposer.tsx`, `src/components/KeyboardSafeView.tsx`, `src/hooks/useKeyboardInset.ts`, `app.json`, `src/features/conversation/ConversationHeader.tsx`.
**Preuve code initiale :** `app.json` déclare déjà `android.softwareKeyboardLayoutMode='resize'`. `KeyboardSafeView` utilise par défaut un `View` flex Android (pas de padding manuel) ; `ConversationScreen` rend `ConversationComposer` en bas de ce conteneur et utilise `keyboardInset` pour le padding de l'input. Examiner les interactions clavier/safe area/navigation/screen avant de corriger ; éviter le double décalage.
**Acceptation :** clavier affiché/fermé/réouvert, composer et bouton visibles ; barre système, navigation gestuelle/3 boutons, champs multiligne ; Android réel et non-régression iOS.

## P0-A2 — Conversations vides créées au simple « Contacter »
**Symptôme :** ouvrir « Envoyer un message » puis revenir sans envoyer laisse une conversation dans Messages.
**Fichiers :** `src/services/conversations/getOrCreateConversation.ts`, `src/services/conversations/getConversations.ts`, `src/features/messages/MessagesInboxScreen.tsx`, `src/services/conversations/getUnreadConversationsCount.ts`, `src/features/listings/ListingActions.tsx`, `app/conversation/[id].tsx`; rechercher les points d'appel réels.
**Preuve code initiale :** `getOrCreateConversation` fait `INSERT conversations` avant envoi ; `getConversations` ramène les conversations même si aucune ligne `messages` n'existe.
**Politique :** privilégier la **petite correction rétrocompatible** sans SQL : filtrer uniquement de la boîte de réception les discussions n'ayant jamais eu de message, sans effacer les conversations existantes ; étudier ensuite la création à l'envoi atomique comme évolution séparée seulement si elle reste dans un périmètre sûr et prouvé. Ne jamais masquer une conversation ayant déjà eu un message même si le dernier aperçu est vide ou inaccessible. Mettre au même régime compteurs et cache inbox, avec tests. Ne pas casser les appels existants de l'API.
**Acceptation :** contact puis retour = aucune nouvelle ligne ; premier message envoyé = conversation visible des deux côtés ; double clic, échec réseau, présence de conversations anciennes, conservation des messages.

## P0-A3 — Erreur serveur faussement interprétée comme boîte vide
**Fichiers :** `src/services/conversations/getConversations.ts`, `src/features/messages/MessagesInboxScreen.tsx`, tests.
**Preuve code initiale :** `fallbackEmptyList()` renvoie `{data:[],error:null}` sur erreurs requête et exception ; masquage d'erreur.
**Acceptation :** `0 conversation` réel affiche empty state ; défaillance RLS/Supabase/offline affiche erreur adaptée + `Réessayer`, sans inventer de messages et sans effacer un cache fiable. Distinction claire `unauthenticated`.

## Séquencement Codex / Cursor (une seule main sur le code)
- **Codex 1 (lecture seule)** : audit ciblé A1–A3, localise points d'appels, tests, sélectionne fix minimal, signale toute dépendance SQL/régression ; résultat ≤ 15 lignes.
- **Cursor 1** : implémente A1 uniquement, tests et commit `fix(v5.1.1): keep Android conversation composer visible`. STOP si QA physique indispensable à la suite.
- **Cursor 2** : implémente A2 + A3 en commits séparés, tests ciblés, aucun refactor gratuit. Prévenir si change contrats de service : réparer tous les consommateurs identifiés.
- **Codex 2 (lecture/revue)** : analyse diffs et risques, `npm run typecheck`, `npm run lint` (ou lint ciblé), `npm test -- --run` ou `npx vitest run <tests ciblés>`, vérifie aucune modification hors scope. **Ne pas marquer PASS sans avoir exécuté.**
- **QA humain** : Android réel (clavier) et iPhone réel (messagerie) + deux comptes acheteur/vendeur pour 1er envoi. Récolter captures et logs expurgés. Sans QA physique : **NO-GO merge**.

## Format de sortie minimal de chaque agent
`A1|A2|A3 — PASS/FAIL/INCONCLU ; branche ; SHA ; fichiers ; tests (n PASS) ; risque restant ; besoin utilisateur (une phrase).`

## Gate phase A
- `git diff --check`, types, lint, tests unitaires et cas régression P0 passés ;
- aucune nouvelle conversation dans inbox avant premier message, erreurs visibles, saisie Android accessible ;
- autorisation distincte pour merge main/production, migration, release 5.1.1 et EAS.
