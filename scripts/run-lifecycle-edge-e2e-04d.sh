#!/usr/bin/env bash
# Lot 04D — E2E sécurité depuis le réseau privé (--internal), zéro bridge Internet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PGPASSWORD=postgres

CLIENT=youmbia_e2e_client_04d
DISPATCH=lot04d-dispatch-test-only
HMAC=lot04d-hmac-test-only
WHSEC_RAW=$(printf 'test-secret-webhook!!!' | base64)
USER_ID=d1111111-1111-4111-8111-111111111111
EMAIL=e2e04d@example.test

http() {
  # args forwarded to lifecycle-http-client.sh ; prints full response
  docker exec "$CLIENT" bash /scripts/lifecycle-http-client.sh "$@"
}

http_code() {
  http "$@" | head -1 | awk '{print $2}'
}

http_body() {
  http "$@" | awk 'BEGIN{b=0} /^\r?$/{b=1;next} b{print}' 
}

mock_posts() {
  docker exec "$CLIENT" bash /scripts/lifecycle-http-client.sh \
    GET youmbia_resend_mock_04d 9000 /_stats \
    | awk 'BEGIN{b=0} /^\r?$/{b=1;next} b{print}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('posts',-1))"
}

hmac_hex() {
  HMAC_SECRET="$HMAC" MSG="$1" python3 - <<'PY'
import hmac, hashlib, os
print(hmac.new(os.environ["HMAC_SECRET"].encode(), os.environ["MSG"].encode(), hashlib.sha256).hexdigest())
PY
}

restart_send() {
  # Recrée TOUJOURS le conteneur avec env explicite (pas d’héritage).
  local allow=$1 transport=$2
  local JWT SECRET_KEYS
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
  docker rm -f youmbia_edge_send_04d >/dev/null
  docker run -d --name youmbia_edge_send_04d --pull=never \
    --network youmbia_lifecycle_p0_04d \
    -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
    -e SUPABASE_URL=http://youmbia_rest_proxy_04d:9000 \
    -e "SUPABASE_SECRET_KEYS=${SECRET_KEYS}" \
    -e LIFECYCLE_EMAIL_HMAC_SECRET="$HMAC" \
    -e LIFECYCLE_EMAIL_DISPATCH_SECRET="$DISPATCH" \
    -e LIFECYCLE_RESEND_WEBHOOK_SECRET="whsec_${WHSEC_RAW}" \
    -e LIFECYCLE_PUBLIC_FUNCTIONS_BASE=http://youmbia_edge_unsub_04d:9000 \
    -e LIFECYCLE_RESEND_BASE_URL=http://youmbia_resend_mock_04d:9000 \
    -e LIFECYCLE_RESEND_API_KEY=re_test_isolated_not_live \
    -e LIFECYCLE_EMAIL_ISOLATION=test \
    -e "LIFECYCLE_EMAIL_ALLOW_LIVE=${allow}" \
    -e "LIFECYCLE_EMAIL_TRANSPORT=${transport}" \
    -e LIFECYCLE_EMAIL_LIVE_PROVIDER=false \
    public.ecr.aws/supabase/edge-runtime:v1.74.2 \
    start --main-service /home/deno/functions/send-lifecycle-email -i 0.0.0.0 -p 9000
  sleep 2
}

