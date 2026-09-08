/**
 * Pure search filter helpers — no I/O, no React.
 */

import { getMarketplaceCategoryIdByLabel } from '@/lib/marketplaceCategories';

export const PRICE_INPUT_PATTERN = /^\d+$/;

export type AppliedPriceFilters = {
  min: number | null;
  max: number | null;
};

export type AppliedSearchFilters = {
  category: string | null;
  categoryId: number | null;
  city: string | null;
};

export function normalizeFilterText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function normalizeMatchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getCategoryIdByLabel(
  label: string | null,
  categories: { id: number; name: string; slug?: string | null }[]
): number | null {
  return getMarketplaceCategoryIdByLabel(categories, label);
}

export function parsePriceValue(
  value: string,
  invalidMessage: string
): { value: number | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, error: null };
  if (!PRICE_INPUT_PATTERN.test(trimmed)) {
    return { value: null, error: invalidMessage };
  }
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: invalidMessage };
  }
  return { value: parsed, error: null };
}

export function validatePriceFilters(
  priceMin: string,
  priceMax: string
): {
  min: number | null;
  max: number | null;
  error: string | null;
} {
  const minResult = parsePriceValue(priceMin, 'Prix minimum invalide');
  if (minResult.error) {
    return { min: null, max: null, error: minResult.error };
  }
  const maxResult = parsePriceValue(priceMax, 'Prix maximum invalide');
  if (maxResult.error) {
    return { min: null, max: null, error: maxResult.error };
  }
  if (minResult.value != null && maxResult.value != null && minResult.value > maxResult.value) {
    return { min: null, max: null, error: 'La fourchette de prix est incohérente' };
  }
  return { min: minResult.value, max: maxResult.value, error: null };
}
