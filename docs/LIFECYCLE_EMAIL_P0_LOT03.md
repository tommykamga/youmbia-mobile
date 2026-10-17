# Lifecycle Email P0 — Lot 03 (intégration SQL locale)

## Environnement prouvé

| Champ | Valeur |
|-------|--------|
| Host | `127.0.0.1:5432` (garde script) |
| DB | `youmbia_lifecycle_p0_it` (drop/create à chaque run) |
| Engine | PostgreSQL 18.3 Homebrew |
| Prod / cloud | **Non** — refuse `DATABASE_URL` / `SUPABASE_DB_URL` / host non local |
| Docker / `supabase start` | **BLOCKED** (daemon non prêt au moment du Lot 03) |
| pg_net / pg_cron / Vault | **Stubs** — ne prouvent pas le dispatch HTTP réel ni Vault cloud |

## Commande

```bash
./scripts/run-lifecycle-p0-sql-integration.sh
```

## Preuves SQL (NOTICE attendus)

- Kill switch défaut ON → enqueue 0
- Consent / ban / suppression / fréquence 7j / idempotence / claim concurrent
- Unsubscribe + stale `provider_message_id` → `uncertain`
- Trigger metadata opt-in
- Grants : authenticated sans SELECT outbox
- `defer_lifecycle_email_after_dry_run` → pending + schedule +100y
- Fin de run : kill switch remis à `true`

## Dry-run (Edge)

`defer_lifecycle_email_after_dry_run` : occurrence **non** brûlée, **pas** de boucle cron.

## Non prouvé (blocage / stubs)

- Edge Deno runtime, Svix Resend live, GoTrue OAuth device, Magic Link device
- Extensions pg_net/pg_cron réelles Supabase
