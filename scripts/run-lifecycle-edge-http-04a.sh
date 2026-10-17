#!/usr/bin/env bash
# Edge HTTP local Lot 04A — 127.0.0.1 only, Resend mocké.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4 else 99)" \
  || { echo "HARD_STOP: < 4 Gio libres"; exit 99; }
npx --yes deno test --no-check \
  --allow-read=supabase/functions \
  --allow-env \
  --allow-net=127.0.0.1 \
  --import-map=supabase/functions/_tests/import_map.json \
  supabase/functions/_tests/lifecycle_edge_http_04a_test.ts
echo "PASS scripts/run-lifecycle-edge-http-04a.sh"
echo "NOTE: ne prouve pas edge-runtime Supabase Docker."
