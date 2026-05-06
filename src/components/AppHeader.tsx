/**
 * AppHeader – top bar with back, title, optional right action.
 * Web: same pattern on listing detail, account; mobile-native with safe area.
 * Back: chevron (iOS) / arrow (Android) for platform-appropriate style.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, Pressable, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { BrandSymbol } from './BrandSymbol';

type AppHeaderProps = {
  title: string;
  /** Bandeau logo YOUMBIA au-dessus du titre (onglets type Messages). */
  brandStrip?: boolean;
  /** Densité visuelle du header (pour tabs type Leboncoin). */
  density?: 'default' | 'compact';
  /** Show back button (uses router.back()). */
  showBack?: boolean;
  /** Right-side element (e.g. icon button or text). */
  right?: React.ReactNode;
  /** Hide border under the header. */
  noBorder?: boolean;
  /** Optional override for title typography (e.g. subtler nav label). */
  titleStyle?: TextStyle;
  style?: ViewStyle;
};

export function AppHeader({
  title,
  brandStrip = false,
  density = 'default',
  showBack = false,
  right,
  noBorder,
  titleStyle,
  style,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const fallbackHref: Href = '/(tabs)/home';

  const densityStyles =
    density === 'compact'
      ? { paddingTop: insets.top + 2, paddingBottom: 6, rowMinHeight: 40 }
      : { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.xs, rowMinHeight: 44 };

  return (
    <View
      style={[
        styles.wrapper,
        { paddingTop: densityStyles.paddingTop, paddingBottom: densityStyles.paddingBottom },
        !noBorder && styles.border,
        style,
      ]}
    >
      {brandStrip ? (
        <View style={styles.brandStrip}>
          <BrandSymbol size={36} />
        </View>
      ) : null}
      <View style={[styles.row, { minHeight: densityStyles.rowMinHeight }]}>
        {showBack ? (
          <Pressable
            onPress={() => {
              const canGoBack =
                typeof (router as unknown as { canGoBack?: () => boolean }).canGoBack === 'function'
                  ? (router as unknown as { canGoBack: () => boolean }).canGoBack()
                  : false;
              if (canGoBack) {
                router.back();
                return;
              }
              router.replace(fallbackHref);
            }}
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
        <Text style={[styles.title, titleStyle]} numberOfLines={1}>
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
  brandStrip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
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
