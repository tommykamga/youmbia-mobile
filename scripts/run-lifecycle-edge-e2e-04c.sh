#!/usr/bin/env bash
# Scénarios HTTP Edge Runtime Lot 04C — 127.0.0.1 only, Resend mock interne.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PGPASSWORD=postgres

DISPATCH=lot04c-dispatch-test-only
HMAC=lot04c-hmac-test-only
WHSEC_RAW=$(printf 'test-secret-webhook!!!' | base64)
WHSEC="whsec_${WHSEC_RAW}"

SEND=http://127.0.0.1:19071
UNSUB=http://127.0.0.1:19072
WEBHOOK=http://127.0.0.1:19073
MOCK=http://127.0.0.1:19080

USER_ID=c1111111-1111-4111-8111-111111111111
EMAIL=e2e04c@example.test

hmac_hex() {
  local msg=$1
  HMAC_SECRET="$HMAC" MSG="$msg" python3 - <<'PY'
import hmac, hashlib, os
print(hmac.new(os.environ["HMAC_SECRET"].encode(), os.environ["MSG"].encode(), hashlib.sha256).hexdigest())
PY
}

mock_posts() {
  curl -sS "$MOCK/_stats" | python3 -c "import sys,json; print(json.load(sys.stdin).get('posts',-1))"
}

jwt_token() {
  python3 - <<'PY'
import base64, hashlib, hmac, json
secret = b'super-secret-jwt-token-with-at-least-32-characters-long'
def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
header = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':')).encode())
payload = b64(json.dumps({"role":"postgres","iss":"supabase"}, separators=(',',':')).encode())
sig = b64(hmac.new(secret, f'{header}.{payload}'.encode(), hashlib.sha256).digest())
print(f'{header}.{payload}.{sig}')
PY
}

# Restart send-lifecycle-email with explicit ALLOW_LIVE (false = dry-run, true = mock transport).
restart_send() {
  local allow_live=$1
  local JWT SECRET_KEYS
  JWT=$(jwt_token)
  SECRET_KEYS=$(JWT="$JWT" python3 -c "import json,os; print(json.dumps({'default':os.environ['JWT']}))")
  docker rm -f youmbia_edge_send_04c >/dev/null
  docker run -d --name youmbia_edge_send_04c --pull=never \
    --network bridge -p 127.0.0.1:19071:9000 \
    -v "$ROOT/supabase/functions:/home/deno/functions:ro" \
    -e SUPABASE_URL=http://youmbia_rest_proxy_04c:9000 \
    -e "SUPABASE_SECRET_KEYS=${SECRET_KEYS}" \
    -e LIFECYCLE_EMAIL_HMAC_SECRET="$HMAC" \
    -e LIFECYCLE_EMAIL_DISPATCH_SECRET="$DISPATCH" \
    -e LIFECYCLE_RESEND_WEBHOOK_SECRET="$WHSEC" \
    -e LIFECYCLE_PUBLIC_FUNCTIONS_BASE=http://127.0.0.1:19072 \
    -e LIFECYCLE_RESEND_BASE_URL=http://youmbia_resend_mock_04c:9000 \
    -e LIFECYCLE_RESEND_API_KEY=re_test_isolated_not_live \
    -e "LIFECYCLE_EMAIL_ALLOW_LIVE=${allow_live}" \
    public.ecr.aws/supabase/edge-runtime:v1.74.2 \
    start --main-service /home/deno/functions/send-lifecycle-email -i 0.0.0.0 -p 9000
  docker network connect youmbia_lifecycle_p0_04b youmbia_edge_send_04c
  sleep 2
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$SEND/" -d '{}' | grep -qE '401|200' \
    || { docker logs youmbia_edge_send_04c 2>&1 | tail -30; exit 3; }
}

reset_welcome_pending() {
  psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.email_suppressions WHERE email='${EMAIL}';
UPDATE public.email_preferences SET marketing_opt_in=true, unsubscribed_at=NULL, marketing_opt_in_source='signup'
WHERE user_id='${USER_ID}';
UPDATE public.lifecycle_email_outbox SET status='pending', claim_id=NULL, claimed_at=NULL, last_error=NULL,
  scheduled_for=now()-interval '1 minute'
WHERE user_id='${USER_ID}' AND campaign_id='welcome_h0';
SQL
}

echo "==> Ensure send boots with ALLOW_LIVE=false (dry-run)"
restart_send false

