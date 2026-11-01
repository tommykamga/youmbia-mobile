#!/usr/bin/env bash
# Restored Supabase baseline ONLY. Never bootstraps marketplace stubs or contacts cloud.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "${V5_02B_BASELINE_QUALIFIED:-}" != 1 || ! -s "${V5_02B_BASELINE_EVIDENCE:-/nonexistent}" ]]; then
  echo 'SQL QA BLOCKED: require qualified restored baseline and V5_02B_BASELINE_EVIDENCE.' >&2
  exit 2
fi
case "${V5_02B_PGHOST:-127.0.0.1}" in
  127.0.0.1|::1) ;;
  *) echo 'SQL QA BLOCKED: only literal loopback hosts allowed.' >&2; exit 2 ;;
esac
if [[ -n "${DATABASE_URL:-}${SUPABASE_DB_URL:-}${PGSERVICE:-}${PGSERVICEFILE:-}${PGOPTIONS:-}" ]]; then
  echo 'SQL QA BLOCKED: ambient connection/service/options variables are forbidden.' >&2
  exit 2
fi
# PGHOSTADDR overrides PGHOST in libpq; never inherit an ambient remote address.
unset PGHOSTADDR
export PGHOST="${V5_02B_PGHOST:-127.0.0.1}"
export PGPORT="${V5_02B_PGPORT:-54322}"
export PGUSER="${V5_02B_PGUSER:-postgres}"
export PGDATABASE="${V5_02B_PGDATABASE:-postgres}"
# No URL/conninfo may override the loopback host through -d.
if [[ ! "$PGDATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo 'SQL QA BLOCKED: database name must be a plain identifier.' >&2; exit 2
fi
# Migration is intentionally not applied here. Apply the reviewed file to the isolated
# clone only, then run this transactional suite; its preflight requires the guard.
psql -X -w -v ON_ERROR_STOP=1 -f "$ROOT/supabase/scripts/v5_02b_publication_tests.sql"
