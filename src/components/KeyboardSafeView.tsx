import React from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type KeyboardSafeViewProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Style optionnel sur le conteneur intérieur (flex:1). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Offset vertical clavier (iOS, passé à KeyboardAvoidingView). */
  keyboardVerticalOffset?: number;
  /**
   * Padding manuel Android basé sur la hauteur clavier.
   * À réserver aux modals / feuilles où `adjustResize` ne s'applique pas.
   * Ne pas activer sur les layouts flex type chat (composer en bas) : double espace avec le système.
   * @default false
   */
  androidInsetPadding?: boolean;
  /**
   * Soustraire le safe area bottom du padding clavier Android (si androidInsetPadding).
   * @default true
   */
  subtractSafeAreaBottom?: boolean;
};

/**
 * Conteneur clavier unifié :
 * - iOS : KeyboardAvoidingView behavior="padding".
 * - Android : layout flex + adjustResize (app.json) ; padding manuel optionnel pour modals.
 * - Web : View simple flex:1.
 */
export function KeyboardSafeView({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  androidInsetPadding = false,
  subtractSafeAreaBottom = true,
}: KeyboardSafeViewProps) {
  const insets = useSafeAreaInsets();
  const androidKeyboardInset = useKeyboardInset(
    Platform.OS === 'android' && androidInsetPadding
  );

  const inner = contentContainerStyle ? (
    <View style={[styles.flex, contentContainerStyle]}>{children}</View>
  ) : (
    children
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {inner}
      </KeyboardAvoidingView>
    );
  }

  if (Platform.OS === 'android') {
    const safeBottom = subtractSafeAreaBottom ? insets.bottom : 0;
    const bottomPad =
      androidInsetPadding && androidKeyboardInset > 0
        ? Math.max(0, androidKeyboardInset - safeBottom)
        : 0;

    return (
      <View
        style={[styles.flex, style, bottomPad > 0 ? { paddingBottom: bottomPad } : null]}
      >
        {inner}
      </View>
    );
  }

  return <View style={[styles.flex, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
