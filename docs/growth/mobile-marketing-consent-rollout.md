# YOUMBIA Mobile — Consentement marketing & campagnes (P0)

## Règles non négociables
- Le booléen marketing_opt_in importé ne constitue **pas** une preuve.
- Opt-in volontaire, non précoché, à l'accueil pour les seuls utilisateurs connectés qui n'ont ni preuve d'accord ni désabonnement.
- "Pas maintenant" n'écrit aucune préférence et masque seulement pour la session applicative.
- Paramètres : le switch reflète une preuve valide, pas un booléen d'import.
- Action "Oui, j'accepte" : source `mobile_home_prompt` et horodatage. Vérifier la persistance avant de masquer l'invitation.
- Aucun opt-in marketing par Auth/SMTP/Lifecycle, aucune réinscription des désabonnés.

## Déploiement
1. CI lint, typecheck, tests Vitest + revue QA mobile et accessibilité.
2. Migration SQL compatible avant diffusion du code mobile ; vérifier `lifecycle_has_verifiable_marketing_consent`.
3. Publier l'actualisation mobile selon les règles EAS/OTA existantes, ou via le prochain build si OTA incompatible ; confirmer la distribution installée.
4. Tests sur comptes consentant et non consentant, sign-out/login, refus, préférences migrées, désabonnement ; lecture source/date en SQL.
5. Mesurer le nombre de consentements `source in ('signup','settings','mobile_home_prompt')` et leur horodatage.
6. Les campagnes marketing factory restent OFF jusqu'à QA E2E **par campagne**, liens corrects, volume éligible non nul, calendrier validé.
7. Ne jamais utiliser `migration_initiale_youmbia_2026_10_18` comme preuve. Ne pas réexpédier d'anciennes occurrences.

## Quatre campagnes factory à activer progressivement
- `reactivation_j15` — vérifier inactivité 15 jours et fréquence.
- `seller_activation` — vérifier absence de publication.
- `weekly_discovery` — vérifier annonces actives et liens CTA.
- `app_download` — vérifier liens App Store/Google Play réels avant activation.

Flags à activer **après** QA : `lifecycle_marketing_campaigns_enabled`, puis un seul `lifecycle_campaign_*` à la fois.
Conserver les autres OFF si audience zéro ou CTA manquant.
