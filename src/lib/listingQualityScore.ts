/**
 * Score qualité indicatif pour le formulaire de publication (Sprint Quality V1).
 * Purement client — n’influence pas la validation ni la publication.
 */
import {
  parseListingPrice,
  sanitizeListingPriceDigits,
  validateListingCity,
} from '@/lib/listingPublishFormValidation';

export type ListingQualityInput = {
  title: string;
  description: string;
  priceStr: string;
  city: string;
  imageCount: number;
};

export type ListingQualityResult = {
  score: number;
  label: string;
  subtitle: string;
  priorityTip: string | null;
  progressRatio: number;
};

const TITLE_TIER_1 = 5;
const TITLE_TIER_2 = 20;
const DESCRIPTION_TIER_1 = 20;
const DESCRIPTION_TIER_2 = 80;
const CITY_MIN = 2;
const CITY_MAX = 20;

function scoreTitle(trimmedTitle: string): number {
  let pts = 0;
  if (trimmedTitle.length >= TITLE_TIER_1) pts += 10;
  if (trimmedTitle.length >= TITLE_TIER_2) pts += 10;
  return pts;
}

function scoreDescription(trimmedDescription: string): number {
  let pts = 0;
  if (trimmedDescription.length >= DESCRIPTION_TIER_1) pts += 10;
  if (trimmedDescription.length >= DESCRIPTION_TIER_2) pts += 15;
  return pts;
}

function scorePrice(priceStr: string): number {
  const digits = sanitizeListingPriceDigits(priceStr);
  if (!digits) return 0;
  const price = parseListingPrice(priceStr);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return 20;
}

function scoreCity(trimmedCity: string): number {
  if (!trimmedCity) return 0;
  if (trimmedCity.length < CITY_MIN || trimmedCity.length > CITY_MAX) return 0;
  if (validateListingCity(trimmedCity)) return 0;
  return 15;
}

function scorePhotos(imageCount: number): number {
  let pts = 0;
  if (imageCount >= 1) pts += 10;
  if (imageCount >= 2) pts += 10;
  return pts;
}

function getLabel(score: number): string {
  if (score >= 90) return 'Annonce premium';
  if (score >= 70) return 'Bonne annonce';
  if (score >= 40) return 'Annonce correcte';
  return 'Annonce à compléter';
}

function getSubtitle(label: string, score: number, input: ListingQualityInput): string {
  if (score >= 90) {
    return `${label} — votre annonce est claire et attractive.`;
  }
  if (input.imageCount < 2) {
    return `${label} — ajoutez une photo ou plus de détails pour vendre plus vite.`;
  }
  if (input.description.trim().length < DESCRIPTION_TIER_2) {
    return `${label} — enrichissez la description pour rassurer les acheteurs.`;
  }
  return `${label} — quelques détails en plus peuvent accélérer la vente.`;
}

export function getListingQualityPriorityTip(input: ListingQualityInput): string | null {
  const trimmedTitle = input.title.trim();
  const trimmedDescription = input.description.trim();
  const trimmedCity = input.city.trim();

  if (input.imageCount === 0) {
    return 'Ajoutez au moins une photo nette.';
  }
  if (trimmedDescription.length < DESCRIPTION_TIER_2) {
    return "Ajoutez l'état, les accessoires ou les détails utiles.";
  }
  if (trimmedTitle.length < TITLE_TIER_2) {
    return 'Ajoutez la marque, le modèle ou une précision.';
  }
  if (!trimmedCity || validateListingCity(trimmedCity) || trimmedCity.length < CITY_MIN) {
    return 'Indiquez une seule ville.';
  }
  if (!sanitizeListingPriceDigits(input.priceStr)) {
    return 'Ajoutez un prix clair en FCFA.';
  }
  const price = parseListingPrice(input.priceStr);
  if (!Number.isFinite(price) || price <= 0) {
    return 'Ajoutez un prix clair en FCFA.';
  }
  return null;
}

export function computeListingQualityScore(input: ListingQualityInput): ListingQualityResult {
  const trimmedTitle = input.title.trim();
  const trimmedDescription = input.description.trim();
  const trimmedCity = input.city.trim();

  const rawScore =
    scoreTitle(trimmedTitle) +
    scoreDescription(trimmedDescription) +
    scorePrice(input.priceStr) +
    scoreCity(trimmedCity) +
    scorePhotos(input.imageCount);

  const score = Math.min(100, Math.max(0, rawScore));
  const label = getLabel(score);
  const priorityTip = getListingQualityPriorityTip(input);

  return {
    score,
    label,
    subtitle: getSubtitle(label, score, input),
    priorityTip,
    progressRatio: score / 100,
  };
}
