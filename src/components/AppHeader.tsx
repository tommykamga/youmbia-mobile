/**
 * AppHeader – top bar with back, title, optional right action.
 * Web: same pattern on listing detail, account; mobile-native with safe area.
 * Back: chevron (iOS) / arrow (Android) for platform-appropriate style.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights } from '@/theme';

type AppHeaderProps = {
  title: string;
  /** Show back button (uses router.back()). */
  showBack?: boolean;
  /** Right-side element (e.g. icon button or text). */
  right?: React.ReactNode;
  /** Hide border under the header. */
  noBorder?: boolean;
  style?: ViewStyle;
};

export function AppHeader({
  title,
  showBack = false,
  right,
  noBorder,
  style,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.wrapper,
        { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm },
        !noBorder && styles.border,
        style,
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            hitSlop={12}
          >
            <Ionicons
              name={Platform.OS === 'android' ? 'arrow-back' : 'chevron-back'}
              size={28}
              color={colors.primary}
            />
          </Pressable>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {right ? <View style={styles.right}>{right}</View> : <View style={styles.backPlaceholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  backBtn: {
    minHeight: 40,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backPlaceholder: {
    width: 64,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  right: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
});
