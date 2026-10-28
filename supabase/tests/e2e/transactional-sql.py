"""Run the rollback-only SQL smoke suite against the fixed local E2E database."""
import json
import os
from pathlib import Path
import subprocess
import urllib.parse

credentials_path = Path(os.environ.get('YMB_E2E_CREDENTIALS', '/private/tmp/ymb-e2e-credentials.json'))
credentials = json.loads(credentials_path.read_text())
if credentials.get('API_URL') != 'http://127.0.0.1:55421':
    raise SystemExit('STOP: unexpected local Supabase API identity')
database = urllib.parse.urlparse(credentials.get('DB_URL', ''))
if database.hostname != '127.0.0.1' or database.port != 55422:
    raise SystemExit('STOP: unexpected local Supabase database identity')

sql = Path(__file__).resolve().parents[1] / 'transactional_push.sql'
result = subprocess.run(
    ['psql', credentials['DB_URL'], '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', str(sql)],
    capture_output=True, text=True,
)
if result.returncode:
    raise SystemExit('FAIL transactional push SQL\n' + result.stderr[-4000:])
print('PASS transactional_push.sql on clean full baseline; fixture transaction rolled back')
