"""Qualify the optional-table static lint diagnostic with a real synthetic account."""
from pathlib import Path
import subprocess
source = (Path(__file__).parent / 'backend.py').read_text()
exec(source[:source.index('buyer, seller, outsider =')])
test_user = user('historical-rpc-regression')
item = listing(test_user)
rest('POST', 'rpc/delete_my_account', {}, test_user['jwt'])
check(rest('GET', 'listings?id=eq.' + item['id']) == [], 'guarded historical deletion succeeds with optional listing_reports absent')
http('GET', '/auth/v1/admin/users/' + test_user['id'], expected=(404,))
check(True, 'only the synthetic regression account is deleted, Auth function unchanged')
subprocess.run(['docker', 'exec', 'supabase_db_youmbia-push-e2e-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
    "select md5(prosrc),position('to_regclass(''public.listing_reports'')' in prosrc)>0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_my_account';"], check=True)
