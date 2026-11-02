"""Exercise the branch's shop visibility and ownership policies over real local Auth/PostgREST."""
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import uuid

credentials_path = Path(os.environ.get('YMB_E2E_CREDENTIALS', '/private/tmp/ymb-e2e-credentials.json'))
creds = json.loads(credentials_path.read_text())
API = creds['API_URL']
assert API == 'http://127.0.0.1:55421', 'STOP: unexpected isolated API identity'
assert urllib.parse.urlparse(creds['DB_URL']).hostname == '127.0.0.1'
assert urllib.parse.urlparse(creds['DB_URL']).port == 55422
ANON, ADMIN = creds['ANON_KEY'], creds['SERVICE_ROLE_KEY']


def request(method, path, body=None, token=ADMIN, expected=(200, 201, 204)):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'apikey': ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    try:
        value = json.loads(raw) if raw else None
    except ValueError:
        value = None
    if status not in expected:
        code = value.get('code', value.get('error', '')) if isinstance(value, dict) else ''
        raise AssertionError(f'{method} {path.split("?")[0]} status={status} code={code}')
    return value


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    print('PASS', label, flush=True)


def user(label):
    suffix = uuid.uuid4().hex
    email = f'{label}-{suffix}@ymb-e2e.invalid'
    password = 'Synthetic-local-only-' + suffix
    created = request('POST', '/auth/v1/admin/users',
                      {'email': email, 'password': password, 'email_confirm': True})
    session = request('POST', '/auth/v1/token?grant_type=password',
                      {'email': email, 'password': password}, ANON)
    return {'id': created['id'], 'email': email, 'jwt': session['access_token']}


def shop(owner, status='active'):
    row = request('POST', '/rest/v1/shops', {
        'owner_id': owner['id'], 'name': 'Synthetic QA shop',
        'slug': 'qa-' + uuid.uuid4().hex, 'status': status,
    }, owner['jwt'])
    return row[0]


def listing(owner, shop_id):
    row = request('POST', '/rest/v1/listings', {
        'user_id': owner['id'], 'shop_id': shop_id,
        'title': 'Synthetic shop visibility listing',
        'description': 'Synthetic local-only fixture', 'price': 1000,
        'city': 'Synthetic City', 'status': 'active',
    }, owner['jwt'])
    return row[0]


def query_shops(ids, token):
    values = ','.join(ids)
    query = urllib.parse.urlencode({'select': 'id,status,owner_id', 'id': f'in.({values})'})
    return request('GET', '/rest/v1/shops?' + query, token=token)


events_before = request('GET', '/rest/v1/transactional_push_events?select=id', token=ADMIN)
owner, other = user('shop-owner'), user('shop-other')
active, hidden, suspended = shop(owner), shop(owner), shop(owner)
ids = [active['id'], hidden['id'], suspended['id']]
request('PATCH', '/rest/v1/shops?id=eq.' + hidden['id'], {'status': 'hidden'}, owner['jwt'])
request('PATCH', '/rest/v1/shops?id=eq.' + suspended['id'], {'status': 'suspended'},
        owner['jwt'], (400, 403))
check(query_shops([suspended['id']], ADMIN)[0]['status'] == 'active',
      'ordinary owner cannot set a shop to suspended')
request('POST', '/rest/v1/admin_users', {'email': owner['email']}, ADMIN)
request('PATCH', '/rest/v1/shops?id=eq.' + suspended['id'], {'status': 'suspended'}, owner['jwt'])
request('DELETE', '/rest/v1/admin_users?email=eq.' + urllib.parse.quote(owner['email']), token=ADMIN)
request('PATCH', '/rest/v1/profiles?id=eq.' + owner['id'],
        {'seller_type': 'pro', 'shop_id': active['id']}, ADMIN)
anonymous = query_shops(ids, ANON)
other_rows = query_shops(ids, other['jwt'])
owner_rows = query_shops(ids, owner['jwt'])
check({row['id'] for row in anonymous} == {active['id']},
      'anonymous visitors see active PRO shops only')
check({row['id'] for row in other_rows} == {active['id']},
      'authenticated non-owners see active shops only')
check({row['id'] for row in owner_rows} == set(ids),
      'shop owner can read own active, hidden and suspended shops')

# PostgREST embeds are subject to the joined shops RLS policy as well. Keep a
# public listing for each status and ensure the relationship cannot disclose an
# inactive shop, even when the parent listing itself is visible.
active_listing = listing(owner, active['id'])
hidden_listing = listing(owner, hidden['id'])
joined_query = urllib.parse.urlencode({
    'select': 'id,shops!listings_shop_id_fkey(id,status)',
    'id': f'in.({active_listing["id"]},{hidden_listing["id"]})',
})
joined = request('GET', '/rest/v1/listings?' + joined_query, token=ANON)
joined_by_id = {row['id']: row['shops'] for row in joined}
check(joined_by_id.get(active_listing['id'], {}).get('status') == 'active'
      and joined_by_id.get(hidden_listing['id']) is None,
      'PostgREST relation embed exposes active shops and redacts hidden shops')
inner_query = urllib.parse.urlencode({
    'select': 'id,shops!inner(id,status)',
    'id': f'in.({active_listing["id"]},{hidden_listing["id"]})',
})
inner_joined = request('GET', '/rest/v1/listings?' + inner_query, token=ANON)
check({row['id'] for row in inner_joined} == {active_listing['id']},
      'PostgREST inner relationship filter cannot surface hidden shops')

forged = request('POST', '/rest/v1/shops', {
    'owner_id': owner['id'], 'name': 'Forged shop', 'slug': 'qa-forged-' + uuid.uuid4().hex,
}, other['jwt'], (401, 403))
check(isinstance(forged, dict) and forged.get('code') == '42501',
      'non-owner cannot create a shop under another account')

request('PATCH', '/rest/v1/shops?id=eq.' + active['id'],
        {'name': 'Cross-account update'}, other['jwt'])
check(query_shops([active['id']], ADMIN)[0]['owner_id'] == owner['id'],
      'non-owner update cannot change another account shop')

request('PATCH', '/rest/v1/shops?id=eq.' + active['id'], {'status': 'hidden'}, owner['jwt'])
check(query_shops([active['id']], owner['jwt'])[0]['status'] == 'hidden',
      'owner can hide own active shop')

request('PATCH', '/rest/v1/shops?id=eq.' + active['id'], {'status': 'suspended'},
        owner['jwt'], (400, 403))
check(query_shops([active['id']], ADMIN)[0]['status'] == 'hidden',
      'owner cannot suspend a shop')
request('PATCH', '/rest/v1/shops?id=eq.' + suspended['id'], {'status': 'active'},
        owner['jwt'], (400, 403))
check(query_shops([suspended['id']], ADMIN)[0]['status'] == 'suspended',
      'owner cannot unsuspend a shop')

request('PATCH', '/rest/v1/shops?id=eq.' + active['id'], {'owner_id': other['id']},
        owner['jwt'], (400, 403))
check(query_shops([active['id']], ADMIN)[0]['owner_id'] == owner['id'],
      'owner identity cannot be transferred by client update')

request('DELETE', '/rest/v1/shops?id=eq.' + hidden['id'], token=owner['jwt'], expected=(401, 403))
check(len(query_shops([hidden['id']], ADMIN)) == 1,
      'client cannot delete a shop (no DELETE grant or policy)')

events_after = request('GET', '/rest/v1/transactional_push_events?select=id', token=ADMIN)
check(len(events_before) == len(events_after),
      'shop visibility/status changes do not create transactional push events')
print('PASS shops policy E2E; synthetic PRO owner and second authenticated account; no real notifications')
