"""Real local Auth/PostgREST/Edge runtime E2E. Expo is HTTP-simulated only.
Requires the isolated project, test adapter and mock described in README.md.
No cloud URL is accepted. Credentials are local and never printed.
"""
import concurrent.futures
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

creds = json.loads(Path('/private/tmp/ymb-e2e-credentials.json').read_text())
API = creds['API_URL']
assert API == 'http://127.0.0.1:55421', 'STOP: unexpected API identity'
assert urllib.parse.urlparse(creds['DB_URL']).hostname in ('127.0.0.1', 'localhost')
assert urllib.parse.urlparse(creds['DB_URL']).port == 55422
ENV = dict(line.split('=', 1) for line in Path('/private/tmp/ymb-e2e.env').read_text().strip().splitlines())
assert ENV['E2E_PROJECT_ID'] == 'youmbia-push-e2e-local'
SECRET = ENV['TRANSACTIONAL_PUSH_DISPATCH_SECRET']
ANON, ADMIN = creds['ANON_KEY'], creds['SERVICE_ROLE_KEY']
results = []

def check(ok, label):
    if not ok: raise AssertionError(label)
    results.append(label)
    print('PASS', label, flush=True)

def http(method, path, body=None, token=ADMIN, expected=(200, 201, 204), headers=None):
    assert path.startswith('/') and not path.startswith('//')
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'apikey': ANON, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
        'Prefer': 'return=representation', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=40) as response: status, raw = response.status, response.read()
    except urllib.error.HTTPError as error: status, raw = error.code, error.read()
    try: value = json.loads(raw) if raw else None
    except ValueError: value = None
    if status not in expected:
        code = value.get('code', value.get('error', '')) if isinstance(value, dict) else ''
        raise AssertionError(f'{method} {path.split("?")[0]} status={status} code={code}')
    return value

def rest(method, table, body=None, token=ADMIN, expected=(200, 201, 204)):
    return http(method, '/rest/v1/' + table, body, token, expected)

