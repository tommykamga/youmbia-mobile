import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography, fontWeights, colors, radius } from '@/theme';
import type { AccountMenuSectionConfig } from './accountScreen.constants';
import { AccountMenuRow } from './AccountMenuRow';

type Props = {
  section: AccountMenuSectionConfig;
  onItemPress: (route: string) => void;
};

export function AccountMenuSection({ section, onItemPress }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {section.title}
      </Text>
      <View style={styles.card}>
        {section.items.map((item, i) => {
          const isLast = i === section.items.length - 1;
          return (
            <AccountMenuRow
              key={item.label}
              item={item}
              isLast={isLast}
              onPress={() => onItemPress(item.route)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.screenHorizontal,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    ...typography.xs,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
    marginBottom: 6,
    marginLeft: spacing.xs,
    letterSpacing: 0.65,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});
