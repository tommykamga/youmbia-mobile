import React, { useCallback } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPhoneSizeFlags } from '@/lib/responsiveLayout';
import { colors, fontWeights, radius, shadows, spacing, typography } from '@/theme';

type AppUpdateBannerProps = {
  onUpdate: () => void;
  onLater: () => void;
  onLayoutHeight?: (height: number) => void;
};

/**
 * Bannière discrète pour une mise à jour optionnelle (non bloquante).
 * Rendue en flux (pas en overlay) pour ne pas masquer headers ni CTA.
 */
export function AppUpdateBanner({ onUpdate, onLater, onLayoutHeight }: AppUpdateBannerProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = getPhoneSizeFlags(width).isSmallPhone;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayoutHeight?.(event.nativeEvent.layout.height);
    },
    [onLayoutHeight]
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.wrapper,
        {
          paddingTop: insets.top > 0 ? insets.top : spacing.sm,
          paddingBottom: isCompact ? spacing.xs : spacing.sm,
        },
      ]}
    >
      <View
        style={[styles.banner, isCompact && styles.bannerCompact]}
        accessibilityRole="alert"
      >
        <Text style={styles.message} numberOfLines={isCompact ? 2 : 2}>
          Une nouvelle version de YOUMBIA est disponible.
        </Text>
        <View style={[styles.actions, isCompact && styles.actionsCompact]}>
          <Pressable
            onPress={onLater}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Plus tard"
          >
            <Text style={styles.laterLabel}>Plus tard</Text>
          </Pressable>
          <Pressable
            onPress={onUpdate}
            style={[styles.updateButton, isCompact && styles.updateButtonCompact]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mettre à jour"
          >
            <Text style={styles.updateLabel}>Mettre à jour</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  bannerCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  message: {
    flex: 1,
    ...typography.sm,
    color: colors.text,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  actionsCompact: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  laterLabel: {
    ...typography.sm,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  updateButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  updateButtonCompact: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  updateLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
});
