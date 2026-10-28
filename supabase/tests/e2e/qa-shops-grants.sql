-- QA-only least-privilege ACL complement for the branch's public.shops table.
-- Read-only PROD catalog evidence (2026-10-24) shows the hosted table has broad
-- table-level grants to anon/authenticated/service_role. Keep the same effective
-- RLS behavior in QA while not granting DELETE, TRUNCATE, REFERENCES or TRIGGER.
REVOKE ALL ON TABLE public.shops FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.shops TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON TABLE public.shops TO authenticated, service_role;
