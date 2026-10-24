# YOUMBIA QA migration runner

This runner is pinned to mobile commit `925eb312ad46b40e6ee541bdabb03f92052087cd`, Web commit `c0de54189ad9cb6a6968e186e387731a4a759f7d`, manifest SHA-256 `d8675dfd03f6dea2986c6c49f8574ec14741a533afcc8a7bdc4822d88f04bb7c`, and QA project `wagvrytcguutgbjzhvak`. It is purpose-built for the qualified YOUMBIA baseline; do not reuse it for another project.

## Local verification

The default mode validates all 77 source hashes, sequence numbers, unique paths and migration versions, the three Push migrations, the pinned project refs and the reviewed enum correction. It does not construct a database client. The Web checkout must contain the pinned commit.

```sh
export YOUMBIA_WEB_REPO=/path/to/Youmbia-web
python3 scripts/qa/qa_migration_runner.py --dry-run \
  --report /secure/local/path/qa-dry-run.jsonl
```

For the automated suite, use Python 3.9 or newer and PostgreSQL `initdb`, `pg_ctl`, `psql` and `pg_dump` on `PATH` (or adjust `PG_BIN` in the test file). Tests create a temporary PostgreSQL cluster under `/private/tmp`, listen only on its private Unix socket, and remove it on completion.

```sh
python3 scripts/qa/test_qa_migration_runner.py
```

## Authorized QA application procedure

This procedure is documentation only; no remote command was run as part of this qualification. Before a future deployment, the operator must have a separately authorized QA-only Supabase identity and direct database credentials. Never export PROD credentials, use a production connection alias, or paste secrets into a command argument.

1. Check out the exact mobile commit above and the pinned Web commit. Run the dry-run and review the manifest SHA and all 77 ordered rows. Require the exact target printed by the runner.
2. Obtain the QA database connection string and trusted CA bundle through the approved secret manager. Export only `YOUMBIA_QA_DATABASE_URL`, `YOUMBIA_QA_SSLROOTCERT`, and a QA-authorized `SUPABASE_ACCESS_TOKEN` in the current process environment. The URL must use host `db.wagvrytcguutgbjzhvak.supabase.co`, database/user `postgres`, port `5432`, and `sslmode=verify-full`.
3. Confirm independently in Supabase that the project is `YOUMBIA-PUSH-QA`, belongs to `youmbia-push-qa`, is `ACTIVE_HEALTHY` in `eu-west-1`, and is the zero-cost QA project. The runner repeats these identity checks through read-only Management API calls and PostgreSQL TLS hostname verification.
4. Require an empty application schema and migration history. The runner refuses a pre-existing application schema, a Supabase migration journal, any previous unknown runner journal, non-empty Vault/`pg_net` queues, enabled push flags, or registered device tokens.
5. Only after the explicit deployment GO, run:

   ```sh
   python3 scripts/qa/qa_migration_runner.py --apply \
     --web-repo "$YOUMBIA_WEB_REPO" \
     --report /secure/local/path/qa-apply.jsonl
   ```

   The report is created exclusively with mode `0600`. The runner acquires a PostgreSQL advisory lock, rechecks identity and safety guards before every step, records source and applied hashes, runs each SQL file in its own transaction, disables all active cron jobs after each step, and compares the schema fingerprint before continuing. It stops on any mismatch or error.
6. Do not deploy any Edge Function during this baseline. In particular, never deploy or invoke historical `send-message-push`, `dispatch-saved-search-alerts`, or the transaction dispatcher as part of this procedure. Do not create Vault secrets, Expo tokens or real device tokens. Keep all push flags OFF and cron inactive. A future separately authorized function qualification must use the QA-only endpoint and a simulated transport.
7. Review the redacted JSONL report and verify 77 applied entries, all source/applied hashes, zero active cron jobs, empty Vault and `pg_net` queues, disabled push flags, zero device tokens, and the final schema hash before any next task.

The runner never calls the Supabase deployment API for migrations or functions; the only Management API requests are GETs for the pinned project's identity. Database writes are possible only when `--apply` is explicitly supplied and only through the exact QA database hostname. It does not offer a production target override.

## Resume and recovery

An ordinary stop between completed steps is resumable: rerun the same command with the same pinned sources and manifest. The runner verifies that the journal is a contiguous applied prefix and that the live schema fingerprint matches its last completed checkpoint; completed entries are not replayed.

If a migration is marked `started` or `failed`, if the process stops after SQL commits but before the journal records success, or if the live schema differs from its checkpoint, the runner refuses automatic retry. Do not edit the journal to make it green. Capture the redacted report, compare the source hash, journal row, schema dump and Supabase migration history with a DBA, then either restore the isolated QA project to its known empty state under a separately approved recovery operation or implement and review a specific reconciliation. No automatic destructive reset is provided.

Migrations containing psql meta-commands, non-transactional SQL (including concurrent index operations), unsafe transaction boundaries, or unreviewed direct network calls fail before execution. The qualified manifest's explicit enum correction is applied in memory only; the source Git object and its provenance hash are retained unchanged.
