import json,subprocess,os,time,uuid
from pathlib import Path
if os.environ.get('V5_02C_BASELINE_QUALIFIED') != '1' or not Path(os.environ.get('V5_02C_BASELINE_EVIDENCE', '/nonexistent')).is_file():
 raise SystemExit('SQL QA BLOCKED: qualified baseline evidence required')
if any(os.environ.get(key) for key in ['DATABASE_URL','SUPABASE_DB_URL','PGSERVICE','PGSERVICEFILE','PGOPTIONS']):
 raise SystemExit('SQL QA BLOCKED: ambient connection/options forbidden')
r=json.loads(Path(os.environ['V5_02C_RUNTIME_FILE']).read_text())
env=dict(os.environ,PGPASSWORD=r['password']);env.pop('PGHOSTADDR',None)
cmd=['psql','-X','-qAt','-w','-h','127.0.0.1','-p','55432','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(q):
 x=subprocess.run(cmd,input=q,text=True,capture_output=True,env=env);assert x.returncode==0,x.stderr;return x.stdout.strip()
owner='10000000-0000-4000-8000-000000000001'
auth="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"sub\":\""+owner+"\",\"role\":\"authenticated\"}';"
admin="SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{\"sub\":\"30000000-0000-4000-8000-000000000003\",\"email\":\"moderator@v5-02a.example.test\",\"role\":\"authenticated\"}';"
def pair(first,second,expect_error=False):
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=dict(env,PGAPPNAME='v5c_holder'))
 p.stdin.write('BEGIN;'+first+';SELECT pg_sleep(1);COMMIT;');p.stdin.close();p.stdin=None
 for _ in range(30):
  if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='v5c_holder' AND wait_event='PgSleep');")=='t':break
  time.sleep(.03)
 q=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env);out,err=q.communicate('BEGIN;'+second+';COMMIT;',timeout=8)
 a,b=p.communicate(timeout=8);assert p.returncode==0,b
 if expect_error:assert q.returncode!=0 and '100 premières' in err,err
 else:assert q.returncode==0 and out.strip()=='0',(out,err)
assert sql("SELECT current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND to_regprocedure('public.record_listing_first_publication()') IS NOT NULL;")=='t'
results=[]
for name,initial,first,second,actor in [
 ('sale prevents stale renewal','active',"status='sold'","renewed_at='2099-01-01'",auth),
 ('suspension prevents stale reactivation','hidden',"status='suspended'","status='active'",admin),
 ('double sale changes one row','active',"status='sold'","status='sold'",auth)]:
 i=str(uuid.uuid4());sql(f"INSERT INTO public.listings(id,user_id,title,description,price,city,status) VALUES('{i}','{owner}','QA race','',1,'','{initial}');")
 try:pair(actor+f"UPDATE public.listings SET {first} WHERE id='{i}'",auth+f"WITH changed AS(UPDATE public.listings SET {second} WHERE id='{i}' AND status='{initial}' RETURNING id) SELECT count(*) FROM changed");results.append(name)
 finally:sql(f"DELETE FROM public.listings WHERE id='{i}';DELETE FROM public.listing_first_publications WHERE listing_id='{i}';")
a,b=str(uuid.uuid4()),str(uuid.uuid4());seed=[str(uuid.uuid4()) for _ in range(99)];ids=','.join("'"+x+"'" for x in seed+[a,b])
try:
 sql("INSERT INTO public.listing_first_publications VALUES"+','.join(f"('{i}','{owner}',clock_timestamp())" for i in seed)+';'+''.join(f"INSERT INTO public.listings(id,user_id,title,description,price,city,status) VALUES('{i}','{owner}','QA quota','',1,'','draft');" for i in [a,b]))
 pair(auth+f"UPDATE public.listings SET status='active' WHERE id='{a}'",auth+f"UPDATE public.listings SET status='active' WHERE id='{b}'",True)
 assert sql(f"SELECT count(*) FROM public.listing_first_publications WHERE user_id='{owner}'")=='100';results.append('99 + two concurrent first publications yields 100, second rejected')
finally:sql(f"DELETE FROM public.listings WHERE id IN ('{a}','{b}');DELETE FROM public.listing_first_publications WHERE listing_id IN ({ids});")
print(json.dumps({'pass':len(results),'fail':0,'cases':results},indent=2))
