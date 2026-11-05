"""Upgrade the pre-push local schema with fictional data and assert preservation.
Uses the prelude/API guards from backend.py, without running its scenario suite.
"""
from pathlib import Path
import json
import subprocess

source = (Path(__file__).parent / 'backend.py').read_text()
exec(source[:source.index("buyer, seller, outsider =")])
root = Path(__file__).resolve().parents[3]
SQL = ['docker', 'exec', '-i', 'supabase_db_youmbia-push-e2e-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
buyer, seller = user('upgrade-buyer'), user('upgrade-seller')
item = listing(seller)
thread = conversation(buyer, seller, item)[0]
message(buyer, thread, 'upgrade-preserved')
rest('POST', 'favorites', {'user_id': buyer['id'], 'listing_id': item['id']}, buyer['jwt'])
claim_token(buyer, 'ExpoPushToken[e2e_upgrade_device]')
rest('GET', 'user_push_tokens', token=buyer['jwt'], expected=(403,))
check(True, 'pre-upgrade real JWT token lookup denied by missing table grants (42501)')
query = """select jsonb_build_object('users',(select jsonb_agg(id order by id) from auth.users),
'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),
'listings',(select jsonb_agg(to_jsonb(l) order by id) from listings l),
'conversations',(select jsonb_agg(to_jsonb(c) order by id) from conversations c),
'messages',(select jsonb_agg(to_jsonb(m) order by id) from messages m),
'favorites',(select jsonb_agg(to_jsonb(f) order by id) from favorites f),
'push_tokens',(select jsonb_agg(to_jsonb(t) order by id) from user_push_tokens t));"""
before = subprocess.check_output(SQL + ['-c', query], text=True).strip()
files = [file for file in sorted((root / 'supabase/migrations').glob('*.sql')) if file.name >= '20261023200527']
for file in files:
    print('UPGRADE', file.name, flush=True)
    subprocess.run(SQL, input=file.read_text(), text=True, check=True)
after = subprocess.check_output(SQL + ['-c', query], text=True).strip()
check(json.loads(before) == json.loads(after), 'all fictional business rows preserved byte-for-byte through three push/security/grant migrations')
check(rest('GET', 'transactional_push_events') == [], 'upgrade performs no historical message/favorite backfill')
check(not rest('GET', 'transactional_push_config')[0]['messages_enabled'], 'upgrade flags remain OFF')
check(len(rest('GET', 'user_push_tokens', token=buyer['jwt'])) == 1, 'explicit grants restore owner-only lookup via real JWT')
remove_token(buyer, 'ExpoPushToken[e2e_upgrade_device]')
check(rest('GET', 'user_push_tokens', token=buyer['jwt']) == [], 'explicit grants restore connected logout unsubscribe')
Path('/private/tmp/ymb-e2e-upgrade-results.json').write_text(json.dumps({'assertions': results, 'migrations': [file.name for file in files]}, indent=2))
