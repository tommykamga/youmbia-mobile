import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeSellDetailsScrollDeltaY,
  computeSellDetailsScrollDeltaYFromViewport,
  isSellDetailsWindowResizedForKeyboard,
  nextSellDetailsScrollOffsetY,
  resolveSellDetailsVisibleBottom,
  scheduleSellDetailsFieldScroll,
  sellDetailsAndroidKeyboardContentPadding,
  sellDetailsKeyboardFocusMargin,
  shouldRunSellDetailsAndroidFocusScroll,
} from './sellDetailsKeyboardFocus';

describe('resolveSellDetailsVisibleBottom', () => {
  const baseline = 800;

  it('utilise keyboardScreenY en priorité (overlay OPPO)', () => {
    const bottom = resolveSellDetailsVisibleBottom({
      windowHeight: 800,
      baselineWindowHeight: baseline,
      keyboardInset: 320,
      keyboardScreenY: 480,
    });
    expect(bottom).toBe(480 - sellDetailsKeyboardFocusMargin(1));
  });

  it('resize : fenêtre réduite sans double soustraction clavier', () => {
    const bottom = resolveSellDetailsVisibleBottom({
      windowHeight: 480,
      baselineWindowHeight: baseline,
      keyboardInset: 320,
      keyboardScreenY: null,
    });
    expect(bottom).toBe(480 - sellDetailsKeyboardFocusMargin(1));
  });

  it('overlay sans screenY : soustrait keyboardInset', () => {
    const bottom = resolveSellDetailsVisibleBottom({
      windowHeight: 800,
      baselineWindowHeight: baseline,
      keyboardInset: 320,
      keyboardScreenY: null,
    });
    expect(bottom).toBe(800 - 320 - sellDetailsKeyboardFocusMargin(1));
  });

  it('clavier fermé : pleine hauteur fenêtre', () => {
    const bottom = resolveSellDetailsVisibleBottom({
      windowHeight: 800,
      baselineWindowHeight: 800,
      keyboardInset: 0,
      keyboardScreenY: null,
    });
    expect(bottom).toBe(800 - sellDetailsKeyboardFocusMargin(1));
  });

  it('borne visibleBottom dans [marge, windowHeight - marge]', () => {
    const bottom = resolveSellDetailsVisibleBottom({
      windowHeight: 400,
      baselineWindowHeight: 800,
      keyboardInset: 300,
      keyboardScreenY: 9999,
    });
    const margin = sellDetailsKeyboardFocusMargin(1);
    expect(bottom).toBeGreaterThanOrEqual(margin);
    expect(bottom).toBeLessThanOrEqual(400 - margin);
  });
});

describe('scheduleSellDetailsFieldScroll', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('annule les retries 72/168 ms', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let runs = 0;
    const cancel = scheduleSellDetailsFieldScroll(() => {
      runs += 1;
    }, 'android');
    cancel();
    vi.advanceTimersByTime(200);
    expect(runs).toBe(0);
  });
});

describe('computeSellDetailsScrollDeltaY', () => {
  it('ne scroll pas si le champ est déjà visible', () => {
    expect(
      computeSellDetailsScrollDeltaY({
        fieldPageY: 100,
        fieldHeight: 52,
        visibleBottom: 400,
      })
    ).toBe(0);
  });

  it('scroll quand Prix / ville sont sous le viewport', () => {
    const visibleBottom = 360 - sellDetailsKeyboardFocusMargin(1);
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY: 320,
      fieldHeight: 52,
      visibleBottom,
    });
    expect(delta).toBeGreaterThan(0);
    expect(nextSellDetailsScrollOffsetY(120, delta)).toBe(120 + delta);
  });

  it('legacy viewport helper reste aligné', () => {
    const viewport = 360;
    expect(
      computeSellDetailsScrollDeltaYFromViewport({
        fieldPageY: 320,
        fieldHeight: 52,
        viewportHeight: viewport,
      })
    ).toBe(
      computeSellDetailsScrollDeltaY({
        fieldPageY: 320,
        fieldHeight: 52,
        visibleBottom: viewport - sellDetailsKeyboardFocusMargin(1),
      })
    );
  });

  it('fontScale via visibleBottom résolu', () => {
    const visibleBottom = resolveSellDetailsVisibleBottom({
      windowHeight: 360,
      baselineWindowHeight: 700,
      keyboardInset: 0,
      keyboardScreenY: null,
      fontScale: 1.6,
    });
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY: 340,
      fieldHeight: 52,
      visibleBottom,
    });
    expect(sellDetailsKeyboardFocusMargin(1.6)).toBeGreaterThan(sellDetailsKeyboardFocusMargin(1));
    expect(delta).toBeGreaterThan(0);
  });
});

describe('sellDetailsAndroidKeyboardContentPadding', () => {
  it('padding plein en overlay, léger en resize', () => {
    expect(
      sellDetailsAndroidKeyboardContentPadding({
        keyboardInset: 300,
        windowHeight: 800,
        baselineWindowHeight: 800,
      })
    ).toBe(300 + 24);
    expect(
      sellDetailsAndroidKeyboardContentPadding({
        keyboardInset: 300,
        windowHeight: 500,
        baselineWindowHeight: 800,
      })
    ).toBe(24);
  });
});

describe('isSellDetailsWindowResizedForKeyboard', () => {
  it('détecte fenêtre réduite', () => {
    expect(
      isSellDetailsWindowResizedForKeyboard({
        windowHeight: 480,
        baselineWindowHeight: 800,
        keyboardInset: 320,
      })
    ).toBe(true);
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
    const visibleBottom = 640 - sellDetailsKeyboardFocusMargin(1);
    const deltaAfterDismiss = computeSellDetailsScrollDeltaY({
      fieldPageY: 320,
      fieldHeight: 52,
      visibleBottom,
    });
    expect(deltaAfterDismiss).toBe(0);
    expect(nextSellDetailsScrollOffsetY(200, deltaAfterDismiss)).toBeNull();
  });
});
