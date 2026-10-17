#!/usr/bin/env bash
# Intégration SQL Lifecycle P0 — PostgreSQL LOCAL uniquement (127.0.0.1).
# Refuse tout host non local. Recrée la DB à chaque run (idempotent).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${LIFECYCLE_IT_PGHOST:-127.0.0.1}"
PORT="${LIFECYCLE_IT_PGPORT:-5432}"
DB="${LIFECYCLE_IT_DB:-youmbia_lifecycle_p0_it}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$HOST" in
  127.0.0.1|localhost|::1) ;;
  *)
    echo "REFUS: host non local ($HOST). Jamais de prod/cloud." >&2
    exit 2
    ;;
esac

# Garde anti-cloud : ne jamais lire DATABASE_URL / SUPABASE remote pour ce script.
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "REFUS: DATABASE_URL est défini — risque de cibler un remote. Unset puis relancer." >&2
  exit 2
fi
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "REFUS: SUPABASE_DB_URL est défini — risque de cibler un remote. Unset puis relancer." >&2
  exit 2
fi

if ! pg_isready -h "$HOST" -p "$PORT" >/dev/null 2>&1; then
  echo "BLOCKED: PostgreSQL local inaccessible sur ${HOST}:${PORT}" >&2
  exit 3
fi

echo "==> Recréation DB locale ${HOST}:${PORT}/${DB}"
dropdb -h "$HOST" -p "$PORT" --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" "$DB"

psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "SELECT current_database() AS db, inet_server_addr() AS addr;"

echo "==> Stubs (auth/vault/net/cron — PAS les extensions cloud réelles)"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_local_stubs.sql"

for mig in \
  "$ROOT/supabase/migrations/20261017150000_lifecycle_email_p0.sql" \
  "$ROOT/supabase/migrations/20261017160000_lifecycle_email_p0_lot02_guards.sql" \
  "$ROOT/supabase/migrations/20261017170000_lifecycle_email_kill_switch_fail_closed.sql"
do
  base="$(basename "$mig")"
  echo "==> Migration $base (CREATE EXTENSION pg_net/pg_cron stripés → stubs)"
  sed -E \
    -e '/CREATE EXTENSION IF NOT EXISTS pg_net/d' \
    -e '/CREATE EXTENSION IF NOT EXISTS pg_cron/d' \
    "$mig" > "$TMP/$base"
  psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/$base"
done

echo "==> Tests d’intégration P0 (schéma pré-évolution)"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_integration_tests.sql"

echo "==> Migration service vs marketing (représentative prod)"
MIG_SVC="$ROOT/supabase/migrations/20261017220000_lifecycle_service_vs_marketing.sql"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 -f "$MIG_SVC"

echo "==> Tests service vs marketing"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_service_vs_marketing_tests.sql"

echo "==> Migration prep draft reminders (flag service OFF)"
MIG_DRAFT="$ROOT/supabase/migrations/20261018010000_lifecycle_draft_reminders_prep.sql"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 -f "$MIG_DRAFT"

echo "==> Tests prep draft reminders"
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_draft_reminders_prep_tests.sql"

# Hygiène : kill switch ON en fin de run
psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "UPDATE public.app_runtime_flags SET value = 'true' WHERE key = 'lifecycle_email_kill_switch';"

echo "PASS scripts/run-lifecycle-p0-sql-integration.sh"
echo "NOTE: stubs ≠ Vault/pg_net/pg_cron/Edge Deno réels. Docker supabase start non requis pour ce harness."
