"""Validate the existing mobile compatibility invocation on the real local Edge runtime.
Requires outbox flag ON before invoking: no Expo call can occur on this path.
"""
from pathlib import Path
import json
source = (Path(__file__).parent / 'backend.py').read_text()
exec(source[:source.index('buyer, seller, outsider =')])
assert rest('POST', 'rpc/transactional_message_push_enabled', {}) is True, 'STOP: outbox flag must neutralize legacy'
buyer, seller = user('legacy-buyer'), user('legacy-seller')
item = listing(seller); thread = conversation(buyer, seller, item)[0]
claim_token(seller, 'ExpoPushToken[e2e_legacy_device]')
msg = message(buyer, thread, 'legacy-compatibility')
before = send_count()
response = http('POST', '/functions/v1/send-message-push', {'message_id': msg['id']}, buyer['jwt'])
check(response.get('skipped') == 'server_outbox_enabled', 'real authenticated legacy Edge invocation is a no-op when server outbox is ON')
http('POST', '/functions/v1/send-message-push', {'message_id': msg['id'], 'recipient_id': buyer['id']}, buyer['jwt'], (400,))
check(send_count() == before, 'legacy invocation and injected receiver produce no push')
mock('_mode', {}); tick()
check(len(events(thread)) == 1 and len(deliveries(events(thread)[0])) == 1, 'outbox remains the sole dispatcher for legacy-mobile message')
Path('/private/tmp/ymb-e2e-legacy-results.json').write_text(json.dumps({'assertions': results}, indent=2))
