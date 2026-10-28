# YOUMBIA Mobile — Consentement marketing & campagnes (P0)

## Règles non négociables
- Le booléen marketing_opt_in importé ne constitue **pas** une preuve.
- Opt-in volontaire, non précoché, à l'accueil pour les seuls utilisateurs connectés qui n'ont ni preuve d'accord ni désabonnement.
- "Pas maintenant" n'écrit aucune préférence et masque seulement pour la session applicative.
- Paramètres : le switch reflète une preuve valide, pas un booléen d'import.
- Action "Oui, j'accepte" : RPC authentifiée, source générique `authenticated_user_action` fixée côté serveur, version `2026-10-26.v1`, horodatage PostgreSQL et événement serveur. L'interface n'est pas utilisée comme preuve de provenance.
- Refus initial, révocation depuis Profil > Préférences, désinscription par lien et nouvel accord sont enregistrés séparément dans `marketing_consent_events`; aucun événement historique n'est inféré.
- `2026-10-26.v1` désigne le texte exact partagé entre inscription et invitation : « Je souhaite recevoir par e-mail des conseils, nouveautés et recommandations YOUMBIA. Ce choix est facultatif et révocable à tout moment, sans effet sur l’utilisation de mon compte. Les e-mails transactionnels (connexion, confirmation et sécurité) restent séparés. »
- Le déclencheur Auth ignore les métadonnées client et ne crée qu'une préférence marketing false. Une inscription avec confirmation email requise enregistre l'accord uniquement après connexion et nouvelle action dans Profil > Préférences ou via l'invitation d'accueil.
- Les consentements historiques `signup`/`settings` ne sont admissibles que si une preuve indépendante et intègre relie l'action explicite, le texte présenté, l'utilisateur et l'absence de révocation. L'ancien parcours utilisait des métadonnées Auth fournies par le client et des écritures directes avec horodatage client ; source/date seules ne satisfont donc pas ce critère. Aucun backfill ni requalification n'est fait. Les imports restent non vérifiés.
- Le relevé Production du 26/10/2026 comporte 339 préférences actives avec la source `migration_initiale_youmbia_2026_10_18`, cinq sources `mobile_home_prompt` et cinq préférences false sans source. Les 339 préférences sont conservées telles quelles et restent non vérifiées. Le propriétaire déclare des accords téléphoniques historiques, sans justificatif signé disponible. La migration prévoit un journal administratif de cohorte séparé : un administrateur pourra enregistrer son identité et l'heure de déclaration, avec le nombre courant calculé en base. Cette déclaration n'attribue ni date d'appel, ni signature, ni action à un utilisateur, et ne donne aucun accès à l'éligibilité des campagnes.
- Les préférences de refus ou de révocation ne sont jamais réactivées par une attestation de cohorte. Le relevé Production ne montre actuellement aucune ligne avec `unsubscribed_at`; une suppression `hard_bounce` est présente dans `email_suppressions`. Les valeurs false historiques ne permettent pas de distinguer un refus explicite d'une absence de choix.
- L'ancien client mobile pourra lire les colonnes historiques, mais ses écritures directes du marketing seront refusées après la migration. Une version mobile compatible est requise pour changer ces préférences; aucun droit direct n'est conservé pour les anciennes versions.
- Le préflight MCC Web appelle `lifecycle_has_verifiable_marketing_consent` et ne maintient pas de liste de sources séparée. Après migration, il reconnaîtra les nouveaux consentements versionnés via le helper partagé; il continuera d'exclure le cohort et les anciennes lignes sans version. L'interface MCC n'a pas encore de vue pour le journal administratif de cohorte.
- Les clients n'ont plus de droit d'écrire directement les colonnes marketing. Les droits d'opposition aux rappels de brouillon restent séparés.
- Aucun opt-in marketing par Auth/SMTP/Lifecycle, aucune réinscription des désabonnés.

## Déploiement
1. CI lint, typecheck, tests Vitest + revue QA mobile et accessibilité.
2. Revue puis migration SQL compatible avant diffusion du code mobile ; vérifier grants, RLS et `lifecycle_has_verifiable_marketing_consent` sur base isolée.
3. Publier l'actualisation mobile selon les règles EAS/OTA existantes, ou via le prochain build si OTA incompatible ; confirmer la distribution installée.
4. Tests sur comptes consentant et non consentant, sign-out/login, refus, préférences migrées, désabonnement ; lecture source/date en SQL.
5. Mesurer les consentements actifs `marketing_opt_in = true`, `marketing_opt_in_version = '2026-10-26.v1'`, `marketing_opt_in_source = 'authenticated_user_action'`, avec date présente et sans désabonnement ; compter les refus/révocations depuis `marketing_consent_events`.
5 bis. Afficher les attestations de cohorte uniquement dans un écran administratif dédié; ne jamais les joindre aux événements de consentement ni aux critères d'éligibilité.
6. Les campagnes marketing factory restent OFF jusqu'à QA E2E **par campagne**, liens corrects, volume éligible non nul, calendrier validé.
7. Ne jamais utiliser `migration_initiale_youmbia_2026_10_18` comme preuve. Ne pas réexpédier d'anciennes occurrences.

## Quatre campagnes factory à activer progressivement
- `reactivation_j15` — vérifier inactivité 15 jours et fréquence.
- `seller_activation` — vérifier absence de publication.
- `weekly_discovery` — vérifier annonces actives et liens CTA.
- `app_download` — vérifier liens App Store/Google Play réels avant activation.

Flags à activer **après** QA : `lifecycle_marketing_campaigns_enabled`, puis un seul `lifecycle_campaign_*` à la fois.
Conserver les autres OFF si audience zéro ou CTA manquant.