def mock(path, body=None):
    req = urllib.request.Request('http://127.0.0.1:55541/' + path, data=None if body is None else json.dumps(body).encode(),
        headers={'x-e2e-secret': SECRET, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response: return json.load(response)

def tick(body=None, secret=SECRET, expected=(200,)):
    return http('POST', '/functions/v1/e2e-dispatch', {} if body is None else body, ANON, expected, {'x-transactional-push-secret': secret})

def user(name):
    email = f'{name}-{uuid.uuid4().hex}@ymb-e2e.invalid'
    password = 'Synthetic-local-only-' + uuid.uuid4().hex
    created = http('POST', '/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True})
    session = http('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password}, ANON)
    token = session['access_token']
    who = http('GET', '/auth/v1/user', token=token)
    assert who['id'] == created['id']
    return {'id': who['id'], 'jwt': token}

def listing(owner, status='active'):
    return rest('POST', 'listings', {'title': 'Synthetic E2E listing', 'description': 'Synthetic marketplace data',
        'price': 1000, 'city': 'Synthetic City', 'status': status, 'user_id': owner['id']}, owner['jwt'])[0]

def conversation(buyer, seller, item, expected=(201,)):
    return rest('POST', 'conversations', {'listing_id': item['id'], 'buyer_id': buyer['id'], 'seller_id': seller['id']}, buyer['jwt'], expected)

def message(sender, thread, label='mobile'):
    return http('POST', '/rest/v1/messages', {'conversation_id': thread['id'], 'sender_id': sender['id'], 'body': 'PRIVATE_E2E_CONTENT_' + label},
        sender['jwt'], headers={'User-Agent': 'YOUMBIA-E2E-' + label})[0]

def events(thread): return rest('GET', 'transactional_push_events?target_id=eq.' + thread['id'])
def deliveries(event): return rest('GET', 'transactional_push_deliveries?event_id=eq.' + event['id'])
def due(row): rest('PATCH', 'transactional_push_deliveries?id=eq.' + row['id'], {'available_at': '2000-01-01T00:00:00Z'})
def claim_token(owner, token): return rest('POST', 'rpc/claim_my_push_token', {'p_expo_push_token': token, 'p_platform': 'android'}, owner['jwt'])
def remove_token(owner, token): return rest('DELETE', 'user_push_tokens?expo_push_token=eq.' + urllib.parse.quote(token), token=owner['jwt'])
def send_count(): return len(mock('_state')['sends'])

buyer, seller, outsider = user('buyer'), user('seller'), user('outsider')
check(True, 'real GoTrue users, login and JWT identity verified locally')
item = listing(seller)
thread = conversation(buyer, seller, item)[0]
claim_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
claim_token(seller, 'ExpoPushToken[e2e_seller_device_2]')
claim_token(buyer, 'ExpoPushToken[e2e_buyer_device]')
claim_token(outsider, 'ExpoPushToken[e2e_outsider_device]')
check(len(rest('GET', 'user_push_tokens', token=buyer['jwt'])) == 1, 'token RLS exposes only caller device')
rest('POST', 'conversations', {'listing_id': item['id'], 'buyer_id': buyer['id'], 'seller_id': seller['id']}, outsider['jwt'], (403,))
rest('POST', 'conversations', {'listing_id': item['id'], 'buyer_id': buyer['id'], 'seller_id': outsider['id']}, buyer['jwt'], (403,))
rest('PATCH', 'conversations?id=eq.' + thread['id'], {'seller_id': outsider['id']}, buyer['jwt'], (403,))
rest('PATCH', 'conversations?id=eq.' + thread['id'], {'buyer_id': outsider['id']}, seller['jwt'], (403,))
rest('PATCH', 'conversations?id=eq.' + thread['id'], {'listing_id': str(uuid.uuid4())}, buyer['jwt'], (403,))
check(rest('GET', 'conversations?id=eq.' + thread['id'], token=outsider['jwt']) == [], 'third-party conversation read denied through PostgREST')
rest('POST', 'messages', {'conversation_id': thread['id'], 'sender_id': outsider['id'], 'body': 'synthetic forbidden'}, outsider['jwt'], (403,))
rest('POST', 'messages', {'conversation_id': thread['id'], 'sender_id': seller['id'], 'body': 'synthetic spoof'}, buyer['jwt'], (403,))
rest('GET', 'transactional_push_events', token=outsider['jwt'], expected=(401, 403))
check(events(thread) == [], 'forbidden messages cannot leave outbox events')
rest('PATCH', 'transactional_push_config?singleton=eq.true', {'messages_enabled': True, 'favorites_enabled': True})
first, second, reply = message(buyer, thread, 'mobile'), message(buyer, thread, 'web'), message(seller, thread, 'mobile-reply')
rows = events(thread)
check(len(rows) == 3 and sum(row['first_contact'] for row in rows) == 1, 'Web/Mobile-equivalent HTTP messages create one event each and one first contact')
check(all(row['recipient_id'] == (buyer['id'] if row['source_id'] == reply['id'] else seller['id']) for row in rows), 'recipient computed exclusively from immutable conversation')
bad = rest('PATCH', 'conversations?id=eq.' + thread['id'], {'updated_at': '2026-10-23T00:00:00Z'}, buyer['jwt'], (400,))
check(bad.get('code') == 'PGRST204', 'schema rejects old nonexistent updated_at; mobile regression test now uses last_message_at')
rest('PATCH', 'conversations?id=eq.' + thread['id'], {'buyer_unread_count': 1, 'seller_unread_count': 0, 'last_message_at': '2026-10-23T00:00:00Z'}, seller['jwt'])
rest('POST', 'rpc/mark_conversation_read', {'p_conversation_id': thread['id']}, buyer['jwt'])
rest('PATCH', 'conversations?id=eq.' + thread['id'], {'buyer_unread_count': 0}, buyer['jwt'])
rest('POST', 'rpc/hide_conversation_for_me', {'p_conversation_id': thread['id']}, buyer['jwt'])
check(rest('GET', 'messages?id=eq.' + reply['id'], token=buyer['jwt'])[0]['read_at'] is not None, 'historical read RPC and unread metadata remain functional')
mock('_mode', {'reset': True})
tick(secret='untrusted', expected=(401,))
tick({'recipient_id': outsider['id']}, expected=(400,))
check(send_count() == 0, 'Edge HTTP authentication and payload injection rejected before sends')
# The normal production entrypoint remains OFF, even in this local project.
normal = http('POST', '/functions/v1/dispatch-transactional-push', {}, ANON, headers={'x-transactional-push-secret': SECRET})
check(normal.get('skipped') == 'disabled', 'normal dispatcher entrypoint remains OFF')
tick()
state = mock('_state')
check(len(state['sends']) == 5, 'actual Edge runtime to local HTTP Expo simulator fans out five recipient devices')
flat = [batch[0] for batch in state['sends']]
check(sum(payload['title'] == 'Un acheteur vous contacte' for payload in flat) == 2, 'first contact is one notification per seller device')
check('PRIVATE_E2E_CONTENT' not in json.dumps(flat) and all('e2e_outsider' not in payload['to'] for payload in flat), 'payloads exclude private content and outsider device')
expected_tokens = {first['id']: {'ExpoPushToken[e2e_seller_device_1]', 'ExpoPushToken[e2e_seller_device_2]'}, second['id']: {'ExpoPushToken[e2e_seller_device_1]', 'ExpoPushToken[e2e_seller_device_2]'}, reply['id']: {'ExpoPushToken[e2e_buyer_device]'}}
check(all(payload['to'] in expected_tokens[payload['data']['messageId']] and payload['data']['conversationId'] == thread['id'] for payload in flat), 'payload business IDs navigate to correct conversation with no sender delivery')
tick(); check(send_count() == 5, 'second dispatcher HTTP call does not duplicate accepted sends')
for event in rows:
    for delivery in deliveries(event): due(delivery)
tick()
check(all(row['state'] == 'delivered' for event in rows for row in deliveries(event)), 'HTTP receipts persist provider acceptance without resending')
check(send_count() == 5, 'receipt lookup sends no additional notification')
# P1, including insert/delete/reinsert cooldown and independent opt-out.
fav = rest('POST', 'favorites', {'user_id': outsider['id'], 'listing_id': item['id']}, outsider['jwt'])[0]
tick()
check(send_count() == 7 and all(batch[0]['data'].get('listingId') == item['id'] for batch in mock('_state')['sends'][5:]), 'favorite INSERT pushes correct listing to two owner devices')
rest('DELETE', 'favorites?id=eq.' + fav['id'], token=outsider['jwt'])
rest('POST', 'favorites', {'user_id': outsider['id'], 'listing_id': item['id']}, outsider['jwt'])
rest('POST', 'favorites', {'user_id': seller['id'], 'listing_id': item['id']}, seller['jwt'])
hidden = listing(seller, 'hidden')
rest('POST', 'favorites', {'user_id': outsider['id'], 'listing_id': hidden['id']}, outsider['jwt'])
rest('POST', 'transactional_push_preferences', {'user_id': seller['id'], 'favorites_enabled': False}, seller['jwt'])
other = listing(seller)
rest('POST', 'favorites', {'user_id': outsider['id'], 'listing_id': other['id']}, outsider['jwt'])
tick(); check(send_count() == 7, 'favorite removal/reinsert/self/inactive/opt-out generate no extra push; 24h owner-listing cooldown')
rest('PATCH', 'transactional_push_preferences?user_id=eq.' + seller['id'], {'favorites_enabled': True}, seller['jwt'])
# One device now: each explicit provider error corresponds to one durable delivery.
remove_token(seller, 'ExpoPushToken[e2e_seller_device_2]')
for mode in ['429', '500', 'rate']:
    msg = message(buyer, thread, mode); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
    mock('_mode', {'modes': [mode]}); before = send_count(); tick(); delivery = deliveries(event)[0]
    check(delivery['state'] == 'pending' and delivery['attempts'] == 1, mode + ' produces bounded retry state')
    tick(); check(send_count() == before + 1, mode + ' backoff blocks immediate resend')
    due(delivery); mock('_mode', {}); tick()
    check(deliveries(event)[0]['state'] == 'accepted' and deliveries(event)[0]['attempts'] == 2, mode + ' succeeds once after controlled backoff')
for mode in ['timeout', 'malformed']:
    msg = message(buyer, thread, mode); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
    mock('_mode', {'modes': [mode]}); before = send_count(); tick()
    check(deliveries(event)[0]['state'] == 'uncertain', mode + ' quarantines ambiguous send outcome')
    tick(); check(send_count() == before + 1, mode + ' never automatically resends')
# Exhaust actual durable retries, advancing only this synthetic delivery's due date.
msg = message(buyer, thread, 'bounded-retry'); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
for attempt in range(1, 6):
    mock('_mode', {'modes': ['500']}); tick(); delivery = deliveries(event)[0]
    assert delivery['attempts'] == attempt
    if attempt < 5: assert delivery['state'] == 'pending'; due(delivery)
check(deliveries(event)[0]['state'] == 'failed', 'real Edge/DB retries stop permanently after five explicit HTTP failures')
before = send_count(); tick(); check(send_count() == before, 'exhausted retry never sends again')
msg = message(buyer, thread, 'expired-claim'); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
rest('POST', 'rpc/claim_transactional_push', {'p_limit': 100})
delivery = deliveries(event)[0]
rest('PATCH', 'transactional_push_deliveries?id=eq.' + delivery['id'], {'claimed_at': '2000-01-01T00:00:00Z'})
before = send_count(); tick()
check(deliveries(event)[0]['state'] == 'uncertain' and send_count() == before, 'expired native DB claim is quarantined without resend')
msg = message(buyer, thread, 'dnr'); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
mock('_mode', {'modes': ['dnr']}); tick()
check(rest('GET', 'user_push_tokens?user_id=eq.' + seller['id']) == [] and deliveries(event) == [], 'DeviceNotRegistered safely revokes matching device, no crash')
claim_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
# Late receipt must not remove a newly registered version of the same device.
msg = message(buyer, thread, 'receipt-version'); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
mock('_mode', {}); tick(); due(deliveries(event)[0]); claim_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
mock('_mode', {'receipts': 'dnr'}); tick()
check(len(rest('GET', 'user_push_tokens?user_id=eq.' + seller['id'])) == 1, 'late DeviceNotRegistered receipt cannot revoke a renewed token version')
msg = message(buyer, thread, 'receipt-dnr'); event = next(row for row in events(thread) if row['source_id'] == msg['id'])
mock('_mode', {}); tick(); due(deliveries(event)[0]); mock('_mode', {'receipts': 'dnr'}); tick()
check(rest('GET', 'user_push_tokens?user_id=eq.' + seller['id']) == [], 'DeviceNotRegistered receipt removes only the matching current registration')
mock('_mode', {}); claim_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
# Connected logout versus server-unknown offline logout.
remove_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
message(buyer, thread, 'connected-logout'); before = send_count(); tick()
check(send_count() == before, 'connected token unsubscribe prevents subsequent sends to device')
claim_token(seller, 'ExpoPushToken[e2e_seller_device_1]')
message(seller, thread, 'offline-account-A'); before = send_count(); tick()
check(send_count() == before + 1, 'offline logout without a server request leaves account A device eligible: residual risk confirmed')
claim_token(outsider, 'ExpoPushToken[e2e_buyer_device]')
message(seller, thread, 'after-account-transfer'); before = send_count(); tick()
check(send_count() == before, 'reconnection and atomic token reassignment stop future sends for previous account A')
# Actual concurrent HTTP creation uses distinct generated UUIDs and database uniqueness.
concurrent_listing = listing(seller)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    calls = list(pool.map(lambda _: conversation(buyer, seller, concurrent_listing, (201, 409)), range(2)))
threads = rest('GET', 'conversations?listing_id=eq.' + concurrent_listing['id'], token=buyer['jwt'])
check(len(threads) == 1, 'concurrent PostgREST INSERTs retain exactly one conversation')
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    list(pool.map(lambda label: message(buyer, threads[0], label), ['web-race', 'mobile-race']))
check(len(events(threads[0])) == 2 and sum(row['first_contact'] for row in events(threads[0])) == 1, 'concurrent HTTP messages retain two events and one first contact')
before = send_count()
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    list(pool.map(lambda _: tick(), range(2)))
check(send_count() == before + 2, 'concurrent Edge workers claim each recipient delivery once')
Path('/private/tmp/ymb-e2e-results.json').write_text(json.dumps({'api': API, 'project': ENV['E2E_PROJECT_ID'], 'assertions': results,
    'thread_id': thread['id'], 'seller_id': seller['id'], 'buyer_id': buyer['id'], 'buyer_jwt_not_exported': True,
    'tests_are_not_physical_delivery': True}, indent=2))
print('PASS BACKEND E2E', len(results), 'assertions; Expo fully simulated; no physical delivery claim', flush=True)
