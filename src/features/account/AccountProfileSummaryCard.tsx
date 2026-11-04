import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { UserAvatar } from '@/components';
import { ACCOUNT_PROFILE_CARD_OVERLAP } from './accountScreen.constants';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type Props = {
  displayName: string;
  emailLabel: string | null;
  avatarUrlRaw: string;
  avatarVersion: string;
  avatarDisplayUrl: string;
  onEditPress: () => void;
};

export function AccountProfileSummaryCard({
  displayName,
  emailLabel,
  avatarUrlRaw,
  avatarVersion,
  avatarDisplayUrl,
  onEditPress,
}: Props) {
  return (
    <View style={styles.card}>
      <UserAvatar
        name={displayName}
        avatarUrl={avatarUrlRaw}
        avatarVersion={avatarVersion}
        displayUrl={avatarDisplayUrl}
        size={56}
        style={styles.avatar}
      />
      <View style={styles.textSlot}>
        <Text style={styles.name} numberOfLines={2} accessibilityRole="text">
          {displayName}
        </Text>
        {emailLabel ? (
          <Text style={styles.email} numberOfLines={2}>
            {emailLabel}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Modifier mon profil"
        onPress={onEditPress}
        style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
      >
        <Text style={styles.editBtnText}>Modifier</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.screenHorizontal,
    marginTop: -ACCOUNT_PROFILE_CARD_OVERLAP,
    marginBottom: spacing.sm,
    zIndex: 2,
    elevation: 3,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    overflow: 'hidden',
  },
  textSlot: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  email: {
    ...typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
  },
  editBtnPressed: {
    opacity: 0.88,
  },
  editBtnText: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
});
