-- Local only. Activation and scheduling require a separate operational approval.
begin;
create schema if not exists push_private;
revoke all on schema push_private from public, anon, authenticated;
create table public.transactional_push_config (
 singleton boolean primary key default true check(singleton),
 messages_enabled boolean not null default false,
 favorites_enabled boolean not null default false
);
insert into public.transactional_push_config default values;
alter table public.transactional_push_config enable row level security;
revoke all on public.transactional_push_config from public, anon, authenticated;
grant select,update on public.transactional_push_config to service_role;

create table public.transactional_push_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 favorites_enabled boolean not null default true
);
alter table public.transactional_push_preferences enable row level security;
revoke all on public.transactional_push_preferences from public, anon, authenticated;
grant select,insert,update on public.transactional_push_preferences to authenticated;
grant all on public.transactional_push_preferences to service_role;
create policy own_preferences on public.transactional_push_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.transactional_push_events (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('message','favorite')),
 source_id uuid not null, recipient_id uuid not null references auth.users(id) on delete cascade,
 target_id uuid not null, first_contact boolean not null default false,
 created_at timestamptz not null default now(), expanded boolean not null default false,
 unique(kind,source_id,recipient_id)
);
create table public.transactional_push_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.transactional_push_events(id) on delete cascade,
 token_id uuid not null references public.user_push_tokens(id) on delete cascade,
 token_version timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','accepted','delivered','failed','uncertain','skipped')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 claim_id uuid, claimed_at timestamptz, ticket_id text, error_code text,
 receipt_checks integer not null default 0,
 unique(event_id,token_id)
);
create index transactional_push_due on public.transactional_push_deliveries(available_at) where state in ('pending','accepted');
create table push_private.favorite_cooldowns (
 recipient_id uuid not null references auth.users(id) on delete cascade,
 listing_id uuid not null references public.listings(id) on delete cascade,
 last_event_at timestamptz not null, primary key(recipient_id,listing_id)
);
alter table push_private.favorite_cooldowns enable row level security;
alter table public.transactional_push_events enable row level security;
alter table public.transactional_push_deliveries enable row level security;
revoke all on public.transactional_push_events,public.transactional_push_deliveries from public,anon,authenticated;
grant all on public.transactional_push_events,public.transactional_push_deliveries to service_role;

-- Trigger runs BEFORE insertion, serialized by conversation row lock. No message body is read.
create function push_private.enqueue_message() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; recipient uuid; first_message boolean;
begin
 if not (select messages_enabled from public.transactional_push_config where singleton) then return new; end if;
 select * into c from public.conversations where id=new.conversation_id for update;
 if c.id is null or new.sender_id not in (c.buyer_id,c.seller_id) or c.buyer_id=c.seller_id then return new; end if;
 recipient := case when new.sender_id=c.buyer_id then c.seller_id else c.buyer_id end;
 first_message := new.sender_id=c.buyer_id and not exists(select 1 from public.messages where conversation_id=c.id);
 insert into public.transactional_push_events(kind,source_id,recipient_id,target_id,first_contact)
 values('message',new.id,recipient,c.id,first_message) on conflict do nothing;
 return new;
exception when others then
 raise warning 'transactional_push_enqueue_failed';
 return new;
end $$;
revoke all on function push_private.enqueue_message() from public,anon,authenticated;
create trigger transactional_push_message before insert on public.messages for each row execute function push_private.enqueue_message();

create function push_private.enqueue_favorite() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; allowed boolean;
begin
 if not (select favorites_enabled from public.transactional_push_config where singleton) then return new; end if;
 select user_id into owner_id from public.listings where id=new.listing_id and status='active';
 if owner_id is null or owner_id=new.user_id then return new; end if;
 if not coalesce((select favorites_enabled from public.transactional_push_preferences where user_id=owner_id),true) then return new; end if;
 insert into push_private.favorite_cooldowns values(owner_id,new.listing_id,now())
 on conflict(recipient_id,listing_id) do update set last_event_at=excluded.last_event_at
 where favorite_cooldowns.last_event_at <= now()-interval '24 hours' returning true into allowed;
 if not coalesce(allowed,false) then return new; end if;
 insert into public.transactional_push_events(kind,source_id,recipient_id,target_id)
 values('favorite',new.id,owner_id,new.listing_id) on conflict do nothing;
 return new;
exception when others then
 raise warning 'transactional_push_enqueue_failed';
 return new;
