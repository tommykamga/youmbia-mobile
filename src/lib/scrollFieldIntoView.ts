import { Dimensions } from 'react-native';
import type { RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

const DEFAULT_TOP_MARGIN = 24;
const DEFAULT_BOTTOM_MARGIN = 20;

/**
 * Scroll minimal pour garder un champ visible (label + input) sans sur-scroll en haut.
 */
export function scrollFieldIntoView(
  scrollRef: RefObject<ScrollView | null>,
  contentRef: RefObject<View | null>,
  fieldRef: RefObject<View | null>,
  topMargin = DEFAULT_TOP_MARGIN,
  keyboardHeight = 0
): void {
  const scroll = scrollRef.current;
  const content = contentRef.current;
  const field = fieldRef.current;
  if (!scroll || !content || !field) return;

  const windowHeight = Dimensions.get('window').height;
  const visibleBottom = windowHeight - keyboardHeight - topMargin;

  field.measureInWindow((_x, fieldY, _w, fieldHeight) => {
    const fieldBottom = fieldY + fieldHeight;
    const isFullyVisible = fieldY >= topMargin && fieldBottom <= visibleBottom;

    if (isFullyVisible) return;

    field.measureLayout(
      content,
      (_left, top) => {
        scroll.scrollTo({
          y: Math.max(0, top - topMargin),
          animated: true,
        });
      },
      () => {
        /* ignore */
      }
    );
  });
}

/**
 * Aligne le bas d’un élément (ex. bouton « Se connecter ») juste au-dessus du clavier.
 */
export function scrollFieldBottomAboveKeyboard(
  scrollRef: RefObject<ScrollView | null>,
  contentRef: RefObject<View | null>,
  fieldRef: RefObject<View | null>,
  keyboardHeight: number,
  bottomMargin = DEFAULT_BOTTOM_MARGIN,
  /** Zone non scrollable en haut (header fixe + titre). */
  headerOffset = 100
): void {
  const scroll = scrollRef.current;
  const content = contentRef.current;
  const field = fieldRef.current;
  if (!scroll || !content || !field || keyboardHeight <= 0) return;

  const windowHeight = Dimensions.get('window').height;
  const visibleBottom = windowHeight - keyboardHeight - bottomMargin;

  field.measureInWindow((_x, fieldY, _w, fieldHeight) => {
    const fieldBottom = fieldY + fieldHeight;
    if (fieldBottom <= visibleBottom) return;

    const viewport = windowHeight - keyboardHeight - headerOffset - bottomMargin;

    field.measureLayout(
      content,
      (_left, top, _width, height) => {
        scroll.scrollTo({
          y: Math.max(0, top + height - viewport),
          animated: true,
        });
      },
      () => {
        /* ignore */
      }
    );
  });
}
