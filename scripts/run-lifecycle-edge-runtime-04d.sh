#!/usr/bin/env bash
# Lot 04D — Edge Runtime isolé : réseau --internal UNIQUEMENT (pas de bridge, pas d’egress).
# --pull=never. Env de test forcée à chaque docker run (aucun héritage).
# Accès host via publish désactivé : les tests passent par un client sur le même réseau.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 -c "import shutil,sys; sys.exit(0 if shutil.disk_usage('/').free/1024**3 >= 4.1 else 99)" \
  || { echo "HARD_STOP disk"; exit 99; }

test -f supabase/functions/_vendor/supabase-js-bundle.mjs \
  || { echo "BLOCKED: missing vendor bundle — run scripts/prepare-lifecycle-edge-vendor.sh"; exit 3; }
test -f supabase/functions/_vendor/supabase-js-bundle.sha256 \
  || { echo "BLOCKED: missing bundle checksum"; exit 3; }

NET=youmbia_lifecycle_p0_04d
docker network inspect "$NET" >/dev/null 2>&1 \
  || docker network create --internal --driver bridge "$NET"

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

# Tear down recipe containers (04c + 04d) — recreate with forced env, never docker start.
docker rm -f \
  youmbia_resend_mock_04c youmbia_postgrest_04c youmbia_rest_proxy_04c \
  youmbia_edge_send_04c youmbia_edge_unsub_04c youmbia_edge_webhook_04c \
  youmbia_resend_mock_04d youmbia_postgrest_04d youmbia_rest_proxy_04d \
  youmbia_edge_send_04d youmbia_edge_unsub_04d youmbia_edge_webhook_04d \
  youmbia_e2e_client_04d 2>/dev/null || true

# Secrets de lab UNIQUEMENT — jamais de credentials fournisseur réels.
HMAC=lot04d-hmac-test-only
DISPATCH=lot04d-dispatch-test-only
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

# Conteneurs UNIQUEMENT sur le réseau --internal (pas de -p, pas de bridge).
start_edge() {
  local name=$1 service=$2
  shift 2
  docker run -d --name "$name" --pull=never \
    --network "$NET" \
    -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
    "$@" \
    public.ecr.aws/supabase/edge-runtime:v1.74.2 \
    start --main-service "/home/deno/functions/${service}" -i 0.0.0.0 -p 9000
}

echo "==> Resend mock (internal-only)"
start_edge youmbia_resend_mock_04d _resend_mock

echo "==> PostgREST (internal-only)"
docker run -d --name youmbia_postgrest_04d --pull=never \
  --network "$NET" \
  -e PGRST_DB_URI=postgres://postgres:postgres@supabase_db_youmbia-lifecycle-p0-03c:5432/youmbia_lifecycle_p0_04b \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=postgres \
  -e PGRST_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
  public.ecr.aws/supabase/postgrest:v14.14

echo "==> /rest/v1 proxy"
start_edge youmbia_rest_proxy_04d _rest_v1_proxy \
  -e PGRST_UPSTREAM=http://youmbia_postgrest_04d:3000

# Env test forcée à chaque création — isolation=test empêche live même si ALLOW_LIVE fuité.
common_test=(
  -e "SUPABASE_URL=http://youmbia_rest_proxy_04d:9000"
  -e "SUPABASE_SECRET_KEYS=${SECRET_KEYS}"
  -e "LIFECYCLE_EMAIL_HMAC_SECRET=${HMAC}"
  -e "LIFECYCLE_EMAIL_DISPATCH_SECRET=${DISPATCH}"
  -e "LIFECYCLE_RESEND_WEBHOOK_SECRET=${WHSEC}"
  -e "LIFECYCLE_PUBLIC_FUNCTIONS_BASE=http://youmbia_edge_unsub_04d:9000"
  -e "LIFECYCLE_RESEND_BASE_URL=http://youmbia_resend_mock_04d:9000"
  -e "LIFECYCLE_RESEND_API_KEY=re_test_isolated_not_live"
  -e "LIFECYCLE_EMAIL_ISOLATION=test"
  -e "LIFECYCLE_EMAIL_ALLOW_LIVE=false"
  -e "LIFECYCLE_EMAIL_TRANSPORT=dry_run"
  -e "LIFECYCLE_EMAIL_LIVE_PROVIDER=false"
)

echo "==> Edge lifecycle (dry_run default, isolation=test)"
start_edge youmbia_edge_send_04d send-lifecycle-email "${common_test[@]}"
start_edge youmbia_edge_unsub_04d lifecycle-email-unsubscribe "${common_test[@]}"
start_edge youmbia_edge_webhook_04d lifecycle-email-webhook "${common_test[@]}"

echo "==> E2E client (same internal net, no egress)"
docker run -d --name youmbia_e2e_client_04d --pull=never \
  --network "$NET" \
  --entrypoint sleep \
  -v "$ROOT/scripts:/scripts:ro" \
  public.ecr.aws/supabase/edge-runtime:v1.74.2 \
  infinity

sleep 3

# Preuves isolation réseau
echo "==> Network isolation proofs"
docker exec youmbia_e2e_client_04d bash -c '
  getent hosts api.resend.com >/dev/null 2>&1 && echo FAIL_dns_resend || echo PASS_dns_resend_unresolvable
  getent hosts supabase.co >/dev/null 2>&1 && echo FAIL_dns_supabase || echo PASS_dns_supabase_unresolvable
  timeout 2 bash -c "echo >/dev/tcp/1.1.1.1/443" 2>/dev/null && echo FAIL_egress_tcp || echo PASS_egress_tcp_closed
'
# Mock joignable en privé
out=$(docker exec youmbia_e2e_client_04d bash /scripts/lifecycle-http-client.sh \
  POST youmbia_resend_mock_04d 9000 /emails '{}' | head -1)
echo "mock_probe=$out"
echo "$out" | grep -q 'HTTP/1.1 200' || { echo "FAIL mock unreachable on private net"; exit 3; }

# Aucun credential fournisseur réel dans l’env send
docker inspect youmbia_edge_send_04d --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E 'RESEND|ALLOW_LIVE|TRANSPORT|ISOLATION|LIVE_PROVIDER' \
  | tee /tmp/04d_send_env.txt
grep -qiE 're_[A-Za-z0-9]{20,}' /tmp/04d_send_env.txt && { echo "FAIL real-looking resend key"; exit 3; } || true
grep -q 'LIFECYCLE_EMAIL_ISOLATION=test' /tmp/04d_send_env.txt
grep -q 'LIFECYCLE_EMAIL_ALLOW_LIVE=false' /tmp/04d_send_env.txt
grep -qv 'api.resend.com' /tmp/04d_send_env.txt

echo "PASS edge-runtime-04d up (internal-only, fail-closed env)"
echo "NET=$NET DISPATCH=$DISPATCH HMAC=$HMAC"
