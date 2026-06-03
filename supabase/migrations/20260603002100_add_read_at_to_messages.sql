-- Add read_at to messages — aligne la base avec le code existant (accusés de lecture).
-- Contexte: l'envoi de message échouait avec `column messages.read_at does not exist`
-- (PostgreSQL 42703) car le code (sendMessage/getMessages/markConversationRead/...)
-- projette `read_at` alors que la colonne était absente de public.messages.
-- Correctif minimal et backward-compatible: colonne nullable, sans valeur par défaut
-- (read_at = NULL à la création = message non lu). Aucune RLS, aucun trigger, aucune
-- logique métier modifiés.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
