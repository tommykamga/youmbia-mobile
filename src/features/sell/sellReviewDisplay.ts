import { parseListingPrice } from '@/lib/listingPublishFormValidation';
import { formatPrice } from '@/lib/format';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';
import type { SellExistingDraftImage, SellPickedImage } from './SellStepPhotos';

export type SellReviewCoverImage = {
  uri: string;
  isCover: boolean;
};

/** URIs dans l'ordre d'affichage (couverture = index 0). */
export function buildSellReviewPhotoUris(
  totalPhotoCount: number,
  existingDraftImages: SellExistingDraftImage[],
  pickedImages: SellPickedImage[]
): SellReviewCoverImage[] {
  const out: SellReviewCoverImage[] = [];
  for (let i = 0; i < totalPhotoCount; i++) {
    const existing = existingDraftImages[i];
    const picked =
      i >= existingDraftImages.length ? pickedImages[i - existingDraftImages.length] : undefined;
    const uri = existing?.displayUrl ?? picked?.uri;
    if (uri) out.push({ uri, isCover: i === 0 });
  }
  return out;
}

/** Hauteur image preview Vérification — ratio 4:3, bornée pour petits écrans. */
export function computeSellReviewPreviewImageHeight(contentInnerWidth: number): number {
  const w = Math.max(0, Math.floor(contentInnerWidth));
  const ratioHeight = Math.round((w * 3) / 4);
  return Math.min(160, Math.max(128, ratioHeight));
}

/**
 * Affichage prix étape Vérification — délègue à {@link formatPrice} (séparateurs U+202F, suffixe NBSP+FCFA).
 * Ne modifie pas la valeur saisie ni les validations (`parseListingPrice` inchangé côté publish).
 */
export function formatSellReviewPriceDisplay(priceStr: string): string {
  const trimmed = priceStr.trim();
  if (!trimmed) return '—';
  const amount = parseListingPrice(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  const formatted = formatPrice(amount);
  return formatted || '—';
}

export type SellReviewAttributeLine = { label: string; value: string };

export function buildSellReviewDynamicAttributeLines(
  definitions: EffectiveCategoryAttributeDefinitionResolved[],
  values: Record<string, string>,
  optionsByDefinitionId: Map<string, CategoryAttributeOption[]>
): SellReviewAttributeLine[] {
  const lines: SellReviewAttributeLine[] = [];
  for (const def of definitions) {
    const raw = (values[def.key] ?? '').trim();
    if (!raw) continue;
    let value = raw;
    if (def.type === 'select') {
      const opt = (optionsByDefinitionId.get(def.definition_id) ?? []).find((o) => o.value === raw);
      value = opt?.label_fr ?? raw;
    } else if (def.type === 'boolean') {
      if (raw === 'true') value = 'Oui';
      else if (raw === 'false') value = 'Non';
    }
    lines.push({ label: def.label_fr, value });
  }
  return lines;
}
