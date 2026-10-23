-- Additive protection; no rewrite/delete of existing conversations. Local only.
begin;

-- Trigger protection is independent of RLS permissive policy composition and
-- applies to privileged writers too. No administrative reassignment API exists.
create function push_private.guard_conversation_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare listing_owner uuid; listing_status text;
begin
 if TG_OP='UPDATE' then
   if new.id is distinct from old.id or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id or new.listing_id is distinct from old.listing_id then
     raise exception 'conversation identity is immutable' using errcode='42501';
   end if;
   return new;
 end if;
 if auth.uid() is null or new.buyer_id is distinct from auth.uid()
    or new.seller_id is null or new.seller_id=new.buyer_id then
   raise exception 'invalid conversation participants' using errcode='42501';
 end if;
 -- FOR SHARE conflicts with owner/status changes until this INSERT commits.
 -- Definer needed for this narrow lookup/lock; never callable as a user RPC.
 select l.user_id,l.status::text into listing_owner,listing_status
 from public.listings l where l.id=new.listing_id for share;
 if listing_owner is null or listing_owner is distinct from new.seller_id
    or listing_status is null or listing_status not in ('active','published') then
   raise exception 'listing unavailable for conversation' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function push_private.guard_conversation_identity() from public,anon,authenticated,service_role;
create trigger conversation_identity_guard before insert or update on public.conversations
 for each row execute function push_private.guard_conversation_identity();

drop policy if exists conversations_insert_buyer_or_seller on public.conversations;
create policy conversations_insert_buyer_or_seller on public.conversations
 for insert to authenticated with check (
 buyer_id=(select auth.uid()) and buyer_id<>seller_id and exists (
 select 1 from public.listings l where l.id=listing_id and l.user_id=seller_id and l.status::text in ('active','published'))
 );

-- No legitimate user hard-delete/message UPDATE path was found. RLS alone
-- does not cover TRUNCATE. Preserve service operations and participant metadata updates.
revoke all on public.conversations,public.messages from public,anon;
revoke delete,truncate,references,trigger on public.conversations from authenticated;
revoke update,delete,truncate,references,trigger on public.messages from authenticated;
grant select,insert,update on public.conversations to authenticated;
grant select,insert on public.messages to authenticated;
-- Same RLS-bypassing maintenance privileges are unnecessary on related tables.
revoke truncate,references,trigger on public.listings,public.favorites,public.user_push_tokens from public,anon,authenticated;
revoke all on function push_private.enqueue_message(),push_private.enqueue_favorite() from public,anon,authenticated,service_role;
revoke all on push_private.favorite_cooldowns from public,anon,authenticated,service_role;

-- Existing bodies use schema-qualified relations and auth.uid() checks.
-- Remove public schema lookup and explicit anon grants (PUBLIC revoke alone is insufficient).
alter function public.mark_conversation_read(uuid) set search_path='';
alter function public.hide_conversation_for_me(uuid) set search_path='';
alter function public.conversations_undelete_on_new_message() set search_path='';
revoke all on function public.mark_conversation_read(uuid),public.hide_conversation_for_me(uuid)
 from public,anon;
grant execute on function public.mark_conversation_read(uuid),public.hide_conversation_for_me(uuid) to authenticated;
revoke all on function public.conversations_undelete_on_new_message() from public,anon,authenticated,service_role;
commit;
