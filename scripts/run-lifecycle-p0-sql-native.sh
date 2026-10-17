#!/usr/bin/env bash
# Intégration SQL Lifecycle P0 — PostgreSQL Supabase NATIF (Docker image locale).
# Prérequis : container `supabase_db_youmbia-lifecycle-p0-03c` sur 127.0.0.1:54322
#   docker start supabase_db_youmbia-lifecycle-p0-03c
# Refuse cloud / DATABASE_URL. N'utilise PAS les stubs Homebrew.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${LIFECYCLE_NATIVE_PGHOST:-127.0.0.1}"
PORT="${LIFECYCLE_NATIVE_PGPORT:-54322}"
USER_NAME="${LIFECYCLE_NATIVE_PGUSER:-postgres}"
DB="${LIFECYCLE_NATIVE_PGDATABASE:-postgres}"
export PGPASSWORD="${LIFECYCLE_NATIVE_PGPASSWORD:-postgres}"

case "$HOST" in
  127.0.0.1|localhost|::1) ;;
  *)
    echo "REFUS: host non local ($HOST)." >&2
    exit 2
    ;;
esac

if [[ -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "REFUS: DATABASE_URL/SUPABASE_DB_URL défini — risque remote." >&2
  exit 2
fi

FREE_GIO="$(python3 -c "import shutil; print(shutil.disk_usage('/').free/1024**3)")"
python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4.0 else 99)" \
  || { echo "HARD_STOP: espace libre < 4 Gio ($FREE_GIO)"; exit 99; }

if ! pg_isready -h "$HOST" -p "$PORT" -U "$USER_NAME" >/dev/null 2>&1; then
  echo "BLOCKED: Postgres natif inaccessible sur ${HOST}:${PORT}" >&2
  echo "Démarrer: docker start supabase_db_youmbia-lifecycle-p0-03c" >&2
  exit 3
fi

echo "==> Native probe ${HOST}:${PORT}/${DB} (free_gio=${FREE_GIO})"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), version();" \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_net','pg_cron','supabase_vault') ORDER BY 1;"

echo "==> Bootstrap (profiles/listings + vault mock secrets ; extensions réelles)"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_native_bootstrap.sql"

echo "==> Migrations lifecycle 150000 + 160000"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/migrations/20261017150000_lifecycle_email_p0.sql"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/migrations/20261017160000_lifecycle_email_p0_lot02_guards.sql"

echo "==> Integration tests"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_integration_tests.sql"

psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "UPDATE public.app_runtime_flags SET value = 'true' WHERE key = 'lifecycle_email_kill_switch';"

echo "PASS scripts/run-lifecycle-p0-sql-native.sh"
echo "NOTE: Edge Deno runtime non inclus. ALLOW_LIVE doit rester absent/false."
