import type { RefObject } from 'react';
import { Platform } from 'react-native';
import type { ScrollView, View } from 'react-native';

/** Marge sous le champ focalisé (au-dessus du clavier / bas d’écran redimensionné). */
export const SELL_DETAILS_KEYBOARD_FOCUS_MARGIN_DP = 24;

export type SellDetailsKeyboardFieldId = 'title' | 'description' | 'price' | 'city';

export function sellDetailsKeyboardFocusMargin(fontScale: number): number {
  const base = SELL_DETAILS_KEYBOARD_FOCUS_MARGIN_DP;
  if (!Number.isFinite(fontScale) || fontScale <= 1) return base;
  return base + Math.round((fontScale - 1) * 16);
}

/**
 * Décalage vertical ScrollView à appliquer quand le bas du champ dépasse le viewport utile.
 * Coordonnées écran (`measureInWindow`) ; sur Android resize le `viewportHeight` reflète la zone au-dessus du clavier.
 */
export function computeSellDetailsScrollDeltaY(input: {
  fieldPageY: number;
  fieldHeight: number;
  viewportHeight: number;
  marginDp?: number;
  fontScale?: number;
}): number {
  const margin = input.marginDp ?? sellDetailsKeyboardFocusMargin(input.fontScale ?? 1);
  const fieldBottom = input.fieldPageY + input.fieldHeight;
  const visibleBottom = input.viewportHeight - margin;
  if (!Number.isFinite(fieldBottom) || !Number.isFinite(visibleBottom)) return 0;
  if (fieldBottom <= visibleBottom) return 0;
  return fieldBottom - visibleBottom;
}

export function nextSellDetailsScrollOffsetY(
  currentScrollY: number,
  deltaY: number
): number | null {
  if (deltaY <= 0) return null;
  const next = currentScrollY + deltaY;
  return Number.isFinite(next) ? Math.max(0, next) : null;
}

export function shouldRunSellDetailsAndroidFocusScroll(
  platformOs: string,
  stepId: string
): boolean {
  return platformOs === 'android' && stepId === 'details';
}

export function scheduleSellDetailsFieldScroll(
  run: () => void,
  platformOs: string = Platform.OS
): void {
  if (platformOs === 'android') {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return;
  }
  run();
}

export function scrollSellDetailsFieldIntoView(input: {
  scrollRef: RefObject<ScrollView | null>;
  anchor: View;
  currentScrollY: number;
  viewportHeight: number;
  fontScale?: number;
}): void {
  const scroll = input.scrollRef.current;
  if (!scroll) return;

  input.anchor.measureInWindow((_x, fieldPageY, _w, fieldHeight) => {
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY,
      fieldHeight,
      viewportHeight: input.viewportHeight,
      fontScale: input.fontScale ?? 1,
    });
    const next = nextSellDetailsScrollOffsetY(input.currentScrollY, delta);
    if (next == null) return;
    scroll.scrollTo({ y: next, animated: true });
  });
}
