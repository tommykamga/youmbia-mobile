"""Prepare a NEW local-only project. Refuses existing paths; never invokes a cloud CLI.
All credentials are generated for this synthetic local test and stored mode 0600.
"""
import argparse
from pathlib import Path
import re
import secrets
import shutil

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--target', type=Path, default=Path('/private/tmp/ymb-push-e2e-local'))
parser.add_argument('--env-out', type=Path, default=Path('/private/tmp/ymb-e2e.env'))
args = parser.parse_args()
target = args.target.resolve()
env = args.env_out.resolve()
if target.exists(): raise SystemExit('STOP: local test directory already exists; inspect it rather than overwrite')
if env.exists(): raise SystemExit('STOP: E2E env file already exists; inspect it rather than overwrite')
target.mkdir()
config = (root / 'supabase/config.toml').read_text().replace('youmbia-lifecycle-p0-03c', 'youmbia-push-e2e-local')
for port in ['54320', '54321', '54322', '54323', '54324', '54327', '54329']:
    config = config.replace(port, '554' + port[3:])
# Baseline first, deltas applied explicitly by bootstrap.py. Greenfield is tested separately.
config += '\n[functions.e2e-dispatch]\nverify_jwt = false\n'
assert re.search(r'(?m)^project_id = "youmbia-push-e2e-local"$', config)

def section_value(section, key):
    match = re.search(rf'(?ms)^\[{re.escape(section)}\]\s*\n(.*?)(?=^\[|\Z)', config)
    if not match:
        raise SystemExit(f'STOP: missing [{section}] in generated local Supabase config')
    value = re.search(rf'(?m)^\s*{re.escape(key)}\s*=\s*([^\s#]+)', match.group(1))
    if not value:
        raise SystemExit(f'STOP: missing {key} in [{section}]')
    return value.group(1)

assert section_value('api', 'port') == '55421'
assert section_value('db', 'port') == '55422'
assert section_value('db', 'major_version') == '17'
assert section_value('db.migrations', 'enabled') == 'false'
(target / 'supabase').mkdir()
(target / 'supabase/config.toml').write_text(config)
shutil.copytree(root / 'supabase/migrations', target / 'supabase/migrations')
for name in ['dispatch-transactional-push', 'send-message-push', '_shared']:
    shutil.copytree(root / 'supabase/functions' / name, target / 'supabase/functions' / name)
adapter = target / 'supabase/functions/e2e-dispatch'
adapter.mkdir()
text = (root / 'supabase/functions/_tests/e2e/edge-adapter.ts').read_text().replace('../../dispatch-transactional-push/', '../dispatch-transactional-push/')
(adapter / 'index.ts').write_text(text)
env.write_text('E2E_PROJECT_ID=youmbia-push-e2e-local\nTRANSACTIONAL_PUSH_WORKER_ENABLED=false\nTRANSACTIONAL_PUSH_DISPATCH_SECRET=' + secrets.token_hex(32) + '\n')
env.chmod(0o600)
print(f'Prepared local-only project youmbia-push-e2e-local at {target}, ports 55421/55422; env stored mode 0600; normal dispatcher OFF')
