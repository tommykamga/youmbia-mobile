#!/usr/bin/env python3
"""Real two-session races. Qualified existing loopback QA only; exact fixture cleanup."""
import json
import os
import subprocess
import time
import uuid
from pathlib import Path

if os.environ.get('V5_04_BASELINE_QUALIFIED') != '1' or not Path(os.environ.get('V5_04_BASELINE_EVIDENCE', '/nonexistent')).is_file():
    raise SystemExit('SQL QA BLOCKED: qualified baseline evidence required')
if any(os.environ.get(k) for k in ('DATABASE_URL','SUPABASE_DB_URL','PGSERVICE','PGSERVICEFILE','PGOPTIONS')):
    raise SystemExit('SQL QA BLOCKED: ambient connection overrides forbidden')
runtime = json.loads(Path(os.environ['V5_04_RUNTIME_FILE']).read_text())
env = dict(os.environ, PGPASSWORD=runtime['password'])
env.pop('PGHOSTADDR', None)
cmd = ['psql','-X','-qAt','-w','-h','127.0.0.1','-p','55432','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def query(sql):
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True, env=env, timeout=15)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
def auth(subject, email=None):
    claims = {'sub':subject,'role':'authenticated'}
    if email: claims['email'] = email
    return "SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='" + json.dumps(claims) + "';"
owner = auth('10000000-0000-4000-8000-000000000001')
buyer = auth('20000000-0000-4000-8000-000000000002')
admin = auth('30000000-0000-4000-8000-000000000003','moderator@v5-02a.example.test')
def race(first, second, expected_error=None):
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=dict(env,PGAPPNAME='v5_04_holder'))
    try:
        p.stdin.write('BEGIN;'+first+';SELECT pg_sleep(1);COMMIT;'); p.stdin.close(); p.stdin = None
        observed = False
        for _ in range(40):
            if query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='v5_04_holder' AND wait_event='PgSleep');") == 't':
                observed = True; break
            time.sleep(.025)
        assert observed, 'first session was not observed holding its transaction'
        q = subprocess.run(cmd, input='BEGIN;'+second+';COMMIT;', text=True, capture_output=True, env=env, timeout=8)
        out, err = p.communicate(timeout=8)
        assert p.returncode == 0, err
        if expected_error: assert q.returncode != 0 and expected_error in q.stderr, q.stderr
        else: assert q.returncode == 0, q.stderr
    finally:
        if p.poll() is None: p.kill(); p.wait()

assert query("SELECT current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND to_regprocedure('public.record_v5_contact_intent(uuid,uuid,text,text,text,text,uuid)') IS NOT NULL;") == 't'
assert query("SELECT count(*) FROM public.marketplace_contact_intents WHERE actor_id='20000000-0000-4000-8000-000000000002'") == '0', 'synthetic actor already has data; no cleanup permitted'
lid, event, session = (str(uuid.uuid4()) for _ in range(3))
ids = [event] + [str(uuid.uuid4()) for _ in range(61)]
id_list = ','.join("'"+i+"'" for i in ids)
def contact(event_id):
    return f"SELECT public.record_v5_contact_intent('{event_id}','{lid}','message','ios','search','listing_detail','{session}')"
results = []
try:
    query(f"INSERT INTO public.listings(id,user_id,title,description,price,city,status) VALUES('{lid}','10000000-0000-4000-8000-000000000001','QA concurrent contacts','',100,'Douala','active');")
    race(buyer+contact(event), buyer+contact(event))
    assert query(f"SELECT count(*) FROM public.marketplace_contact_intents WHERE event_id='{event}'") == '1'
    results.append('same UUID concurrent retry has one fact')
    query(f"DELETE FROM public.marketplace_contact_intents WHERE event_id='{event}'")
    query('INSERT INTO public.marketplace_contact_intents(event_id,actor_id,listing_id,channel,platform,source,entry_point,session_key,occurred_at,received_at) VALUES' + ','.join(f"('{i}','20000000-0000-4000-8000-000000000002','{lid}','message','ios','search','listing_detail','{session}',clock_timestamp(),clock_timestamp())" for i in ids[1:60]))
    race(buyer+contact(ids[60]), buyer+contact(ids[61]), 'Contact rate limit')
    assert query(f"SELECT count(*) FROM public.marketplace_contact_intents WHERE listing_id='{lid}'") == '60'
    results.append('59 + two concurrent intents capped at 60')
    race(admin+f"UPDATE public.listings SET status='suspended' WHERE id='{lid}'", owner+f"SELECT public.declare_v5_listing_availability('{lid}','available','active')", 'Stale or invalid declaration')
    assert query(f"SELECT count(*) FROM public.listing_availability_declarations WHERE listing_id='{lid}'") == '0'
    results.append('suspension rejects stale availability confirmation')
    query(f"UPDATE public.listings SET status='active' WHERE id='{lid}'")
    sale=owner+f"SELECT public.declare_v5_listing_availability('{lid}','sold','active')"
    race(sale,sale,'Stale or invalid declaration')
    assert query(f"SELECT state FROM public.listing_availability_declarations WHERE listing_id='{lid}'") == 'sold'
    results.append('concurrent sale declaration performs one status transition')
finally:
    query(f"DELETE FROM public.marketplace_contact_intents WHERE event_id IN ({id_list});DELETE FROM public.listings WHERE id='{lid}';DELETE FROM public.listing_first_publications WHERE listing_id='{lid}';")
print(json.dumps({'pass':len(results),'fail':0,'cases':results},indent=2))
