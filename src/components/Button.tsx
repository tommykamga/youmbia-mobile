import React from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography, fontWeights, shadows } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type PressableProps = React.ComponentPropsWithoutRef<typeof Pressable>;

export type ButtonProps = Omit<
  PressableProps,
  'children' | 'style'
> & {
  /** Label or content. Pass a string for the default text look, or ReactNode for icon+text composition. */
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Optional icon or element shown to the left of the label. */
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const variantStyles: Record<ButtonVariant, { bg: string; border?: string; text: string }> = {
  primary: {
    bg: colors.primary,
    text: colors.surface,
  },
  secondary: {
    bg: colors.surface,
    border: colors.border,
    text: colors.text,
  },
  outline: {
    bg: 'transparent',
    border: colors.primary,
    text: colors.primary,
  },
  ghost: {
    bg: 'transparent',
    text: colors.primary,
  },
};

const sizeStyles: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.base, fontSize: typography.sm.fontSize },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.base.fontSize },
  lg: { paddingVertical: spacing.base, paddingHorizontal: spacing.xl, fontSize: typography.lg.fontSize },
};

const GAP_ICON_LABEL = 8;

/**
 * Button – primary (green CTA), secondary, outline, ghost. Web: components/Button.tsx (youmbia-green, slate-200).
 */
export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  style,
  textStyle,
  ...pressableProps
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isPrimary = variant === 'primary';
  const isOutlineOrGhost = variant === 'outline' || variant === 'ghost';
  const shadowStyle = isPrimary
    ? shadows.primary
    : isOutlineOrGhost
      ? shadows.none
      : shadows.sm;

  const content =
    loading ? (
      <View style={styles.contentWrap}>
        <ActivityIndicator size="small" color={v.text} />
      </View>
    ) : (
      <View style={styles.contentWrap}>
        {leftIcon != null ? (
          <View style={styles.leftIconWrap}>{leftIcon}</View>
        ) : null}
        {typeof children === 'string' ? (
          <Text
            style={[
              styles.text,
              {
                color: v.text,
                fontSize: s.fontSize,
                fontWeight: fontWeights.bold,
              },
              textStyle,
            ]}
            {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      {...pressableProps}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderWidth: v.border ? 1.5 : 0,
          borderColor: v.border,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
          borderRadius: radius['2xl'],
          ...shadowStyle,
          transform: [{ scale: disabled ? 1 : pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  contentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  text: {
    letterSpacing: 0.3,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  leftIconWrap: {
    marginRight: GAP_ICON_LABEL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
