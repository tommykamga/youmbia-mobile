/**
 * Header Home — logo YOUMBIA horizontal centré (PNG brand), messages à droite.
 * Taille responsive par largeur d’écran ; `contentFit="contain"` — pas d’étirement ni de crop.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui, colors } from '@/theme';

const SIDE_SLOT = 48;
/** paddingHorizontal du row (×2) */
const ROW_H_PADDING = 20;

function getHomeLogoMetrics(screenWidth: number): { logoHeight: number; logoMaxWidth: number } {
  if (screenWidth < 360) {
    return { logoHeight: 28, logoMaxWidth: 150 };
  }
  if (screenWidth <= 430) {
    return { logoHeight: 32, logoMaxWidth: 190 };
  }
  return { logoHeight: 38, logoMaxWidth: 240 };
}

export type HomeBrandHeaderProps = {
  onMessagesPress: () => void;
  unreadCount: number;
};

export function HomeBrandHeader({ onMessagesPress, unreadCount }: HomeBrandHeaderProps) {
  const { width } = useWindowDimensions();

  const { logoHeight, logoWidth, rowMinHeight } = useMemo(() => {
    const { logoHeight: h, logoMaxWidth: maxW } = getHomeLogoMetrics(width);
    const reserved = ROW_H_PADDING + SIDE_SLOT * 2;
    const available = Math.max(64, width - reserved);
    const w = Math.min(maxW, available);
    return {
      logoHeight: h,
      logoWidth: w,
      rowMinHeight: h + 16,
    };
  }, [width]);

  return (
    <View style={[styles.row, { minHeight: rowMinHeight }]}>
      <View style={styles.sideSlot} />
      <View style={styles.logoWrap} accessibilityRole="header">
        <Image
          source={require('../../assets/images/web-header-logo-1600x400.png')}
          style={[styles.logo, { width: logoWidth, height: logoHeight }]}
          contentFit="contain"
          accessibilityLabel="YOUMBIA"
        />
      </View>
      <View style={[styles.sideSlot, styles.sideSlotEnd]}>
        <Pressable
          onPress={onMessagesPress}
          style={({ pressed }) => [styles.msgBtn, pressed && styles.msgBtnPressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Messages"
        >
          <View style={styles.msgIconSlot}>
            <Ionicons name="chatbubble-outline" size={22} color={ui.colors.textSecondary} />
            {unreadCount > 0 ? (
              <View style={styles.msgBadge}>
                <Text style={styles.msgBadgeText}>
                  {unreadCount > 9 ? '9+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  sideSlot: {
    width: SIDE_SLOT,
    minHeight: 40,
    justifyContent: 'center',
  },
  sideSlotEnd: {
    alignItems: 'flex-end',
  },
  logoWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    maxWidth: '100%',
  },
  msgBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ui.radius.pill,
    backgroundColor: ui.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
  },
  msgBtnPressed: {
    opacity: 0.9,
    backgroundColor: ui.colors.primarySoft,
  },
  msgIconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: ui.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBadgeText: {
    color: ui.colors.surface,
    fontSize: 10,
    fontWeight: '700',
  },
});
