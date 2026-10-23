"""Run only against the disposable PostgreSQL fixture, fixed local socket/port.
Usage: python3 supabase/tests/transactional_push_concurrency.py
"""
import subprocess
import time

BASE = ['psql', '-X', '-h', '/private/tmp', '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
def sql(statement):
    return subprocess.check_output(BASE + ['-c', statement], text=True).strip()

def concurrent(a, b):
    first = subprocess.Popen(BASE + ['-c', a], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    second = subprocess.Popen(BASE + ['-c', b], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out_a, err_a = first.communicate(timeout=15)
    out_b, err_b = second.communicate(timeout=15)
    assert first.returncode == 0, err_a
    assert second.returncode == 0, err_b
    return out_a, out_b

try:
    sql("""insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
    insert into conversations values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
    update transactional_push_config set messages_enabled=true;
    insert into user_push_tokens(user_id,expo_push_token) values('00000000-0000-0000-0000-000000000002','ExpoPushToken[synthetic]');""")
    insert = "insert into messages(conversation_id,sender_id) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');"
    concurrent('begin; ' + insert + ' select pg_sleep(1); commit;', insert)
    assert sql('select count(*) from transactional_push_events where first_contact') == '1'
    assert sql('select count(*) from transactional_push_events') == '2'
    a, b = concurrent('begin; select count(*) from claim_transactional_push(); select pg_sleep(1); commit;', 'select count(*) from claim_transactional_push();')
    assert '\n2\n' in a and b.strip() == '0', (a, b)
    assert sql('select count(*) from transactional_push_deliveries') == '2'
    print('PASS concurrent first contact and SKIP LOCKED claims: one first contact, no duplicate delivery')
finally:
    sql("""delete from transactional_push_deliveries; delete from transactional_push_events;
    delete from messages; delete from conversations; delete from user_push_tokens; delete from auth.users;
    update transactional_push_config set messages_enabled=false,favorites_enabled=false;""")
