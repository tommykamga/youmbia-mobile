-- Push messaging V1 — stockage serveur des tokens Expo Push.
-- Permet à une Edge Function (service_role) de retrouver les devices d'un destinataire
-- pour lui envoyer une vraie notification push. RLS: chaque user ne gère que ses tokens.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expo_push_token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx
  ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: un utilisateur ne voit/gère QUE ses propres tokens.
-- (L'Edge Function lit via service_role, qui contourne la RLS côté serveur.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_push_tokens'
      AND policyname = 'Users can read their own push tokens'
  ) THEN
    CREATE POLICY "Users can read their own push tokens"
    ON public.user_push_tokens
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_push_tokens'
      AND policyname = 'Users can insert their own push tokens'
  ) THEN
    CREATE POLICY "Users can insert their own push tokens"
    ON public.user_push_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_push_tokens'
      AND policyname = 'Users can update their own push tokens'
  ) THEN
    CREATE POLICY "Users can update their own push tokens"
    ON public.user_push_tokens
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_push_tokens'
      AND policyname = 'Users can delete their own push tokens'
  ) THEN
    CREATE POLICY "Users can delete their own push tokens"
    ON public.user_push_tokens
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;
