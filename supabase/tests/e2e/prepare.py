"""Prepare a NEW local-only project. Refuses existing paths; never invokes a cloud CLI.
All credentials are generated for this synthetic local test and stored mode 0600.
"""
from pathlib import Path
import secrets
import shutil
import tomllib

root = Path(__file__).resolve().parents[3]
target = Path('/private/tmp/ymb-push-e2e-local')
if target.exists(): raise SystemExit('STOP: local test directory already exists; inspect it rather than overwrite')
target.mkdir()
config = (root / 'supabase/config.toml').read_text().replace('youmbia-lifecycle-p0-03c', 'youmbia-push-e2e-local')
for port in ['54320', '54321', '54322', '54323', '54324', '54327', '54329']:
    config = config.replace(port, '554' + port[3:])
# Baseline first, deltas applied explicitly by bootstrap.py. Greenfield is tested separately.
config += '\n[functions.e2e-dispatch]\nverify_jwt = false\n'
parsed = tomllib.loads(config)
assert parsed['project_id'] == 'youmbia-push-e2e-local'
assert parsed['api']['port'] == 55421 and parsed['db']['port'] == 55422
assert parsed['db']['major_version'] == 17 and not parsed['db']['migrations']['enabled']
(target / 'supabase').mkdir()
(target / 'supabase/config.toml').write_text(config)
shutil.copytree(root / 'supabase/migrations', target / 'supabase/migrations')
for name in ['dispatch-transactional-push', 'send-message-push', '_shared']:
    shutil.copytree(root / 'supabase/functions' / name, target / 'supabase/functions' / name)
adapter = target / 'supabase/functions/e2e-dispatch'
adapter.mkdir()
text = (root / 'supabase/functions/_tests/e2e/edge-adapter.ts').read_text().replace('../../dispatch-transactional-push/', '../dispatch-transactional-push/')
(adapter / 'index.ts').write_text(text)
env = Path('/private/tmp/ymb-e2e.env')
env.write_text('E2E_PROJECT_ID=youmbia-push-e2e-local\nTRANSACTIONAL_PUSH_WORKER_ENABLED=false\nTRANSACTIONAL_PUSH_DISPATCH_SECRET=' + secrets.token_hex(32) + '\n')
env.chmod(0o600)
print('Prepared local-only project youmbia-push-e2e-local, ports 55421/55422; normal dispatcher OFF')
