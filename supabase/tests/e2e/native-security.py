"""Run native RLS/ACL checks on fresh GoTrue identities and remove the fixtures afterward."""
import json
import os
from pathlib import Path
import subprocess

credentials_path = Path(os.environ.get('YMB_E2E_CREDENTIALS', '/private/tmp/ymb-e2e-credentials.json'))
credentials = json.loads(credentials_path.read_text())
assert credentials['API_URL'] == 'http://127.0.0.1:55421', 'STOP: unexpected local API'
assert '127.0.0.1:55422' in credentials['DB_URL'], 'STOP: unexpected local database'

source = (Path(__file__).parent / 'backend.py').read_text()
exec(source[:source.index('buyer, seller, outsider =')])
buyer = seller = None
try:
    buyer, seller = user('native-security-buyer'), user('native-security-seller')
    item = listing(seller)
    thread = conversation(buyer, seller, item)[0]
    sql = Path(__file__).with_name('native-security.sql')
    command = [
        'psql', credentials['DB_URL'], '-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '-v', 'buyer=' + buyer['id'], '-v', 'thread=' + thread['id'], '-f', str(sql),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('FAIL native security SQL\n' + result.stderr[-4000:])
    print('PASS ' + result.stdout.strip().splitlines()[-1].replace('PASS ', ''))
finally:
    for fixture in (buyer, seller):
        if fixture:
            http('DELETE', '/auth/v1/admin/users/' + fixture['id'], expected=(200, 204))
    print('PASS native-security fixtures removed through local Auth admin API')
