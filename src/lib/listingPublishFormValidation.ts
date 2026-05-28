/** Règles de qualité formulaire publication annonce (mobile, aligné Sprint Quality V1). */

export const LISTING_TITLE_MIN = 5;
export const LISTING_TITLE_MAX = 80;
export const LISTING_DESCRIPTION_MIN = 20;
export const LISTING_DESCRIPTION_MAX = 2000;
export const LISTING_CITY_MAX = 20;

/** Séparateurs indiquant plusieurs villes (virgule, slash, tiret, etc.). */
const MULTI_CITY_SEPARATOR = /[,/\-;|]/;

/** Conserve uniquement les chiffres (bloque 50k, 50000f, 50.000 FCFA, etc.). */
export function sanitizeListingPriceDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function parseListingPrice(priceStr: string): number {
  const digits = sanitizeListingPriceDigits(priceStr);
  if (!digits) return NaN;
  const price = Number(digits);
  return Number.isFinite(price) ? price : NaN;
}

export function validateListingTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return 'Titre requis';
  if (trimmed.length < LISTING_TITLE_MIN) {
    return `Minimum ${LISTING_TITLE_MIN} caractères`;
  }
  if (trimmed.length > LISTING_TITLE_MAX) {
    return `Maximum ${LISTING_TITLE_MAX} caractères`;
  }
  return null;
}

export function validateListingDescription(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return 'Description requise';
  if (trimmed.length < LISTING_DESCRIPTION_MIN) {
    return `Minimum ${LISTING_DESCRIPTION_MIN} caractères`;
  }
  if (trimmed.length > LISTING_DESCRIPTION_MAX) {
    return `Maximum ${LISTING_DESCRIPTION_MAX} caractères`;
  }
  return null;
}

export function validateListingPrice(priceStr: string): string | null {
  const digits = sanitizeListingPriceDigits(priceStr);
  if (!digits) return 'Prix requis';
  const price = Number(digits);
  if (!Number.isFinite(price) || price <= 0) {
    return 'Le prix doit être supérieur à 0';
  }
  return null;
}

/** Ville optionnelle : format uniquement si renseignée. */
export function validateListingCity(city: string): string | null {
  const trimmed = city.trim();
  if (!trimmed) return null;
  if (trimmed.length > LISTING_CITY_MAX) {
    return `Maximum ${LISTING_CITY_MAX} caractères`;
  }
  if (MULTI_CITY_SEPARATOR.test(trimmed)) {
    return 'Indiquez une seule ville';
  }
  return null;
}

export function shouldShowListingFieldError(
  value: string,
  error: string | null,
  validationAttempted: boolean
): boolean {
  if (!error) return false;
  if (validationAttempted) return true;
  return value.trim().length > 0;
}
