# DECISIONS — YOUMBIA mobile (ADR brèves)

## 2026-10-17 — Lifecycle Email P0 Release Candidate

| Champ | Valeur |
|-------|--------|
| Statut | **APPROUVÉE** (code RC local) / PR **PROPOSÉE** (attente GO push) |
| Source | Lots 01–05A ; killcritic indépendant GO CONDITIONNEL |

### Décisions

1. Marketing lifecycle **séparé** des emails Auth / Magic Link (Resend keys, tags, templates).
2. Consentement : opt-in **explicite**, défaut **false**.
3. Kill switch DB défaut **true** ; absence de row = **ON** (fail-closed, 20261017170000).
4. Envoi fournisseur : fail-closed `dry_run` | `mock` | `live` (multi-flags).
5. Lab Edge : réseau Docker `--internal` sans bridge (04D).
6. Aucun push / migrate / deploy / email réel sans autorisation **explicite par opération**.

### Conséquences

- Ouverture PR autorisée après GO utilisateur ; activation send = autorisation distincte.
- Staging doit déployer les 3 EF avec auth alignée pg_net (`--no-verify-jwt` ou JWT service).
