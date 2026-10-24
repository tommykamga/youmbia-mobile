# YOUMBIA local Supabase push E2E

This legacy harness still uses the explicitly representative 13-file manifest below. The exhaustive Web/Mobile source replay, migration reconciliation, local-only enum correction, and remaining structural differences are documented in [`docs/push/supabase-migration-reconciliation-2026-10-24.md`](../../../docs/push/supabase-migration-reconciliation-2026-10-24.md). To reproduce its full baseline in a fresh PostgreSQL 17 Supabase local project, run `reconcile_baseline.py` with the pinned Web checkout and a loopback `--db-url`; it refuses a non-loopback host and never writes migration-history rows.

This harness never accepts a cloud API/DB URL. It requires Docker, Supabase CLI, Python 3.11+, Deno, and the versioned Web repository at ref `c0de541`. It uses only synthetic `.invalid` accounts, listings/messages/favorites and synthetic Expo tokens. No production data dump, production environment file or real device token is used.

The mobile migration chain is a delta chain: `20260514100000_require_marketplace_baseline.sql` intentionally rejects an empty marketplace. `db.migrations.enabled=false` in the historical root config means a plain reset does **not** test migrations. This was verified explicitly. To reproduce the negative greenfield test, set that option to true **only in the disposable copy**, run `supabase db reset --local --no-seed`, and preserve the expected `baseline_schema_missing` failure. Then disable migrations in that copy and reset before sourced bootstrap. Never edit the release config or use `--linked`.

## Setup

Run `python3 supabase/tests/e2e/prepare.py` from the dedicated branch. It refuses an existing `/private/tmp/ymb-push-e2e-local`. Existing test directories must be inspected; the preparer never deletes them. The copied project is `youmbia-push-e2e-local`, API `127.0.0.1:55421`, database `127.0.0.1:55422`, PostgreSQL major 17. Credentials are local, mode 0600, never log or commit them.

In the copied project:

```sh
supabase start --exclude studio,imgproxy,vector
supabase db reset --local --no-seed
umask 077
supabase status -o json > /private/tmp/ymb-e2e-credentials.json
supabase functions serve --env-file /private/tmp/ymb-e2e.env
```

Keep the CLI's startup credentials out of published logs. In another terminal in the branch, run the controlled HTTP simulator:

```sh
npx --yes --package=deno deno run --allow-read=/private/tmp/ymb-e2e.env --allow-net=0.0.0.0:55541 supabase/functions/_tests/e2e/expo-mock.ts /private/tmp/ymb-e2e.env
```

The adapter exists **only** in the copied project's `e2e-dispatch` entrypoint. It checks the isolated project marker and Docker gateway hostname, overrides only the worker flag and Expo transport, and imports the actual production handler/store code. Every send/receipt goes to `host.docker.internal:55541`; the mock cannot connect to an external network. The normal production entrypoint stays OFF. No `EXPO_ACCESS_TOKEN` is copied or needed.

## Bootstrap and upgrade

`baseline-manifest.json` selects SQL from the immutable Web ref, excluding personal/admin-user migrations and user-data seeds. `observed-columns.sql` and `observed-grants.sql` are explicit metadata-only complements for historical omissions. Hashes of applied files are recorded under `/private/tmp`. This is a sourced representative schema, **not** an assertion that the mobile repository alone can build the entire historical production schema.

For a complete application onto an empty sourced baseline:

```sh
python3 supabase/tests/e2e/bootstrap.py --web-root '/path/to/Youmbia-web'
```

For the upgrade test on historical schema plus synthetic data, use a fresh local reset, then:

```sh
python3 supabase/tests/e2e/bootstrap.py --web-root '/path/to/Youmbia-web' --pre-push
python3 supabase/tests/e2e/upgrade.py
python3 supabase/tests/e2e/backend.py
```

`upgrade.py` snapshots existing fictional business rows, applies the three new deltas in order, checks equality, OFF flags/no backfill, and real JWT token lookup/unsubscribe. `legacy.py` separately verifies the real authenticated compatibility function is a no-op with the outbox ON and refuses injected recipients. `backend.py` then tests Auth/JWT/PostgREST/Edge/simulated Expo, recipients, multi-device, 429/500/rate limits, backoff bounds, timeout ambiguity, tickets/receipts, version-safe DNR, offline logout/reassignment and concurrent HTTP creation/messages. Mock receipts mean provider acceptance **only**, never real phone delivery.

## Native SQL and scheduler

`native-security.sql` runs against the real Supabase roles/auth.uid, with `buyer`/`thread` psql variables from the JSON result. There is no fixture replacement for native Auth or PostgREST. Use the fixed test DB container with `psql -v ON_ERROR_STOP=1` and validated synthetic UUID parameters.

`python3 supabase/tests/e2e/scheduler.py` configures **only this local Vault** with a random test secret and local adapter URL, reproduces the old production-URL restriction without an outbound request, installs the portable operations script, and verifies its job is inactive. It fills the owner-only `push_private.dispatch_target` URL, activates the real one-minute cron job, waits at most 75 seconds for an accepted synthetic ticket, and always deactivates the job. The allowlist table replaces restricted PostgreSQL configuration parameters; do not try to configure `app.settings.*` with unprivileged ALTER DATABASE.

CLI `supabase db lint --local --schema push_private --fail-on error` passes. Global SQL lint currently emits a static diagnostic for dynamic optional `listing_reports` deletion in `delete_my_account`; actual runtime deletion was tested successfully on a synthetic account/listing with that table absent. Run `python3 supabase/tests/e2e/historical-rpc.py` to repeat this synthetic-only regression check. The function body matches the read-only observed production body hash and has an existence guard. Keep the raw exit 1 and runtime qualification; do not hide the diagnostic or modify Auth to silence it.

## Teardown and limits

Disable the test cron, stop the function server and mock, then `supabase stop` in the disposable project. This stops only its labeled containers and preserves its synthetic volumes. Remove local credential/env files from shared artifacts; retain redacted logs, hashes and result JSON only. Never invoke a production function or use a linked CLI target.

Native runtime tested: Postgres `17.6.1.143`, GoTrue `v2.192.0`, PostgREST `v14.14`, Edge Runtime `v1.74.2`, pg_cron `1.6.4`, pg_net `0.20.3`, Vault `0.3.1`. Platform images may evolve; inspect and record actual versions on each run.

This does not execute Android/iOS, Expo/FCM/APNs delivery, cold-start UI, native credentials or an actual offline handset. An actual installed-SDK unit test also confirms that network-failed signOut returns an error and retains the local session; the failed attempt must not be described as a completed offline logout. The server-unknown logout case remains a documented risk requiring a product-approved revocation/lease protocol. Do not upload the adapter or mock to production.
