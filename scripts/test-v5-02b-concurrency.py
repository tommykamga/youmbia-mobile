#!/usr/bin/env python3
"""Real two-connection test on a qualified, disposable PG17 loopback instance."""
import json, os, re, subprocess, time, uuid
from pathlib import Path

def main():
    evidence = Path(os.environ.get('V5_02B_BASELINE_EVIDENCE', '/nonexistent'))
    if os.environ.get('V5_02B_BASELINE_QUALIFIED') != '1' or not evidence.is_file() or not evidence.stat().st_size:
        raise RuntimeError('SQL QA BLOCKED: qualified baseline evidence required')
    host = os.environ.get('V5_02B_PGHOST', '127.0.0.1')
    database = os.environ.get('V5_02B_PGDATABASE', 'postgres')
    if host not in ('127.0.0.1', '::1') or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', database):
        raise RuntimeError('SQL QA BLOCKED: literal loopback and plain database name required')
    if any(os.environ.get(k) for k in ('DATABASE_URL', 'SUPABASE_DB_URL', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS')):
        raise RuntimeError('SQL QA BLOCKED: ambient connection overrides forbidden')
    env = dict(os.environ, PGHOST=host, PGPORT=os.environ.get('V5_02B_PGPORT', '54322'),
               PGUSER=os.environ.get('V5_02B_PGUSER', 'postgres'), PGDATABASE=database)
    env.pop('PGHOSTADDR', None)
    cmd = ['psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1']
    def query(sql):
        r = subprocess.run(cmd, input=sql, text=True, capture_output=True, env=env, timeout=15)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return r.stdout.strip()
    assert query("SELECT current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND to_regprocedure('public.finalize_listing_publication(uuid)') IS NOT NULL;") == 't'
    listing = str(uuid.uuid4())
    owner = '10000000-0000-4000-8000-000000000001'
    category = 1_000_000_000_000 + int(uuid.uuid4().hex[:10], 16)
    parent = category - 1
    assert query(f"SELECT count(*) FROM public.categories WHERE id IN ({category},{parent});") == '0'
    bucket_existed = query("SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='listing-images');") == 't'
    auth = "SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{\"sub\":\"" + owner + "\",\"role\":\"authenticated\"}';"
    sessions = []
    try:
        query(f"""BEGIN;
INSERT INTO public.categories(id,name,slug) VALUES({parent},'QA concurrent root','qa-concurrent-root-{listing}');
INSERT INTO public.categories(id,name,slug,parent_id) VALUES({category},'QA concurrent leaf','qa-concurrent-leaf-{listing}',{parent});
INSERT INTO storage.buckets(id,name,public) VALUES('listing-images','listing-images',false) ON CONFLICT DO NOTHING;
INSERT INTO public.listings(id,user_id,title,description,price,city,category_id,status,publication_managed)
VALUES('{listing}','{owner}','QA concurrence','Description complète du test concurrent.',1000,'Douala',{category},'draft',true);
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES('listing-images','{owner}/{listing}/0.jpg','{owner}','{{"size":100}}');
INSERT INTO public.listing_images(listing_id,url,sort_order) VALUES('{listing}','{owner}/{listing}/0.jpg',0);
COMMIT;""")
        def start(name, hold):
            # The first finalizer holds its row lock while sleeping. The second must wait.
            sql = f"BEGIN; {auth} SELECT json_build_object('already_published',already_published,'txid',txid_current()) FROM public.finalize_listing_publication('{listing}');"
            if hold:
                sql += ' SELECT pg_sleep(2);'
            sql += ' COMMIT;'
            process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, env=dict(env, PGAPPNAME=name))
            process.stdin.write(sql); process.stdin.close(); process.stdin = None
            sessions.append(process)
            return process
        first = start('v5_02b_finalizer_1', True)
        # Wait for the first connection to hold the lock, without relying on stdout buffering.
        for _ in range(40):
            if query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='v5_02b_finalizer_1' AND wait_event='PgSleep');") == 't':
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('first finalizer did not reach its lock-holding point')
        second = start('v5_02b_finalizer_2', False)
        blocked = False
        for _ in range(20):
            if query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='v5_02b_finalizer_2' AND wait_event_type='Lock');") == 't':
                blocked = True; break
            time.sleep(0.05)
        rows = []
        for process in (first, second):
            stdout, stderr = process.communicate(timeout=10)
            if process.returncode:
                raise RuntimeError(stderr)
            rows.append(json.loads(stdout.strip()))
        assert blocked, 'second finalization was not observed waiting for the row lock'
        assert rows[0]['already_published'] is False and rows[1]['already_published'] is True, rows
        timestamps = json.loads(query(f"SELECT json_build_object('active',status='active','receipt',publication_finalized_at IS NOT NULL,'single_update',updated_at=publication_finalized_at,'creation_unchanged',created_at<publication_finalized_at,'not_renewed',renewed_at IS NULL) FROM public.listings WHERE id='{listing}';"))
        assert all(timestamps.values()), timestamps
        print(json.dumps({'pass':8,'fail':0,'assertions':['second_session_waited_on_real_lock','first_finalized_once','second_received_existing_receipt',*timestamps.keys()],
                          'sessions':rows,'timestamps':timestamps,'roles':'authenticated with owner JWT SQL context'}, indent=2))
    finally:
        for process in sessions:
            if process.poll() is None:
                process.kill(); process.wait()
        # This flag belongs to the disposable Storage metadata test, not marketing/Cron.
        query(f"""BEGIN; SET LOCAL storage.allow_delete_query='true';
DELETE FROM public.listings WHERE id='{listing}';
DELETE FROM storage.objects WHERE bucket_id='listing-images' AND name='{owner}/{listing}/0.jpg';
DELETE FROM public.categories WHERE id={category};
DELETE FROM public.categories WHERE id={parent};
""" + ("DELETE FROM storage.buckets WHERE id='listing-images';\n" if not bucket_existed else '') + 'COMMIT;')

if __name__ == '__main__':
    main()
