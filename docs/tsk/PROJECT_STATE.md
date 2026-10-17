# PROJECT_STATE — YOUMBIA mobile

> Instantané local de branche. Le dépôt git prime en cas d’écart.

| Champ | Valeur |
|-------|--------|
| Date | 2026-10-17 |
| Branche | `feat/lifecycle-email-p0` |
| HEAD | `181af0416ca9f9d133fdf2b36cc29affe8140970` |
| Empreinte tree | `0aa0bb79680931d41286eb6e5894c039f742cb5e` |
| Statut chantier | **Release Candidate Lifecycle Email P0** — PR prête, push en attente GO |

## Confirmé

- Kill switch insert `true` + fail-closed si row absente (migration 170000).
- Consentement marketing défaut `false` ; enqueue/send exigent opt-in.
- Transport Resend fail-closed (Lot 04D) ; lab `--internal` sans egress.
- Magic Link / Auth Resend non collisionnés.
- QA locale Vitest/typecheck/lint PASS sur baseline 29993fb (+ tests contrat 05A).

## À revérifier

- Alignement `verify_jwt` / pg_net sur staging réel.
- Opt-in OAuth : erreurs upsert prefs non remontées UI (IMPORTANT killcritic).
- Bundle vendor : CI `shasum -c` non encore branchée.

## Obsolescète

- Blocage esm.sh Edge (04B) : **OBSOLÈTE** — résolu 04C/04D.
- Dual-homing bridge egress (04C) : **OBSOLÈTE** comme config lab — clos 04D ; risque historique non démontrable documenté.

## Prochaine action

Attendre GO explicite utilisateur pour **push + ouverture PR** uniquement. Pas de migrate/deploy/email.
