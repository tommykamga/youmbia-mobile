"""Test real pg_cron + Vault + pg_net against local Edge and local Expo mock only."""
from pathlib import Path
import json
import subprocess
import time

source = (Path(__file__).parent / 'backend.py').read_text()
exec(source[:source.index('buyer, seller, outsider =')])
root = Path(__file__).resolve().parents[3]
SQL = ['docker', 'exec', '-i', 'supabase_db_youmbia-push-e2e-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
def sql(text, fail=False):
    result = subprocess.run(SQL, input=text, text=True, capture_output=True)
    if fail: return result.returncode
    if result.returncode: raise AssertionError('local scheduler SQL operation failed')
    return result.stdout.strip()

url = 'http://host.docker.internal:55421/functions/v1/e2e-dispatch'
# Only synthetic test secret in an isolated Vault. Never print query literals or headers.
sql("select vault.create_secret('" + SECRET + "','transactional_push_dispatch_secret') where not exists(select 1 from vault.secrets where name='transactional_push_dispatch_secret');")
sql("select vault.create_secret('" + url + "','transactional_push_dispatch_url') where not exists(select 1 from vault.secrets where name='transactional_push_dispatch_url');")
old = subprocess.check_output(['git', 'show', '0a9d961:supabase/operations/transactional_push_scheduler.sql'], cwd=root, text=True)
sql(old)
check(sql('select push_private.wake_dispatcher();', fail=True) != 0, 'old scheduler rejects isolated URL: production hardcode reproduced without outbound request')
sql((root / 'supabase/operations/transactional_push_scheduler.sql').read_text())
sql("update push_private.dispatch_target set url='" + url + "' where singleton;")
check(sql("select has_table_privilege('authenticated','push_private.dispatch_target','select');") == 'f', 'scheduler target configuration is owner-only and inaccessible to clients')
check(sql("select active from cron.job where jobname='dispatch-transactional-push';") == 'f', 'operations script creates a genuinely disabled pg_cron job')
buyer, seller = user('scheduler-buyer'), user('scheduler-seller')
item = listing(seller); thread = conversation(buyer, seller, item)[0]
claim_token(seller, 'ExpoPushToken[e2e_scheduler_device]')
message(buyer, thread, 'scheduler')
start = time.time()
try:
    sql("select cron.alter_job(job_id:=jobid,active:=true) from cron.job where jobname='dispatch-transactional-push';")
    while time.time() - start < 75:
        rows = events(thread)
        if rows and deliveries(rows[0]) and deliveries(rows[0])[0]['state'] == 'accepted': break
        time.sleep(1)
    else: raise AssertionError('scheduler did not dispatch within 75 seconds')
    check(True, 'real minute cron tick -> Vault secret -> pg_net -> Edge adapter -> HTTP Expo mock -> persisted ticket')
    status = sql("select status from cron.job_run_details where jobid=(select jobid from cron.job where jobname='dispatch-transactional-push') order by start_time desc limit 1;")
    check(status == 'succeeded', 'native pg_cron run status succeeded')
    check(len(deliveries(rows[0])) == 1, 'scheduler generated exactly one device delivery')
finally:
    sql("select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='dispatch-transactional-push';")
check(sql("select active from cron.job where jobname='dispatch-transactional-push';") == 'f', 'rollback disables the scheduler without deleting business data')
Path('/private/tmp/ymb-e2e-scheduler-results.json').write_text(json.dumps({'assertions': results, 'elapsed_seconds': round(time.time()-start, 2), 'project': ENV['E2E_PROJECT_ID']}, indent=2))
