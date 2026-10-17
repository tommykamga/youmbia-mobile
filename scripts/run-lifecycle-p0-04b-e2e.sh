#!/usr/bin/env bash
# Lot 04B — E2E SQL isolé sur PG Docker 03C (DB youmbia_lifecycle_p0_04b).
# Pas de supabase start, pas de dump prod, pas de cloud.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=127.0.0.1
PORT=54322
USER_NAME=postgres
DB=youmbia_lifecycle_p0_04b
export PGPASSWORD="${LIFECYCLE_NATIVE_PGPASSWORD:-postgres}"

python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4 else 99)" \
  || { echo "HARD_STOP: < 4 Gio"; exit 99; }

if [[ -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "REFUS: DATABASE_URL/SUPABASE_DB_URL"; exit 2
fi

if ! pg_isready -h "$HOST" -p "$PORT" -U "$USER_NAME" >/dev/null 2>&1; then
  echo "BLOCKED: démarrer docker start supabase_db_youmbia-lifecycle-p0-03c"; exit 3
fi

echo "==> Recreate DB $DB"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE);" \
  -c "CREATE DATABASE ${DB};"

echo "==> Extensions + marketplace minimal"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_04b_marketplace_bootstrap.sql"

echo "==> Garde baseline + migrations lifecycle (pg_cron stripé: réservé DB postgres)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/migrations/20260514100000_require_marketplace_baseline.sql"
python3 - <<PY
from pathlib import Path
import re
src = Path("$ROOT/supabase/migrations/20261017150000_lifecycle_email_p0.sql").read_text()
src = re.sub(r'(?m)^CREATE EXTENSION IF NOT EXISTS pg_cron.*\n', '', src)
src = re.sub(r'(?m)^CREATE EXTENSION IF NOT EXISTS pg_net.*\n', '', src)
src = re.sub(r'(?s)SELECT cron\.unschedule\(.*?;\n', '', src)
src = re.sub(r'(?s)SELECT cron\.schedule\(.*?;\n', '', src)
Path("$TMP/150000.sql").write_text(src)
print('stripped_cron_and_extensions_ok')
PY
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/150000.sql"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/migrations/20261017160000_lifecycle_email_p0_lot02_guards.sql"

echo "==> E2E scenarios"
psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/scripts/lifecycle_p0_04b_e2e_scenarios.sql"

psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB" -tAc \
  "SELECT value FROM public.app_runtime_flags WHERE key='lifecycle_email_kill_switch';" \
  | grep -qx 'true' || { echo "FAIL kill switch"; exit 1; }

echo "PASS scripts/run-lifecycle-p0-04b-e2e.sh"
echo "NOTE: edge-runtime Docker BLOQUÉ (esm.sh) sur réseau --internal — voir docs Lot 04B."
