import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  /** Keyboard vertical offset (iOS). */
  keyboardVerticalOffset?: number;
};

/**
 * Screen – full-height container with safe area, background, optional scroll/keyboard avoid.
 * Web: equivalent to a full-viewport page with bg-[var(--background)] and padding; mobile-native safe insets.
 */
export function Screen({
  children,
  noPadding,
  safe = true,
  style,
  scroll = false,
  scrollContentContainerStyle,
  scrollExtraBottomPadding,
  keyboardAvoid = false,
  keyboardVerticalOffset = 0,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingStyle = {
    paddingTop: safe ? insets.top : 0,
    paddingBottom: safe ? insets.bottom : 0,
    paddingLeft: noPadding ? 0 : spacing.base,
    paddingRight: noPadding ? 0 : spacing.base,
  };

  const content = (
    <View style={[styles.container, paddingStyle, style]}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            typeof scrollExtraBottomPadding === 'number' && scrollExtraBottomPadding > 0
              ? { paddingBottom: scrollExtraBottomPadding }
              : null,
            scrollContentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );

  if (keyboardAvoid) {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
}

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
  keyboardView: {
    flex: 1,
  },
});
