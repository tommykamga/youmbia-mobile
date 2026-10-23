-- REVIEW ONLY. Never run remotely without separate approval.
-- Requires existing pg_cron, pg_net, Vault and the two named Vault entries.
-- Creates a disabled schedule; does not send a notification or enable the worker.
begin;
-- An owner-only target allowlist avoids hard-coding production and does not
-- require restricted ALTER DATABASE parameters on hosted/local Supabase.
create table if not exists push_private.dispatch_target (
 singleton boolean primary key default true check(singleton), url text
);
alter table push_private.dispatch_target enable row level security;
revoke all on push_private.dispatch_target from public,anon,authenticated,service_role;
insert into push_private.dispatch_target default values on conflict do nothing;
create or replace function push_private.wake_dispatcher() returns void
language plpgsql security definer set search_path='' as $$
declare dispatch_url text; dispatch_secret text; expected_url text;
begin
 select decrypted_secret into dispatch_url from vault.decrypted_secrets where name='transactional_push_dispatch_url';
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='transactional_push_dispatch_secret';
 -- Explicit owner-only configuration, separate from the Vault URL.
 select url into expected_url from push_private.dispatch_target where singleton;
 if expected_url is null or expected_url='' or dispatch_url is distinct from expected_url
 or dispatch_secret is null or length(dispatch_secret)<32 then
   raise exception 'transactional_push_scheduler_unconfigured';
 end if;
 perform net.http_post(url:=dispatch_url,headers:=jsonb_build_object('Content-Type','application/json','x-transactional-push-secret',dispatch_secret),body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
revoke all on function push_private.wake_dispatcher() from public,anon,authenticated;
select cron.schedule('dispatch-transactional-push','* * * * *','select push_private.wake_dispatcher();');
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='dispatch-transactional-push';
commit;
