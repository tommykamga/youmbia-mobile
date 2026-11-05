-- Local versioned delta. Never depends on historical implicit Data API grants.
begin;
alter table public.user_push_tokens enable row level security;
revoke all on public.user_push_tokens from public,anon;
grant select,insert,update,delete on public.user_push_tokens to authenticated,service_role;
-- Ownership remains enforced by the existing four RLS policies for authenticated.
-- Do not restore maintenance privileges removed by the conversation security delta.
revoke truncate,references,trigger on public.user_push_tokens from authenticated;
commit;
