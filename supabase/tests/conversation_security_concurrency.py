"""Synthetic local fixture only: /private/tmp:55439, ymb_conversation_security.
Tests duplicate conversations and identity/listing races with authenticated roles.
"""
import subprocess
import time

BASE = ['psql', '-X', '-h', '/private/tmp', '-p', '55439', '-d', 'ymb_conversation_security', '-v', 'ON_ERROR_STOP=1', '-At']
AUTH = "set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';"
def sql(statement):
    return subprocess.check_output(BASE + ['-c', statement], text=True).strip()

def race(a, b, denied=False):
    first = subprocess.Popen(BASE + ['-c', a], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time.sleep(0.2)
    second = subprocess.Popen(BASE + ['-c', b], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out_a, err_a = first.communicate(timeout=15)
    out_b, err_b = second.communicate(timeout=15)
    assert first.returncode == 0, err_a
    if denied:
        assert second.returncode != 0, out_b
        assert 'immutable' in err_b or 'listing unavailable' in err_b, err_b
    else:
        assert second.returncode == 0, err_b
    return out_a, out_b

try:
    sql("""insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
    insert into listings values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','active'),('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','active');
    update transactional_push_config set messages_enabled=true;
    insert into user_push_tokens(user_id,expo_push_token) values('00000000-0000-0000-0000-000000000002','ExpoPushToken[seller]');""")
    insert = "insert into conversations(id,listing_id,buyer_id,seller_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002') on conflict(listing_id,buyer_id,seller_id) do nothing;"
    # Two equivalent get-or-create attempts: database uniqueness is the final authority.
    race('begin;' + AUTH + insert + 'select pg_sleep(1); commit;', 'begin;' + AUTH + insert.replace('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000099') + 'commit;')
    assert sql('select count(*) from conversations') == '1'
    assert sql('select count(*) from transactional_push_events') == '0'
    # A malicious rewrite waits behind an actual message INSERT/outbox lock, then is still denied.
    race('begin;' + AUTH + "insert into messages(conversation_id,sender_id,body) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','synthetic'); select pg_sleep(1); commit;",
         'begin;' + AUTH + "update conversations set seller_id='00000000-0000-0000-0000-000000000003'; commit;", denied=True)
    assert sql("select count(*) from transactional_push_events where first_contact and recipient_id='00000000-0000-0000-0000-000000000002'") == '1'
    # A listing owner change in flight cannot validate the previous seller from a stale snapshot.
    owner_change = "begin; update listings set user_id='00000000-0000-0000-0000-000000000003' where id='20000000-0000-0000-0000-000000000002'; select pg_sleep(1); commit;"
    second_thread = insert.replace('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002').replace('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')
    race(owner_change, 'begin;' + AUTH + second_thread + 'commit;', denied=True)
    assert sql('select count(*) from conversations') == '1'
    print('PASS authenticated duplicate INSERT, identity mutation after lock wait, listing owner race, correct first contact recipient')
finally:
    sql("""delete from transactional_push_deliveries; delete from transactional_push_events;
    delete from messages; delete from conversations; delete from user_push_tokens; delete from listings; delete from auth.users;
    update transactional_push_config set messages_enabled=false,favorites_enabled=false;""")
