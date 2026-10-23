# YOUMBIA Push P0/P1 — préflight de recette physique

Date : 23 octobre 2026

Branche : `feat/ymb-transactional-push-p0-p1`

Référence contrôlée : `76f0f70b663a9453c095ea7a1c982e5246ce4f5c`

## Verdict

**NO-GO — recette physique non exécutée.** L'isolation Supabase n'est pas démontrée par la configuration EAS actuelle et aucun appareil de recette n'est disponible. Aucun build, enregistrement de token ou push n'a été lancé.

## Contrôles exécutés

- Branche et HEAD conformes à la demande ; working tree initial propre. La release `codex/release-4.6.2` reste préservée.
- Rapport de l'E2E Supabase isolé lu : [supabase-isolated-e2e.md](./supabase-isolated-e2e.md). Ce rapport qualifie la baseline Web comme représentative, pas comme export complet certifié de la production.
- Session EAS et métadonnées du projet accessibles en lecture seule. Les valeurs des variables et les credentials n'ont pas été affichés.
- Le projet EAS est `2869afc2-e13f-48b5-8e78-acbe5186934c`. Les variables `SUPABASE_URL` des environnements EAS `development` et `preview` pointent toutes deux vers le projet Supabase de production `ainzxommczlyjhymuwgu`. **Ne pas lancer de build ou d'envoi avec ces environnements pour une recette.**
- Le profil `development` génère les identifiants d'application `.dev`, mais n'a pas de variable EAS `GOOGLE_SERVICES_JSON`; `app.config.js` refuse donc un build Android EAS sans ce fichier. Le profil `preview` possède un fichier Google Services, mais utilise les identifiants d'application de production et la même URL Supabase de production.
- `expo-notifications` et Expo Router figurent dans la configuration gérée. Cela ne prouve ni les credentials APNs/FCM, ni les capabilities signées, ni la réception native.
- Aucun appareil Android n'est présent dans ADB. Un iPhone 16 Pro Max est connu de `devicectl` mais marqué indisponible. Aucun appareil physique n'est accessible pour la recette.
- Dix builds EAS existants ont été consultés sans lancer de build. Les builds récents sont des builds de profil production sur le commit de release `b5e2196`; aucun artefact du commit `76f0f70` n'a été installé ou testé.
- L'instance Supabase E2E précédente écoute uniquement sur localhost et a été arrêtée. Aucun projet Supabase de recette accessible aux téléphones n'a été identifié.

## Matrice physique

| Contrôle | Android | iOS | Preuve |
|---|---|---|---|
| Build isolé | NON EXÉCUTÉ | NON EXÉCUTÉ | Aucun backend EAS isolé ; Android Development sans Google Services |
| Token enregistré | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil ; aucune écriture de token |
| Nouveau message | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'environnement et de compte de recette accessibles |
| Premier contact | NON EXÉCUTÉ | NON EXÉCUTÉ | Même blocage |
| Favoris | NON EXÉCUTÉ | NON EXÉCUTÉ | Même blocage |
| Foreground | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil |
| Background | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil |
| Application fermée | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil |
| Navigation au tap | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil |
| Anti-doublons natifs | NON EXÉCUTÉ | NON EXÉCUTÉ | Simulation uniquement dans l'E2E précédent |
| Logout | NON EXÉCUTÉ | NON EXÉCUTÉ | Pas d'appareil ; le risque hors ligne reste décrit dans le rapport E2E |
| Ticket / receipt Expo | NON EXÉCUTÉ | NON EXÉCUTÉ | Aucune requête à Expo ; seuls des receipts simulés existent |

## Conditions de reprise

1. Fournir un projet Supabase de recette distinct, accessible depuis les téléphones, avec fonctions et migrations vérifiées. Ne pas ouvrir publiquement l'instance locale existante.
2. Configurer les environnements EAS `development` avec l'URL et la clé anon de ce projet seulement. Vérifier par identifiant de projet que l'URL ne vise pas la production avant toute construction.
3. Configurer un projet Firebase de test et son fichier Google Services pour Android Development. Vérifier les credentials APNs et le provisioning pour le bundle `.dev` iOS sans imprimer ni exporter les secrets.
4. Rendre disponibles un appareil Android et un iPhone dédiés, vérifier leur état connecté, et confirmer les comptes fictifs destinataires. N'enregistrer que les tokens de ces appareils dans le projet Supabase de recette.
5. Construire et installer les profils Development isolés, puis exécuter les scénarios foreground, background, fermeture normale, navigation chaude/froide, favoris, préférences, fanout, logout connecté/hors ligne et reconnexion.
6. Pour chaque essai, consigner horodatage, commit/build, IDs événement/outbox, appareil pseudonymisé, ticket/receipt, rendu et destination du tap. Ne jamais consigner le token complet ni le contenu privé.

La révocation hors ligne ne peut être immédiate si l'appareil ne peut contacter le serveur. Garder cette réserve dans le verdict et valider la réassociation atomique après reconnexion.
