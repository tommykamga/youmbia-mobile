#!/usr/bin/env bash
# Rebuild offline supabase-js bundle from node_modules (no network).
# Pin : version lue dans node_modules/@supabase/supabase-js/package.json
# Checksum versionné : supabase/functions/_vendor/supabase-js-bundle.sha256
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4.1 else 99)"
test -x node_modules/.bin/esbuild
test -f node_modules/@supabase/supabase-js/package.json

VERSION=$(python3 -c "import json; print(json.load(open('node_modules/@supabase/supabase-js/package.json'))['version'])")
mkdir -p supabase/functions/_vendor
OUT=supabase/functions/_vendor/supabase-js-bundle.mjs
META=supabase/functions/_vendor/supabase-js-bundle.meta.json

node_modules/.bin/esbuild \
  node_modules/@supabase/supabase-js/dist/index.mjs \
  --bundle --format=esm --platform=browser \
  --outfile="$OUT"

SHA=$(shasum -a 256 "$OUT" | awk '{print $1}')
printf '%s  supabase-js-bundle.mjs\n' "$SHA" > supabase/functions/_vendor/supabase-js-bundle.sha256
python3 - <<PY
import json
meta = {
  "package": "@supabase/supabase-js",
  "version": "$VERSION",
  "sha256": "$SHA",
  "generator": "esbuild",
  "platform": "browser",
  "format": "esm",
}
json.dump(meta, open("$META", "w"), indent=2)
print("PASS vendor bundle version=$VERSION sha256=$SHA bytes=$(wc -c < "$OUT")")
PY

# Garde-fou : pas de credentials embarqués (le SDK peut citer des rôles / formes JWT génériques).
if grep -Eiq 're_[A-Za-z0-9]{32,}|sk_live_[A-Za-z0-9]+|rk_live_[A-Za-z0-9]+' "$OUT"; then
  echo "FAIL bundle contains provider-key-like material"
  exit 3
fi
if grep -Eiq 'password=[^\"'\''[:space:]]{8,}|api_key=[A-Za-z0-9]{16,}' "$OUT"; then
  echo "FAIL bundle contains credential-like query"
  exit 3
fi
# Pas d’URL Resend hardcodée comme cible d’envoi lifecycle
if grep -Fq 'https://api.resend.com' "$OUT"; then
  echo "FAIL bundle unexpectedly embeds api.resend.com"
  exit 3
fi
echo "PASS bundle secret scan"
