# PROJECT_STATE — YOUMBIA mobile

> Instantané local de branche. Le dépôt git prime en cas d’écart.

| Champ | Valeur |
|-------|--------|
| Date | 2026-10-17 |
| Branche | `feat/lifecycle-email-p0` |
| HEAD | tip branche (consulter `git rev-parse HEAD`) |
| Empreinte tree | consulter `git write-tree` |
| Statut chantier | **Release Candidate Lifecycle Email P0** — Draft PR #17 ouverte, CI verte — merge en attente GO |

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
