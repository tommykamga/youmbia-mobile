-- ============================================================================
-- YOUMBIA — Publication Realtime table `profiles` (avatar sync multi-appareils)
-- ============================================================================
-- ⚠️ Script MANUEL — à exécuter dans Supabase SQL Editor si la sync temps réel
--    de l'avatar ne fonctionne pas entre appareils.
--
-- L'app mobile écoute les UPDATE sur `public.profiles` (filtré par auth.uid()).
-- ============================================================================

-- Vérifier que la table est publiée (Supabase Dashboard → Database → Replication)
-- ou exécuter :
alter publication supabase_realtime add table public.profiles;

-- Si la commande échoue car déjà publiée, ignorer l'erreur.
