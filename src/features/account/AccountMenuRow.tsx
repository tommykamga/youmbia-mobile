import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights } from '@/theme';
import type { AccountRouteItem } from './accountScreen.constants';

type MenuRowProps = {
  item: AccountRouteItem;
  isLast: boolean;
  onPress: () => void;
};

type LogoutRowProps = {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  isLast?: boolean;
};

const ROW_MIN_HEIGHT = 48;
const ICON_SIZE = 36;

export const AccountMenuRow = memo(function AccountMenuRow({
  item,
  isLast,
  onPress,
}: MenuRowProps) {
  const destructive = item.isDestructive === true;
  const iconBg = destructive ? colors.error + '18' : colors.surfaceSubtle;
  const iconColor = destructive ? colors.error : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={item.icon} size={20} color={iconColor} />
      </View>
      <Text
        style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}
        numberOfLines={2}
      >
        {item.label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.borderLight} />
      {!isLast ? <View style={styles.rowSeparator} /> : null}
    </Pressable>
  );
});

export const AccountLogoutRow = memo(function AccountLogoutRow({
  label,
  loading,
  disabled,
  onPress,
  isLast = true,
}: LogoutRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.error + '18' }]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.error} />
        ) : (
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
        )}
      </View>
      <Text style={[styles.rowLabel, styles.rowLabelDestructive]} numberOfLines={1}>
        {label}
      </Text>
      {!isLast ? <View style={styles.rowSeparator} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: 6,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.base,
  },
  rowLabel: {
    ...typography.base,
    color: colors.text,
    flex: 1,
    fontWeight: fontWeights.semibold,
  },
  rowLabelDestructive: {
    color: colors.error,
    fontWeight: fontWeights.bold,
  },
  rowSeparator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: spacing.base + ICON_SIZE + spacing.base,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
});
