import { describe, expect, it } from 'vitest';
import {
  isSellFlowPublishReady,
  resolveFirstIncompleteSellFlowStep,
  resolveInitialSellFlowStep,
  sellFlowNextStep,
  sellFlowPreviousStep,
  shouldHideSellStickyFooter,
  SELL_FLOW_HEADER_TITLE,
  formatSellFlowStepIndicator,
  formatSellFlowStepSubtitle,
  resolveSellFlowStepVisualState,
} from './sellFlowSteps';

const emptyCategories: never[] = [];

describe('sellFlowSteps header helpers', () => {
  it('formate indicateur et sous-titre par étape', () => {
    expect(SELL_FLOW_HEADER_TITLE).toBe('Déposer une annonce');
    expect(formatSellFlowStepIndicator('photos')).toBe('1/3');
    expect(formatSellFlowStepSubtitle('photos')).toBe('Étape 1 sur 3 · Photos');
    expect(formatSellFlowStepSubtitle('review')).toBe('Étape 3 sur 3 · Vérification');
  });

  it('distingue les états visuels stepper', () => {
    expect(resolveSellFlowStepVisualState(0, 2)).toBe('done');
    expect(resolveSellFlowStepVisualState(2, 2)).toBe('active');
    expect(resolveSellFlowStepVisualState(1, 0)).toBe('upcoming');
  });
});

describe('sellFlowSteps navigation', () => {
  it('navigue entre les trois étapes', () => {
    expect(sellFlowNextStep('photos')).toBe('details');
    expect(sellFlowNextStep('details')).toBe('review');
    expect(sellFlowNextStep('review')).toBeNull();
    expect(sellFlowPreviousStep('photos')).toBeNull();
    expect(sellFlowPreviousStep('review')).toBe('details');
  });

  it('ouvre la vérification si la publication est déjà prête', () => {
    const step = resolveInitialSellFlowStep({
      totalPhotoCount: 2,
      title: 'iPhone 13 Pro Max 256 Go',
      description: 'Très bon état avec boîte et accessoires inclus.',
      priceStr: '350000',
      city: 'Douala',
      publishCategoryId: 12,
      selectedParentCategoryId: 10,
      marketplaceCategories: emptyCategories,
    });
    expect(step).toBe('review');
    expect(
      isSellFlowPublishReady({
        totalPhotoCount: 2,
        title: 'iPhone 13 Pro Max 256 Go',
        description: 'Très bon état avec boîte et accessoires inclus.',
        priceStr: '350000',
        city: 'Douala',
        publishCategoryId: 12,
        selectedParentCategoryId: 10,
        marketplaceCategories: emptyCategories,
      })
    ).toBe(true);
  });

  it('retourne photos si aucune image', () => {
    expect(
      resolveFirstIncompleteSellFlowStep({
        totalPhotoCount: 0,
        title: '',
        description: '',
        priceStr: '',
        city: '',
        publishCategoryId: null,
        selectedParentCategoryId: null,
        marketplaceCategories: emptyCategories,
      })
    ).toBe('photos');
  });

  it('retourne details si titre invalide malgré des photos', () => {
    expect(
      resolveFirstIncompleteSellFlowStep({
        totalPhotoCount: 1,
        title: 'abc',
        description: 'Description suffisamment longue pour le test.',
        priceStr: '1000',
        city: 'Douala',
        publishCategoryId: 5,
        selectedParentCategoryId: 5,
        marketplaceCategories: emptyCategories,
      })
    ).toBe('details');
  });

  it('masque le footer sticky quand le clavier est ouvert sur Détails', () => {
    expect(shouldHideSellStickyFooter(true, 'details')).toBe(true);
    expect(shouldHideSellStickyFooter(true, 'photos')).toBe(false);
    expect(shouldHideSellStickyFooter(false, 'details')).toBe(false);
  });
});
