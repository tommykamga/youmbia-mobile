"""Apply sourced baseline + ordered repository deltas to the fixed local project only.
Usage: python3 .../bootstrap.py --web-root /path/to/Youmbia-web [--pre-push]
The local public schema must be empty; never overwrites it and never connects remotely.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--web-root', type=Path, required=True)
parser.add_argument('--pre-push', action='store_true')
args = parser.parse_args()
manifest = json.loads((Path(__file__).parent / 'baseline-manifest.json').read_text())
base = ['docker', 'exec', '-i', 'supabase_db_youmbia-push-e2e-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
identity = subprocess.check_output(base + ['-At', '-c', "select current_database(),current_setting('server_version'),to_regclass('public.listings');"], text=True).strip()
assert identity.startswith('postgres|17.') and identity.endswith('|'), 'STOP: expected empty local marketplace'
records = []
for file in manifest['files']:
    content = subprocess.check_output(['git', 'show', manifest['webRef'] + ':' + file], cwd=args.web_root)
    print('WEB', file, flush=True)
    subprocess.run(base, input=content, check=True)
    records.append({'source': file, 'sha256': hashlib.sha256(content).hexdigest()})
for name in ['observed-columns.sql', 'observed-grants.sql']:
    file = Path(__file__).parent / name
    print('OBSERVED SCHEMA', name, flush=True)
    subprocess.run(base, input=file.read_bytes(), check=True)
for file in sorted((root / 'supabase/migrations').glob('*.sql')):
    if args.pre_push and file.name >= '20261023200527': break
    print('MOBILE', file.name, flush=True)
    subprocess.run(base, input=file.read_bytes(), check=True)
    records.append({'source': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
Path('/private/tmp/ymb-e2e-baseline-hashes.json').write_text(json.dumps(records, indent=2))
print('PASS sourced baseline and ordered deltas; pre-push=', args.pre_push)
