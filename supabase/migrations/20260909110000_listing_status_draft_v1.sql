-- TOM-98 Lot A — statut listings `draft` (backward-compatible, additif).
--
-- PREUVE DU BESOIN
-- Enum listing_status = active | hidden | suspended | sold.
-- Brouillons étaient en mémoire session uniquement. Réutiliser `hidden`
-- collisionne avec la pause vendeur.
--
-- STRATÉGIE
-- Ajouter la valeur d’enum `draft` sans réécrire les lignes, sans changer le défaut.
-- Les requêtes client filtrent déjà `status = 'active'` : `draft` exclu automatiquement.
--
-- PostgreSQL (SQLSTATE 55P04) : une nouvelle valeur enum NE PEUT PAS être utilisée
-- dans la même transaction que ALTER TYPE ... ADD VALUE. Fonctions / triggers /
-- qui comparent le statut au nouveau libellé → migration suivante 20260909110100.
--
-- VALIDATION REQUISE AVANT APPLICATION EN PRODUCTION
-- Ne pas appliquer sans GO. Vérifier enum public.listing_status et policies SELECT.

ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'draft';

COMMENT ON TYPE public.listing_status IS
  'active | hidden | suspended | sold | draft. draft = brouillon propriétaire uniquement, jamais discovery.';