end $$;
revoke all on function push_private.enqueue_favorite() from public,anon,authenticated;
create trigger transactional_push_favorite after insert on public.favorites for each row execute function push_private.enqueue_favorite();

-- Used by the existing function, including old mobile builds. Fail closed in its caller on RPC failure.
create function public.transactional_message_push_enabled() returns boolean language sql security definer set search_path='' stable as $$
 select messages_enabled from public.transactional_push_config where singleton
$$;
revoke all on function public.transactional_message_push_enabled() from public,anon,authenticated;
grant execute on function public.transactional_message_push_enabled() to service_role;

create function public.claim_transactional_push(p_limit integer default 50)
 returns table(delivery_id uuid,claim uuid,attempt integer,kind text,target_id uuid,source_id uuid,first_contact boolean,expo_push_token text)
 language plpgsql security definer set search_path='' as $$
begin
 -- A crashed sender may have reached Expo. Never automatically resend its lease.
 update public.transactional_push_deliveries set state='uncertain',error_code='expired_send_lease'
 where state='sending' and claimed_at<now()-interval '5 minutes';
 -- Snapshot devices exactly once per event. No late fanout to newly registered devices.
 with batch as (
 select e.id from public.transactional_push_events e join public.transactional_push_config cfg on cfg.singleton
 where not e.expanded and e.created_at>now()-interval '24 hours'
 and ((e.kind='message' and cfg.messages_enabled) or (e.kind='favorite' and cfg.favorites_enabled))
 order by e.created_at limit 100 for update of e skip locked
 ), expanded as (
 update public.transactional_push_events e set expanded=true from batch where e.id=batch.id returning e.*
 ) insert into public.transactional_push_deliveries(event_id,token_id,token_version)
 select e.id,t.id,t.updated_at from expanded e join public.user_push_tokens t on t.user_id=e.recipient_id
 where t.expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
 on conflict do nothing;
 -- Revalidate opt-out, listing state and token ownership immediately before claim.
 update public.transactional_push_deliveries d set state='skipped',error_code='no_longer_eligible'
 from public.transactional_push_events e,public.user_push_tokens t
 where d.event_id=e.id and d.token_id=t.id and d.state='pending' and
 (t.user_id<>e.recipient_id or t.updated_at<>d.token_version or e.created_at<now()-interval '24 hours'
 or (e.kind='favorite' and (not coalesce((select p.favorites_enabled from public.transactional_push_preferences p where p.user_id=e.recipient_id),true)
 or not exists(select 1 from public.listings l where l.id=e.target_id and l.user_id=e.recipient_id and l.status='active'))));
 return query
 with due as (
 select d.id from public.transactional_push_deliveries d join public.transactional_push_events e on e.id=d.event_id
 cross join public.transactional_push_config cfg
 where d.state='pending' and d.available_at<=now() and d.attempts<5
 and ((e.kind='message' and cfg.messages_enabled) or (e.kind='favorite' and cfg.favorites_enabled))
 order by d.available_at limit least(greatest(p_limit,1),100) for update of d skip locked
 ), claimed as (
 update public.transactional_push_deliveries d set state='sending',claim_id=gen_random_uuid(),claimed_at=now(),attempts=attempts+1
 from due where due.id=d.id returning d.*
 ) select d.id,d.claim_id,d.attempts,e.kind,e.target_id,e.source_id,e.first_contact,t.expo_push_token
 from claimed d join public.transactional_push_events e on e.id=d.event_id join public.user_push_tokens t on t.id=d.token_id;
end $$;
revoke all on function public.claim_transactional_push(integer) from public,anon,authenticated;
grant execute on function public.claim_transactional_push(integer) to service_role;

-- Receipt cleanup must not revoke a token re-registered or transferred after the send.
create function public.invalidate_transactional_push_token(p_delivery_id uuid) returns void
 language sql security definer set search_path='' as $$
 delete from public.user_push_tokens t using public.transactional_push_deliveries d,public.transactional_push_events e
 where d.id=p_delivery_id and d.event_id=e.id and d.token_id=t.id and t.user_id=e.recipient_id
 and t.updated_at=d.token_version and d.error_code='DeviceNotRegistered'
$$;
revoke all on function public.invalidate_transactional_push_token(uuid) from public,anon,authenticated;
grant execute on function public.invalidate_transactional_push_token(uuid) to service_role;
commit;
