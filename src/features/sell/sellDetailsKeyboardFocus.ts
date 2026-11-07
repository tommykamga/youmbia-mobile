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

export function isSellDetailsWindowResizedForKeyboard(input: {
  windowHeight: number;
  baselineWindowHeight: number;
  keyboardInset: number;
}): boolean {
  const { windowHeight, baselineWindowHeight, keyboardInset } = input;
  if (keyboardInset <= 0 || baselineWindowHeight <= 0) return false;
  return windowHeight < baselineWindowHeight - keyboardInset * 0.45;
}

/**
 * Bas du viewport utile pour `measureInWindow` (Y max visible au-dessus du clavier).
 * Gère adjustResize (fenêtre réduite) et overlay (fenêtre pleine + keyboardScreenY / inset).
 */
export function resolveSellDetailsVisibleBottom(input: {
  windowHeight: number;
  baselineWindowHeight: number;
  keyboardInset: number;
  keyboardScreenY: number | null;
  fontScale?: number;
}): number {
  const margin = sellDetailsKeyboardFocusMargin(input.fontScale ?? 1);
  let visibleBottom: number;
  if (
    input.keyboardScreenY != null &&
    Number.isFinite(input.keyboardScreenY) &&
    input.keyboardScreenY > margin
  ) {
    visibleBottom = input.keyboardScreenY - margin;
  } else if (input.keyboardInset <= 0) {
    visibleBottom = input.windowHeight - margin;
  } else if (
    isSellDetailsWindowResizedForKeyboard({
      windowHeight: input.windowHeight,
      baselineWindowHeight: input.baselineWindowHeight,
      keyboardInset: input.keyboardInset,
    })
  ) {
    visibleBottom = input.windowHeight - margin;
  } else {
    visibleBottom = input.windowHeight - input.keyboardInset - margin;
  }

  const windowBottom = input.windowHeight - margin;
  if (!Number.isFinite(visibleBottom)) return Math.max(margin, windowBottom);
  return Math.min(Math.max(margin, visibleBottom), windowBottom);
}

/**
 * Décalage vertical ScrollView quand le bas du champ dépasse le viewport utile.
 */
export function computeSellDetailsScrollDeltaY(input: {
  fieldPageY: number;
  fieldHeight: number;
  visibleBottom: number;
}): number {
  const fieldBottom = input.fieldPageY + input.fieldHeight;
  if (!Number.isFinite(fieldBottom) || !Number.isFinite(input.visibleBottom)) return 0;
  if (fieldBottom <= input.visibleBottom) return 0;
  return fieldBottom - input.visibleBottom;
}

/** @deprecated Préférer visibleBottom via resolveSellDetailsVisibleBottom */
export function computeSellDetailsScrollDeltaYFromViewport(input: {
  fieldPageY: number;
  fieldHeight: number;
  viewportHeight: number;
  marginDp?: number;
  fontScale?: number;
}): number {
  const margin = input.marginDp ?? sellDetailsKeyboardFocusMargin(input.fontScale ?? 1);
  return computeSellDetailsScrollDeltaY({
    fieldPageY: input.fieldPageY,
    fieldHeight: input.fieldHeight,
    visibleBottom: input.viewportHeight - margin,
  });
}

export function nextSellDetailsScrollOffsetY(
  currentScrollY: number,
  deltaY: number
): number | null {
  if (deltaY <= 0) return null;
  const next = currentScrollY + deltaY;
  return Number.isFinite(next) ? Math.max(0, next) : null;
}

export function sellDetailsAndroidKeyboardContentPadding(input: {
  keyboardInset: number;
  windowHeight: number;
  baselineWindowHeight: number;
  extraDp?: number;
}): number {
  const extra = input.extraDp ?? SELL_DETAILS_KEYBOARD_FOCUS_MARGIN_DP;
  if (input.keyboardInset <= 0) return 0;
  if (
    isSellDetailsWindowResizedForKeyboard({
      windowHeight: input.windowHeight,
      baselineWindowHeight: input.baselineWindowHeight,
      keyboardInset: input.keyboardInset,
    })
  ) {
    return extra;
  }
  return input.keyboardInset + extra;
}

export function shouldRunSellDetailsAndroidFocusScroll(
  platformOs: string,
  stepId: string
): boolean {
  return platformOs === 'android' && stepId === 'details';
}

export type CancelSellDetailsFieldScroll = () => void;

const SELL_DETAILS_FOCUS_SCROLL_RETRY_MS = [72, 168] as const;

export function scheduleSellDetailsFieldScroll(
  run: () => void,
  platformOs: string = Platform.OS
): CancelSellDetailsFieldScroll {
  let cancelled = false;
  const invoke = () => {
    if (!cancelled) run();
  };

  let rafOuter: number | undefined;
  let rafInner: number | undefined;
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];

  if (platformOs === 'android') {
    rafOuter = requestAnimationFrame(() => {
      if (cancelled) return;
      rafInner = requestAnimationFrame(invoke);
    });
    for (const delay of SELL_DETAILS_FOCUS_SCROLL_RETRY_MS) {
      timeoutIds.push(setTimeout(invoke, delay));
    }
  } else {
    invoke();
  }

  return () => {
    cancelled = true;
    if (rafOuter != null) cancelAnimationFrame(rafOuter);
    if (rafInner != null) cancelAnimationFrame(rafInner);
    for (const id of timeoutIds) {
      clearTimeout(id);
    }
  };
}

export function scrollSellDetailsFieldIntoView(input: {
  scrollRef: RefObject<ScrollView | null>;
  anchor: View;
  currentScrollY: number;
  windowHeight: number;
  baselineWindowHeight: number;
  keyboardInset: number;
  keyboardScreenY: number | null;
  fontScale?: number;
}): void {
  const scroll = input.scrollRef.current;
  if (!scroll) return;

  const visibleBottom = resolveSellDetailsVisibleBottom({
    windowHeight: input.windowHeight,
    baselineWindowHeight: input.baselineWindowHeight,
    keyboardInset: input.keyboardInset,
    keyboardScreenY: input.keyboardScreenY,
    fontScale: input.fontScale ?? 1,
  });

  input.anchor.measureInWindow((_x, fieldPageY, _w, fieldHeight) => {
    const delta = computeSellDetailsScrollDeltaY({
      fieldPageY,
      fieldHeight,
      visibleBottom,
    });
    const next = nextSellDetailsScrollOffsetY(input.currentScrollY, delta);
    if (next == null) return;
    scroll.scrollTo({ y: next, animated: true });
  });
}
