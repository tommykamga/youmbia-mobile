#!/usr/bin/env bash
# Rebuild offline supabase-js bundle from node_modules (no network).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4.1 else 99)"
test -x node_modules/.bin/esbuild
mkdir -p supabase/functions/_vendor
node_modules/.bin/esbuild \
  node_modules/@supabase/supabase-js/dist/index.mjs \
  --bundle --format=esm --platform=browser \
  --outfile=supabase/functions/_vendor/supabase-js-bundle.mjs
echo "PASS vendor bundle $(wc -c < supabase/functions/_vendor/supabase-js-bundle.mjs) bytes"
