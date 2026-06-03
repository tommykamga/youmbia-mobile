import React, { forwardRef } from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Platform,
  ScrollView,
} from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { KeyboardSafeView } from './KeyboardSafeView';
import { colors, spacing } from '@/theme';

type ScreenProps = {
  children: React.ReactNode;
  /** No padding; use for full-bleed layouts. */
  noPadding?: boolean;
  /** Use safe area insets (default true). */
  safe?: boolean;
  /** Optional style for the outer container. */
  style?: StyleProp<ViewStyle>;
  /** Scrollable content. */
  scroll?: boolean;
  /** Optional ScrollView contentContainerStyle override. */
  scrollContentContainerStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding (useful when keyboard is open). */
  scrollExtraBottomPadding?: number;
  /** Keyboard avoiding (useful for auth forms). */
  keyboardAvoid?: boolean;
  /** Keyboard vertical offset (iOS, utilisé avec KeyboardAvoidingView). */
  keyboardVerticalOffset?: number;
  /** Header fixe au-dessus du scroll (ex. AppHeader sur gate auth). */
  stickyHeader?: React.ReactNode;
  /**
   * Insets clavier natifs du ScrollView (défaut true si keyboardAvoid + scroll).
   * Désactiver si le parent gère le scroll manuellement (ex. gate).
   */
  keyboardAutoInsetAdjust?: boolean;
};

/**
 * Screen – full-height container with safe area, background, optional scroll/keyboard avoid.
 * Web: equivalent to a full-viewport page with bg-[var(--background)] and padding; mobile-native safe insets.
 */
export const Screen = forwardRef<ScrollViewType, ScreenProps>(function Screen(
  {
    children,
    noPadding,
    safe = true,
    style,
    scroll = false,
    scrollContentContainerStyle,
    scrollExtraBottomPadding,
    keyboardAvoid = false,
    keyboardVerticalOffset = 0,
    stickyHeader,
    keyboardAutoInsetAdjust,
  },
  ref
) {
  const insets = useSafeAreaInsets();

  const paddingStyle = {
    paddingTop: safe ? insets.top : 0,
    paddingBottom: safe ? insets.bottom : 0,
    paddingLeft: noPadding ? 0 : spacing.base,
    paddingRight: noPadding ? 0 : spacing.base,
  };

  const scrollKeyboardInsets = keyboardAvoid && scroll && Platform.OS !== 'web';
  const autoInsetAdjust =
    keyboardAutoInsetAdjust ?? scrollKeyboardInsets;
  const keyboardInset = useKeyboardInset(scrollKeyboardInsets);

  /** Espace scrollable sous le formulaire quand le clavier est ouvert. */
  const keyboardScrollPadding =
    scrollKeyboardInsets && keyboardInset > 0
      ? keyboardInset + spacing['3xl']
      : 0;

  const extraBottom =
    (typeof scrollExtraBottomPadding === 'number' && scrollExtraBottomPadding > 0
      ? scrollExtraBottomPadding
      : 0) + keyboardScrollPadding;

  const scrollView = scroll ? (
    <ScrollView
      ref={ref}
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        scrollKeyboardInsets ? styles.scrollContentKeyboard : null,
        extraBottom > 0 ? { paddingBottom: extraBottom } : null,
        scrollContentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={scrollKeyboardInsets ? 'interactive' : undefined}
      automaticallyAdjustKeyboardInsets={scrollKeyboardInsets && autoInsetAdjust}
      contentInsetAdjustmentBehavior={
        scrollKeyboardInsets && autoInsetAdjust ? 'automatic' : undefined
      }
      nestedScrollEnabled
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  const content = (
    <View style={[styles.container, paddingStyle, style]}>
      {stickyHeader}
      {scrollView}
    </View>
  );

  if (keyboardAvoid && !scroll) {
    return (
      <KeyboardSafeView
        style={styles.keyboardView}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {content}
      </KeyboardSafeView>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentKeyboard: {
    flexGrow: 0,
  },
  keyboardView: {
    flex: 1,
  },
});
