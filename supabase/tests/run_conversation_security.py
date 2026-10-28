"""Initialize and test a NEW disposable database on the fixed local test cluster.
Requires PostgreSQL at /private/tmp:55439 and no database ymb_conversation_security.
Never drops or overwrites an existing database. All fixtures are synthetic.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'ymb_conversation_security'
BASE = ['psql', '-X', '-h', '/private/tmp', '-p', '55439', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1']
FILES = [
    'supabase/tests/transactional_push_fixture.sql',
    'supabase/migrations/20260603005000_user_push_tokens_v1.sql',
    'supabase/migrations/20261003230000_claim_my_push_token.sql',
    'supabase/migrations/20260603003700_mark_conversation_read_rpc.sql',
    'supabase/migrations/20260909120000_conversation_hide_for_me_v1.sql',
    'supabase/migrations/20261023200527_transactional_push_outbox.sql',
    'supabase/tests/conversation_security_repro.sql',
    'supabase/migrations/20261023202544_conversation_identity_security.sql',
    'supabase/migrations/20261023205854_explicit_push_token_grants.sql',
    'supabase/tests/conversation_security.sql',
    'supabase/tests/transactional_push.sql',
    'supabase/tests/verified_marketing_consent.sql',
]
subprocess.run(['createdb', '-h', '/private/tmp', '-p', '55439', DATABASE], check=True)
for file in FILES:
    print('RUN', file, flush=True)
    subprocess.run(BASE + ['-f', str(ROOT / file)], check=True)
for script in ['transactional_push_concurrency.py', 'conversation_security_concurrency.py']:
    subprocess.run(['python3', str(ROOT / 'supabase' / 'tests' / script)], check=True)
print('PASS local SQL/RLS reproduction, correction and both concurrency suites')
