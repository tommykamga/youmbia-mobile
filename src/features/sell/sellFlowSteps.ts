import { categoryHasChildren } from '@/lib/marketplaceCategories';
import type { MarketplaceCategory } from '@/services/categories';
import {
  validateListingCity,
  validateListingDescription,
  validateListingPrice,
  validateListingTitle,
} from '@/lib/listingPublishFormValidation';
import type { ListingCategoryId } from '@/lib/listingCategories';

export const SELL_FLOW_SURFACE = '#0B4D3C';

export type SellFlowStepId = 'photos' | 'details' | 'review';

export const SELL_FLOW_STEPS: readonly {
  id: SellFlowStepId;
  label: string;
  stepNumber: number;
}[] = [
  { id: 'photos', label: 'Photos', stepNumber: 1 },
  { id: 'details', label: 'Détails', stepNumber: 2 },
  { id: 'review', label: 'Vérification', stepNumber: 3 },
];

export type SellFlowCompletionInput = {
  totalPhotoCount: number;
  title: string;
  description: string;
  priceStr: string;
  city: string;
  publishCategoryId: ListingCategoryId | null;
  selectedParentCategoryId: ListingCategoryId | null;
  marketplaceCategories: MarketplaceCategory[];
};

export function sellFlowStepIndex(stepId: SellFlowStepId): number {
  return SELL_FLOW_STEPS.findIndex((s) => s.id === stepId);
}

export const SELL_FLOW_HEADER_TITLE = 'Déposer une annonce';

export function formatSellFlowStepIndicator(stepId: SellFlowStepId): string {
  const step = SELL_FLOW_STEPS[sellFlowStepIndex(stepId)];
  if (!step) return '1/3';
  return `${step.stepNumber}/3`;
}

export function formatSellFlowStepSubtitle(stepId: SellFlowStepId): string {
  const step = SELL_FLOW_STEPS[sellFlowStepIndex(stepId)];
  if (!step) return 'Étape 1 sur 3 · Photos';
  return `Étape ${step.stepNumber} sur 3 · ${step.label}`;
}

export type SellFlowStepVisualState = 'done' | 'active' | 'upcoming';

export function resolveSellFlowStepVisualState(
  stepIndex: number,
  activeIndex: number
): SellFlowStepVisualState {
  if (stepIndex < activeIndex) return 'done';
  if (stepIndex === activeIndex) return 'active';
  return 'upcoming';
}

export function sellFlowPreviousStep(stepId: SellFlowStepId): SellFlowStepId | null {
  const idx = sellFlowStepIndex(stepId);
  if (idx <= 0) return null;
  return SELL_FLOW_STEPS[idx - 1]!.id;
}

export function sellFlowNextStep(stepId: SellFlowStepId): SellFlowStepId | null {
  const idx = sellFlowStepIndex(stepId);
  if (idx < 0 || idx >= SELL_FLOW_STEPS.length - 1) return null;
  return SELL_FLOW_STEPS[idx + 1]!.id;
}

function isCategoryComplete(input: SellFlowCompletionInput): boolean {
  if (input.publishCategoryId == null) return false;
  if (
    input.selectedParentCategoryId != null &&
    categoryHasChildren(input.marketplaceCategories, input.selectedParentCategoryId)
  ) {
    return input.publishCategoryId !== input.selectedParentCategoryId;
  }
  return true;
}

/** Champs requis pour publier — même règles que handleSubmit, sans effets de bord. */
export function isSellFlowPublishReady(input: SellFlowCompletionInput): boolean {
  if (input.totalPhotoCount === 0) return false;
  if (validateListingTitle(input.title)) return false;
  if (validateListingDescription(input.description)) return false;
  if (validateListingPrice(input.priceStr)) return false;
  if (!isCategoryComplete(input)) return false;
  const cityValidationError = validateListingCity(input.city);
  if (cityValidationError || input.city.trim().length < 2) return false;
  return true;
}

/** Première étape encore incomplète pour la publication (navigation initiale reprise brouillon). */
export function resolveFirstIncompleteSellFlowStep(input: SellFlowCompletionInput): SellFlowStepId {
  if (input.totalPhotoCount === 0) return 'photos';
  if (
    validateListingTitle(input.title) ||
    validateListingDescription(input.description) ||
    validateListingPrice(input.priceStr) ||
    !isCategoryComplete(input)
  ) {
    return 'details';
  }
  const cityValidationError = validateListingCity(input.city);
  if (cityValidationError || input.city.trim().length < 2) return 'details';
  return 'review';
}

export function shouldHideSellStickyFooter(
  keyboardVisible: boolean,
  stepId: SellFlowStepId
): boolean {
  return keyboardVisible && stepId === 'details';
}

export function resolveInitialSellFlowStep(input: SellFlowCompletionInput): SellFlowStepId {
  if (isSellFlowPublishReady(input)) return 'review';
  return resolveFirstIncompleteSellFlowStep(input);
}
