/**
 * Pilote attributs dynamiques (mobile).
 * - `shouldUseVehicleDynamicPilot` : **véhicule seul** (usage ciblé / rétrocompat).
 * - `shouldUseDynamicAttributesPilot` : **Vendre + édition** — véhicule **ou** electronics (`form_profile` + repli ids racines 5 / 19).
 * Voir `docs/category-attributes/23_vehicle_electronics_qa_hardening.md` (repo web).
 */

import { supabase, supabaseRuntime } from '@/lib/supabase';
import {
  ELECTRONICS_ROOT_LISTING_CATEGORY_ID,
  VEHICLE_LISTING_CATEGORY_ID,
} from '@/lib/listingCategories';

/** Valeur `categories.form_profile` pour le pilote Véhicules (seed / migration). */
export const VEHICLE_FORM_PROFILE = 'vehicle' as const;

/** Valeur `categories.form_profile` pour le pilote Électronique (seed / migration). */
export const ELECTRONICS_FORM_PROFILE = 'electronics' as const;

/**
 * Indique si l’UI doit charger les attributs dynamiques du pilote Véhicules pour cette catégorie.
 *
 * Règles (conservatrices) :
 * - Si `form_profile === 'vehicle'` → true (aligné web / `getEffectiveCategoryAttributeDefinitionsResolved`).
 * - Si `form_profile` est null/absent (données incomplètes) → repli sur `category_id === VEHICLE_LISTING_CATEGORY_ID` (5).
 * - Sinon → false (n’ouvre pas electronics, food, etc.).
 * - Supabase non configuré ou erreur lecture catégorie → repli sur l’id 5 uniquement.
 */
export async function shouldUseVehicleDynamicPilot(
  categoryId: number | null | undefined
): Promise<boolean> {
  if (categoryId == null || !Number.isFinite(categoryId) || categoryId <= 0) {
    return false;
  }

  if (!supabaseRuntime.isConfigured) {
    return categoryId === VEHICLE_LISTING_CATEGORY_ID;
  }

  try {
    const { data: cat, error } = await supabase
      .from('categories')
      .select('form_profile')
      .eq('id', categoryId)
      .maybeSingle();

    if (error || !cat) {
      return categoryId === VEHICLE_LISTING_CATEGORY_ID;
    }

    const fp = cat.form_profile;
    if (fp === VEHICLE_FORM_PROFILE) {
      return true;
    }
    if (fp == null || String(fp).trim() === '') {
      return categoryId === VEHICLE_LISTING_CATEGORY_ID;
    }
    return false;
  } catch {
    return categoryId === VEHICLE_LISTING_CATEGORY_ID;
  }
}

/**
 * Création (**Vendre**) et **édition** d’annonce : charge les attributs dynamiques pour **Véhicules** ou **Électronique** uniquement.
 * Une seule lecture `categories` ; **n’active pas** food ni d’autres profils.
 */
export async function shouldUseDynamicAttributesPilot(
  categoryId: number | null | undefined
): Promise<boolean> {
  if (categoryId == null || !Number.isFinite(categoryId) || categoryId <= 0) {
    return false;
  }

  if (!supabaseRuntime.isConfigured) {
    return (
      categoryId === VEHICLE_LISTING_CATEGORY_ID ||
      categoryId === ELECTRONICS_ROOT_LISTING_CATEGORY_ID
    );
  }

  try {
    const { data: cat, error } = await supabase
      .from('categories')
      .select('form_profile')
      .eq('id', categoryId)
      .maybeSingle();

    if (error || !cat) {
      return (
        categoryId === VEHICLE_LISTING_CATEGORY_ID ||
        categoryId === ELECTRONICS_ROOT_LISTING_CATEGORY_ID
      );
    }

    const fp = cat.form_profile;
    if (fp === VEHICLE_FORM_PROFILE || fp === ELECTRONICS_FORM_PROFILE) {
      return true;
    }
    if (fp == null || String(fp).trim() === '') {
      return (
        categoryId === VEHICLE_LISTING_CATEGORY_ID ||
        categoryId === ELECTRONICS_ROOT_LISTING_CATEGORY_ID
      );
    }
    return false;
  } catch {
    return (
      categoryId === VEHICLE_LISTING_CATEGORY_ID ||
      categoryId === ELECTRONICS_ROOT_LISTING_CATEGORY_ID
    );
  }
}
