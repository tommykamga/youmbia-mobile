#!/usr/bin/env bash
# Lot 04C — Edge Runtime + PostgREST + Resend mock.
# --pull=never. Dépendances via bundle local (pas esm.sh).
# Réseau interne pour DB/mock + bridge pour publish 127.0.0.1 uniquement.
# Resend réel : LIFECYCLE_RESEND_BASE_URL pointe UNIQUEMENT vers le mock interne.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4.1 else 99)" \
  || { echo "HARD_STOP disk"; exit 99; }

test -f supabase/functions/_vendor/supabase-js-bundle.mjs \
  || { echo "BLOCKED: missing vendor bundle — run scripts/prepare-lifecycle-edge-vendor.sh"; exit 3; }

NET=youmbia_lifecycle_p0_04b
docker network inspect "$NET" >/dev/null 2>&1 || docker network create --internal --driver bridge "$NET"

docker start supabase_db_youmbia-lifecycle-p0-03c >/dev/null
docker network connect "$NET" supabase_db_youmbia-lifecycle-p0-03c 2>/dev/null || true

for i in $(seq 1 20); do
  docker exec supabase_db_youmbia-lifecycle-p0-03c pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

export PGPASSWORD=postgres
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='youmbia_lifecycle_p0_04b'" | grep -q 1 \
  || "$ROOT/scripts/run-lifecycle-p0-04b-e2e.sh"

docker rm -f \
  youmbia_resend_mock_04c \
  youmbia_postgrest_04c \
  youmbia_rest_proxy_04c \
  youmbia_edge_send_04c \
  youmbia_edge_unsub_04c \
  youmbia_edge_webhook_04c \
  youmbia_edge_webhook_probe 2>/dev/null || true

start_edge() {
  local name=$1 port=$2 service=$3
  shift 3
  docker run -d --name "$name" --pull=never \
    --network bridge \
    -p "127.0.0.1:${port}:9000" \
    -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
    "$@" \
    public.ecr.aws/supabase/edge-runtime:v1.74.2 \
    start --main-service "/home/deno/functions/${service}" -i 0.0.0.0 -p 9000
  docker network connect "$NET" "$name"
}

echo "==> Resend mock"
start_edge youmbia_resend_mock_04c 19080 _resend_mock

echo "==> PostgREST"
docker run -d --name youmbia_postgrest_04c --pull=never \
  --network bridge \
  -p 127.0.0.1:19000:3000 \
  -e PGRST_DB_URI=postgres://postgres:postgres@supabase_db_youmbia-lifecycle-p0-03c:5432/youmbia_lifecycle_p0_04b \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=postgres \
  -e PGRST_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
  public.ecr.aws/supabase/postgrest:v14.14
docker network connect "$NET" youmbia_postgrest_04c

echo "==> /rest/v1 proxy → PostgREST"
start_edge youmbia_rest_proxy_04c 19001 _rest_v1_proxy \
  -e PGRST_UPSTREAM=http://youmbia_postgrest_04c:3000

HMAC=lot04c-hmac-test-only
DISPATCH=lot04c-dispatch-test-only
WHSEC=whsec_dGVzdC1zZWNyZXQtd2ViaG9vayEhIQ==
JWT=$(python3 - <<'PY'
import base64, hashlib, hmac, json
secret = b'super-secret-jwt-token-with-at-least-32-characters-long'
def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
header = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':')).encode())
payload = b64(json.dumps({"role":"postgres","iss":"supabase"}, separators=(',',':')).encode())
sig = b64(hmac.new(secret, f'{header}.{payload}'.encode(), hashlib.sha256).digest())
print(f'{header}.{payload}.{sig}')
PY
)
SECRET_KEYS=$(JWT="$JWT" python3 -c "import json,os; print(json.dumps({'default':os.environ['JWT']}))")

common=(
  -e "SUPABASE_URL=http://youmbia_rest_proxy_04c:9000"
  -e "SUPABASE_SECRET_KEYS=${SECRET_KEYS}"
  -e "LIFECYCLE_EMAIL_HMAC_SECRET=${HMAC}"
  -e "LIFECYCLE_EMAIL_DISPATCH_SECRET=${DISPATCH}"
  -e "LIFECYCLE_RESEND_WEBHOOK_SECRET=${WHSEC}"
  -e "LIFECYCLE_PUBLIC_FUNCTIONS_BASE=http://127.0.0.1:19072"
  -e "LIFECYCLE_RESEND_BASE_URL=http://youmbia_resend_mock_04c:9000"
  -e "LIFECYCLE_RESEND_API_KEY=re_test_isolated_not_live"
)

echo "==> Edge lifecycle functions"
start_edge youmbia_edge_send_04c 19071 send-lifecycle-email "${common[@]}"
start_edge youmbia_edge_unsub_04c 19072 lifecycle-email-unsubscribe "${common[@]}"
start_edge youmbia_edge_webhook_04c 19073 lifecycle-email-webhook "${common[@]}"

sleep 3
code=$(curl -sS -o /tmp/wh0.json -w '%{http_code}' -X POST http://127.0.0.1:19073/ \
  -H 'content-type: application/json' -d '{}' || echo 000)
echo "webhook_probe_http=$code"
[[ "$code" != "000" ]] || { docker logs youmbia_edge_webhook_04c 2>&1 | tail -20; exit 3; }
echo "PASS edge-runtime up (bundle offline)"
echo "PORTS send=19071 unsub=19072 webhook=19073 mock=19080 rest=19000"
echo "DISPATCH=$DISPATCH"
echo "HMAC=$HMAC"
echo "WHSEC=$WHSEC"