seed_user() {
  psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
VALUES ('${USER_ID}', '${EMAIL}', now()-interval '3 hours', '{"marketing_opt_in":"true"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
VALUES ('${USER_ID}', true, now(), 'signup')
ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in=true, unsubscribed_at=NULL;
INSERT INTO public.profiles (id, full_name, is_banned)
VALUES ('${USER_ID}', 'E2E 04D', false)
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.email_suppressions WHERE email='${EMAIL}';
SQL
}

docker inspect "$CLIENT" >/dev/null 2>&1 \
  || { echo "BLOCKED: run scripts/run-lifecycle-edge-runtime-04d.sh first"; exit 3; }

echo "==> Isolation re-check"
docker exec "$CLIENT" bash -c '
  getent hosts api.resend.com >/dev/null 2>&1 && exit 11 || true
  getent hosts supabase.co >/dev/null 2>&1 && exit 12 || true
  timeout 2 bash -c "echo >/dev/tcp/1.1.1.1/443" 2>/dev/null && exit 13 || true
'
echo "PASS private_net_no_cloud_dns_no_egress"

echo "==> Kill switch ON + seed"
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
UPDATE public.app_runtime_flags SET value='true' WHERE key='lifecycle_email_kill_switch';
SQL
seed_user
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES ('${USER_ID}', 'welcome_h0', 'e2e04d-ks', '${EMAIL}', 'pending', now()-interval '1 minute')
ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
SET status='pending', claim_id=NULL, claimed_at=NULL, last_error=NULL, scheduled_for=now()-interval '1 minute';
SQL

restart_send false dry_run
before=$(mock_posts)
code=$(http_code POST youmbia_edge_send_04d 9000 / '{}' \
  "X-Lifecycle-Email-Dispatch-Secret: ${DISPATCH}")
echo "kill_switch_http=$code"
[[ "$code" == "200" ]]
after=$(mock_posts)
[[ "$after" == "$before" ]] || { echo "FAIL provider call under kill switch"; exit 1; }
echo "PASS kill_switch_zero_provider"

echo "==> Unauthorized"
code=$(http_code POST youmbia_edge_send_04d 9000 / '{}')
[[ "$code" == "401" ]] || { echo "FAIL unauth $code"; exit 1; }
echo "PASS unauthorized"

echo "==> ALLOW_LIVE=true hérité SANS transport mock → blocked, mock inchangé"
restart_send true ""
before=$(mock_posts)
raw=$(http POST youmbia_edge_send_04d 9000 / '{}' "X-Lifecycle-Email-Dispatch-Secret: ${DISPATCH}")
code=$(echo "$raw" | head -1 | awk '{print $2}')
echo "$raw" | awk 'BEGIN{b=0} /^\r?$/{b=1;next} b{print}' > /tmp/04d_accidental.json
echo "accidental_live_http=$code body=$(cat /tmp/04d_accidental.json)"
[[ "$code" == "500" ]] || { echo "FAIL expected 500 blocked got $code"; exit 1; }
python3 -c "import json; b=json.load(open('/tmp/04d_accidental.json')); assert b.get('error')=='provider_transport_blocked'"
after=$(mock_posts)
[[ "$after" == "$before" ]] || { echo "FAIL external/mock call on blocked transport"; exit 1; }
echo "PASS allow_live_without_transport_blocked"

echo "==> ALLOW_LIVE + TRANSPORT=mock but BASE would be resend — recreate with evil base"
docker rm -f youmbia_edge_send_04d >/dev/null
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
docker run -d --name youmbia_edge_send_04d --pull=never \
  --network youmbia_lifecycle_p0_04d \
  -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
  -e SUPABASE_URL=http://youmbia_rest_proxy_04d:9000 \
  -e "SUPABASE_SECRET_KEYS=${SECRET_KEYS}" \
  -e LIFECYCLE_EMAIL_HMAC_SECRET="$HMAC" \
  -e LIFECYCLE_EMAIL_DISPATCH_SECRET="$DISPATCH" \
  -e LIFECYCLE_RESEND_WEBHOOK_SECRET="whsec_${WHSEC_RAW}" \
  -e LIFECYCLE_PUBLIC_FUNCTIONS_BASE=http://youmbia_edge_unsub_04d:9000 \
  -e LIFECYCLE_RESEND_BASE_URL=https://api.resend.com \
  -e LIFECYCLE_RESEND_API_KEY=re_test_isolated_not_live \
  -e LIFECYCLE_EMAIL_ISOLATION=test \
  -e LIFECYCLE_EMAIL_ALLOW_LIVE=true \
  -e LIFECYCLE_EMAIL_TRANSPORT=mock \
  -e LIFECYCLE_EMAIL_LIVE_PROVIDER=false \
  public.ecr.aws/supabase/edge-runtime:v1.74.2 \
  start --main-service /home/deno/functions/send-lifecycle-email -i 0.0.0.0 -p 9000
sleep 2
before=$(mock_posts)
code=$(http_code POST youmbia_edge_send_04d 9000 / '{}' \
  "X-Lifecycle-Email-Dispatch-Secret: ${DISPATCH}")
echo "evil_base_http=$code"
[[ "$code" == "500" ]]
after=$(mock_posts)
[[ "$after" == "$before" ]]
echo "PASS api_resend_com_blocked_in_test_even_with_allow_live"

echo "==> Webhook signature invalide → aucune mutation"
before_sup=$(psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -tAc \
  "SELECT count(*) FROM public.email_suppressions")
code=$(http_code POST youmbia_edge_webhook_04d 9000 / \
  '{"type":"email.bounced","data":{"to":"evil04d@example.test","bounce":{"type":"hard"}}}' \
  'svix-id: msg_x' "svix-timestamp: $(date +%s)" 'svix-signature: v1,AAAA' \
  'content-type: application/json')
[[ "$code" == "401" ]]
after_sup=$(psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -tAc \
  "SELECT count(*) FROM public.email_suppressions")
[[ "$before_sup" == "$after_sup" ]]
echo "PASS webhook_invalid_no_mutation"

echo "==> Consentement révoqué → zéro envoi mock"
restart_send true mock
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
UPDATE public.app_runtime_flags SET value='false' WHERE key='lifecycle_email_kill_switch';
UPDATE public.email_preferences SET marketing_opt_in=false, unsubscribed_at=now()
WHERE user_id='${USER_ID}';
UPDATE public.lifecycle_email_outbox SET status='skipped' WHERE user_id='${USER_ID}';
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES ('${USER_ID}', 'welcome_h0', 'e2e04d-noconsent', '${EMAIL}', 'pending', now()-interval '1 minute')
ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
SET status='pending', claim_id=NULL, claimed_at=NULL, last_error=NULL, scheduled_for=now()-interval '1 minute';
SQL
before=$(mock_posts)
raw=$(http POST youmbia_edge_send_04d 9000 / '{}' "X-Lifecycle-Email-Dispatch-Secret: ${DISPATCH}")
echo "$raw" | head -1
echo "$raw" | awk 'BEGIN{b=0} /^\r?$/{b=1;next} b{print}' > /tmp/04d_noconsent.json
echo "noconsent_body=$(cat /tmp/04d_noconsent.json)"
python3 -c "import json; b=json.load(open('/tmp/04d_noconsent.json')); assert b.get('ok') is True; assert int(b.get('sent') or 0)==0"
after=$(mock_posts)
[[ "$after" == "$before" ]]
echo "PASS no_consent_zero_provider"

echo "==> Mock positif (TRANSPORT=mock + BASE mock interne)"
seed_user
OCC=$(python3 -c "import uuid; print('e2e04d-live-'+uuid.uuid4().hex[:8])")
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
UPDATE public.app_runtime_flags SET value='false' WHERE key='lifecycle_email_kill_switch';
UPDATE public.lifecycle_email_outbox SET status='skipped', sent_at=NULL
WHERE user_id='${USER_ID}' AND status IN ('pending','claimed','sent');
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES ('${USER_ID}', 'welcome_h0', '${OCC}', '${EMAIL}', 'pending', now()-interval '1 minute');
SQL
before=$(mock_posts)
raw=$(http POST youmbia_edge_send_04d 9000 / '{}' "X-Lifecycle-Email-Dispatch-Secret: ${DISPATCH}")
echo "$raw" | awk 'BEGIN{b=0} /^\r?$/{b=1;next} b{print}' > /tmp/04d_mockpos.json
echo "mock_positive_body=$(cat /tmp/04d_mockpos.json)"
python3 -c "import json; b=json.load(open('/tmp/04d_mockpos.json')); assert b.get('ok') and b.get('transport')=='mock' and int(b.get('sent') or 0)>=1"
after=$(mock_posts)
[[ "$after" -gt "$before" ]] || { echo "FAIL mock not incremented"; exit 1; }
echo "PASS mock_positive_only_to_mock posts=$before->$after"

echo "==> Restore kill switch ON + dry_run send"
restart_send false dry_run
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -c \
  "UPDATE public.app_runtime_flags SET value='true' WHERE key='lifecycle_email_kill_switch';"
echo "PASS scripts/run-lifecycle-edge-e2e-04d.sh"