echo "==> Reset kill switch ON + seed claimable welcome"
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
UPDATE public.app_runtime_flags SET value = 'true' WHERE key = 'lifecycle_email_kill_switch';
INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
VALUES ('${USER_ID}', '${EMAIL}', now() - interval '3 hours', '{"marketing_opt_in":"true"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
VALUES ('${USER_ID}', true, now(), 'signup')
ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in = true, unsubscribed_at = NULL;
INSERT INTO public.profiles (id, full_name, is_banned)
VALUES ('${USER_ID}', 'E2E 04C', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES (
  '${USER_ID}', 'welcome_h0', 'e2e04c-welcome',
  '${EMAIL}', 'pending', now() - interval '1 minute'
)
ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
SET status = 'pending', claim_id = NULL, claimed_at = NULL, last_error = NULL,
    scheduled_for = now() - interval '1 minute';
SQL

before=$(mock_posts)

echo "==> Kill switch ON → send (claim empty, mock unchanged)"
code=$(curl -sS -o /tmp/send1.json -w '%{http_code}' -X POST "$SEND/" \
  -H "X-Lifecycle-Email-Dispatch-Secret: $DISPATCH" -H 'content-type: application/json' -d '{}')
echo "send_killpath_http=$code body=$(cat /tmp/send1.json)"
python3 - <<'PY'
import json
b=json.load(open('/tmp/send1.json'))
assert b.get('ok') is True
assert b.get('dry_run') is True
assert b.get('skipped') == 'no_claim' or int(b.get('sent') or 0) == 0
PY
after1=$(mock_posts)
[[ "$after1" == "$before" ]] || { echo "FAIL mock called under kill_switch"; exit 1; }
echo "PASS kill_switch_on_no_provider_call mock=$after1"

echo "==> Unauthorized"
code=$(curl -sS -o /tmp/unauth.json -w '%{http_code}' -X POST "$SEND/" -d '{}')
[[ "$code" == "401" ]] || { echo "FAIL unauth $code"; exit 1; }
echo "PASS send_unauthorized"

echo "==> Webhook invalid signature"
code=$(curl -sS -o /tmp/whbad.json -w '%{http_code}' -X POST "$WEBHOOK/" \
  -H 'svix-id: msg_x' -H "svix-timestamp: $(date +%s)" -H 'svix-signature: v1,AAAA' \
  -H 'content-type: application/json' -d '{"type":"email.bounced"}')
[[ "$code" == "401" ]] || { echo "FAIL wh bad $code"; exit 1; }
echo "PASS webhook_invalid_signature"

echo "==> Webhook hard bounce"
body='{"type":"email.bounced","data":{"to":"bounce04c@example.test","bounce":{"type":"hard"},"email_id":"re_b1"}}'
id=msg_bounce_1
ts=$(date +%s)
sig=$(printf '%s' "${id}.${ts}.${body}" | openssl dgst -sha256 -mac HMAC -macopt key:test-secret-webhook!!! -binary | base64)
code=$(curl -sS -o /tmp/whok.json -w '%{http_code}' -X POST "$WEBHOOK/" \
  -H "svix-id: $id" -H "svix-timestamp: $ts" -H "svix-signature: v1,${sig}" \
  -H 'content-type: application/json' -d "$body")
echo "webhook_bounce_http=$code $(cat /tmp/whok.json)"
[[ "$code" == "200" ]] || exit 1
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -tAc \
  "SELECT reason FROM public.email_suppressions WHERE email='bounce04c@example.test'" | grep -q hard_bounce
echo "PASS webhook_hard_bounce"

echo "==> Unsubscribe GET then POST"
ts=$(date +%s)
sig=$(hmac_hex "${USER_ID}|${EMAIL}|${ts}")
q="uid=${USER_ID}&email=${EMAIL}&ts=${ts}&sig=${sig}"
code=$(curl -sS -o /tmp/uget.html -w '%{http_code}' "$UNSUB/?$q")
[[ "$code" == "200" ]] || exit 1
grep -q 'Confirmer' /tmp/uget.html
code=$(curl -sS -o /tmp/upost.txt -w '%{http_code}' -X POST "$UNSUB/?$q" -H 'Accept: application/json')
[[ "$code" == "200" ]] || { echo "FAIL unsub post $code $(cat /tmp/upost.txt)"; exit 1; }
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -tAc \
  "SELECT marketing_opt_in::text FROM public.email_preferences WHERE user_id='${USER_ID}'" | grep -qx false
echo "PASS unsubscribe_rfc8058"

echo "==> Restore opt-in + dry-run three campaigns"
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.email_suppressions WHERE email='${EMAIL}';
UPDATE public.email_preferences SET marketing_opt_in=true, unsubscribed_at=NULL, marketing_opt_in_source='signup'
WHERE user_id='${USER_ID}';
UPDATE public.lifecycle_email_outbox SET status='skipped', sent_at=NULL
WHERE user_id='${USER_ID}' AND status IN ('pending','claimed','sent');
WITH draft AS (
  INSERT INTO public.listings (user_id, title, status, updated_at, last_published_at, description, price, city)
  VALUES ('${USER_ID}', 'Draft E2E 04C', 'draft', now()-interval '25 hours', NULL, 'e2e', 0, 'Douala')
  RETURNING id
)
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
SELECT '${USER_ID}', 'abandoned_draft_h24', draft.id::text, '${EMAIL}', 'pending', now()-interval '1 minute'
FROM draft;
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES
  ('${USER_ID}', 'welcome_h0', 'e2e04c-welcome-dr', '${EMAIL}', 'pending', now()-interval '1 minute'),
  ('${USER_ID}', 'first_listing_h24', 'e2e04c-fl-dr', '${EMAIL}', 'pending', now()-interval '1 minute')
ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
SET status='pending', claim_id=NULL, claimed_at=NULL, last_error=NULL, scheduled_for=now()-interval '1 minute';
UPDATE public.app_runtime_flags SET value='false' WHERE key='lifecycle_email_kill_switch';
SQL
before=$(mock_posts)
code=$(curl -sS -o /tmp/send2.json -w '%{http_code}' -X POST "$SEND/" \
  -H "X-Lifecycle-Email-Dispatch-Secret: $DISPATCH" -H 'content-type: application/json' -d '{}')
echo "send_dryrun_http=$code $(cat /tmp/send2.json)"
[[ "$code" == "200" ]] || exit 1
python3 - <<'PY'
import json
b=json.load(open('/tmp/send2.json'))
assert b.get('dry_run') is True, b
assert b.get('ok') is True
assert int(b.get('claimed') or 0) >= 3, b
# Dry-run defers via skipped (not provider sent)
assert int(b.get('skipped') or 0) >= 1, b
assert int(b.get('sent') or 0) == 0, b
PY
after=$(mock_posts)
[[ "$after" == "$before" ]] || { echo "FAIL dry-run hit mock"; exit 1; }
echo "PASS campaigns_dry_run_no_provider claimed=$(python3 -c "import json;print(json.load(open('/tmp/send2.json'))['claimed'])")"

echo "==> Positive mock transport (ALLOW_LIVE=true + mock base URL)"
restart_send true
OCC=$(python3 -c "import uuid; print('e2e04c-live-'+uuid.uuid4().hex[:8])")
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.email_suppressions WHERE email='${EMAIL}';
UPDATE public.email_preferences SET marketing_opt_in=true, unsubscribed_at=NULL, marketing_opt_in_source='signup'
WHERE user_id='${USER_ID}';
-- Éviter frequency_cap (7j) des envois mock précédents sur le même user.
UPDATE public.lifecycle_email_outbox SET status='skipped', sent_at=NULL
WHERE user_id='${USER_ID}' AND status='sent';
INSERT INTO public.lifecycle_email_outbox (user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for)
VALUES ('${USER_ID}', 'welcome_h0', '${OCC}', '${EMAIL}', 'pending', now()-interval '1 minute');
UPDATE public.app_runtime_flags SET value='false' WHERE key='lifecycle_email_kill_switch';
SQL
before=$(mock_posts)
code=$(curl -sS -o /tmp/send3.json -w '%{http_code}' -X POST "$SEND/" \
  -H "X-Lifecycle-Email-Dispatch-Secret: $DISPATCH" -d '{}')
echo "send_live_mock_http=$code $(cat /tmp/send3.json)"
after=$(mock_posts)
echo "mock_posts before=$before after=$after"
[[ "$code" == "200" ]] || exit 1
python3 - <<'PY'
import json
b=json.load(open('/tmp/send3.json'))
assert b.get('ok') is True, b
assert b.get('dry_run') is False, b
assert int(b.get('sent') or 0) >= 1, b
PY
[[ "$after" -gt "$before" ]] || { echo "FAIL sent but mock not called"; exit 1; }
echo "PASS positive_mock_transport"

echo "==> Restore kill switch ON + send ALLOW_LIVE=false"
restart_send false
psql -h 127.0.0.1 -p 54322 -U postgres -d youmbia_lifecycle_p0_04b -c \
  "UPDATE public.app_runtime_flags SET value='true' WHERE key='lifecycle_email_kill_switch';"
echo "PASS scripts/run-lifecycle-edge-e2e-04c.sh"
