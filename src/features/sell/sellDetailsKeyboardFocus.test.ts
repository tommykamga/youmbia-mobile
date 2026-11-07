import { describe, expect, it } from 'vitest';
import {
  computeSellDetailsScrollDeltaY,
  nextSellDetailsScrollOffsetY,
  sellDetailsKeyboardFocusMargin,
  shouldRunSellDetailsAndroidFocusScroll,
} from './sellDetailsKeyboardFocus';

describe('computeSellDetailsScrollDeltaY', () => {
  const viewport = 360;

  it('ne scroll pas si le champ est déjà visible', () => {
    expect(
      computeSellDetailsScrollDeltaY({
        fieldPageY: 100,
        fieldHeight: 52,
        viewportHeight: viewport,
      })
    ).toBe(0);
  });

  it('scroll quand Prix / ville sont sous le viewport (clavier resize)', () => {
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY: 320,
      fieldHeight: 52,
      viewportHeight: viewport,
    });
    expect(delta).toBeGreaterThan(0);
    expect(nextSellDetailsScrollOffsetY(120, delta)).toBe(120 + delta);
  });

  it('augmente la marge avec fontScale 1.3 / 1.6', () => {
    const base = computeSellDetailsScrollDeltaY({
      fieldPageY: 340,
      fieldHeight: 52,
      viewportHeight: viewport,
      fontScale: 1,
    });
    const large = computeSellDetailsScrollDeltaY({
      fieldPageY: 340,
      fieldHeight: 52,
      viewportHeight: viewport,
      fontScale: 1.6,
    });
    expect(sellDetailsKeyboardFocusMargin(1.6)).toBeGreaterThan(sellDetailsKeyboardFocusMargin(1));
    expect(large).toBeGreaterThanOrEqual(base);
  });

  it('petite hauteur utile (écran court)', () => {
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY: 280,
      fieldHeight: 52,
      viewportHeight: 300,
    });
    expect(delta).toBe(280 + 52 - (300 - sellDetailsKeyboardFocusMargin(1)));
  });
});

describe('shouldRunSellDetailsAndroidFocusScroll', () => {
  it('uniquement Android étape details', () => {
    expect(shouldRunSellDetailsAndroidFocusScroll('android', 'details')).toBe(true);
    expect(shouldRunSellDetailsAndroidFocusScroll('android', 'photos')).toBe(false);
    expect(shouldRunSellDetailsAndroidFocusScroll('ios', 'details')).toBe(false);
  });
});

describe('nextSellDetailsScrollOffsetY', () => {
  it('retourne null sans déplacement', () => {
    expect(nextSellDetailsScrollOffsetY(50, 0)).toBeNull();
  });

  it('fermeture clavier : viewport élargi → pas de scroll supplémentaire', () => {
    const deltaAfterDismiss = computeSellDetailsScrollDeltaY({
      fieldPageY: 320,
      fieldHeight: 52,
      viewportHeight: 640,
    });
    expect(deltaAfterDismiss).toBe(0);
    expect(nextSellDetailsScrollOffsetY(200, deltaAfterDismiss)).toBeNull();
  });
});
