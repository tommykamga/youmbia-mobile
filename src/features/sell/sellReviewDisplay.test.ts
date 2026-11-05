import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/format';
import {
  buildSellReviewDynamicAttributeLines,
  buildSellReviewPhotoUris,
  computeSellReviewPreviewImageHeight,
  formatSellReviewPriceDisplay,
} from './sellReviewDisplay';

const GROUP = '\u202f';
const NBSP = '\u00a0';

describe('sellReviewDisplay', () => {
  it('borne la hauteur preview entre 128 et 160 px', () => {
    expect(computeSellReviewPreviewImageHeight(320)).toBeGreaterThanOrEqual(128);
    expect(computeSellReviewPreviewImageHeight(320)).toBeLessThanOrEqual(160);
  });

  it('assemble les URIs photo avec couverture en tête', () => {
    const uris = buildSellReviewPhotoUris(2, [], [
      { uri: 'file://a', base64: null },
      { uri: 'file://b', base64: null },
    ]);
    expect(uris).toHaveLength(2);
    expect(uris[0]?.isCover).toBe(true);
    expect(uris[0]?.uri).toBe('file://a');
  });

  describe('formatSellReviewPriceDisplay (FCFA français)', () => {
    it('formate 21 539 680 FCFA avec séparateurs U+202F', () => {
      const expected = `21${GROUP}539${GROUP}680${NBSP}FCFA`;
      expect(formatSellReviewPriceDisplay('21539680')).toBe(expected);
      expect(formatSellReviewPriceDisplay('21 539 680')).toBe(expected);
      expect(formatSellReviewPriceDisplay('21\u202f539\u202f680')).toBe(expected);
    });

    it.each([
      ['50000', `50${GROUP}000${NBSP}FCFA`],
      ['85000', `85${GROUP}000${NBSP}FCFA`],
      ['1234567890', `1${GROUP}234${GROUP}567${GROUP}890${NBSP}FCFA`],
    ] as const)('aligne la chaîne saisie sur formatPrice (%s)', (input, expected) => {
      expect(formatSellReviewPriceDisplay(input)).toBe(expected);
      expect(formatSellReviewPriceDisplay(input)).toBe(formatPrice(Number(input.replace(/\D/g, ''))));
    });

    it('ne tronque pas les grands montants', () => {
      const out = formatSellReviewPriceDisplay('1234567890');
      expect(out).toBe(formatPrice(1234567890));
      expect(out.endsWith(`${NBSP}FCFA`)).toBe(true);
      expect(out.includes('890')).toBe(true);
      expect(out.split(GROUP).join('').replace(/\u00a0FCFA$/, '').length).toBeGreaterThanOrEqual(10);
    });

    it('retourne — pour vide ou non numérique publiable', () => {
      expect(formatSellReviewPriceDisplay('')).toBe('—');
      expect(formatSellReviewPriceDisplay('   ')).toBe('—');
      expect(formatSellReviewPriceDisplay('abc')).toBe('—');
      expect(formatSellReviewPriceDisplay('0')).toBe('—');
    });
  });

  it('affiche les attributs dynamiques renseignés', () => {
    const lines = buildSellReviewDynamicAttributeLines(
      [
        {
          key: 'brand',
          label_fr: 'Marque',
          type: 'text',
          required: false,
          definition_id: 'd1',
        } as never,
      ],
      { brand: 'Toyota' },
      new Map()
    );
    expect(lines).toEqual([{ label: 'Marque', value: 'Toyota' }]);
  });
});
