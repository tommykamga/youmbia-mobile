-- Bootstrap minimal pour Postgres Supabase NATIF (image Docker).
-- PAS de stubs pg_net / pg_cron / vault — extensions réelles attendues.
-- Ne jamais exécuter contre production / projet cloud lié.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
    CREATE TYPE public.listing_status AS ENUM (
      'active', 'hidden', 'suspended', 'sold', 'draft'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  is_banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Brouillon',
  price integer NOT NULL DEFAULT 0,
  status public.listing_status NOT NULL DEFAULT 'draft',
  last_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;

-- Secrets Vault locaux mock (pas de secret de prod) pour exercer pg_net.
SELECT vault.create_secret(
  'http://127.0.0.1:9/functions/v1/send-lifecycle-email',
  'lifecycle_email_functions_url',
  'Lot03C local mock — port fermé volontairement'
)
WHERE NOT EXISTS (
  SELECT 1 FROM vault.decrypted_secrets WHERE name = 'lifecycle_email_functions_url'
);

SELECT vault.create_secret(
  'lot03c-local-dispatch-secret-not-for-prod',
  'lifecycle_email_dispatch_secret',
  'Lot03C local mock'
)
WHERE NOT EXISTS (
  SELECT 1 FROM vault.decrypted_secrets WHERE name = 'lifecycle_email_dispatch_secret'
);
