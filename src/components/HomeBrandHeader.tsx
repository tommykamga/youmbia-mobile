/**
 * Header Home — logo YOUMBIA centré (asset brand), messages à droite.
 * Layout symétrique (slots latéraux égaux) pour un centrage visuel stable.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui, colors } from '@/theme';

const SIDE_SLOT = 48;
/** ~+12 % visibilité logo, sans explosion de hauteur header. */
const LOGO_SCALE = 1.12;
const LOGO_BASE_W = 260;
const LOGO_BASE_H = 38;
const LOGO_MAX_W = Math.round(LOGO_BASE_W * LOGO_SCALE);
const LOGO_H = Math.round(LOGO_BASE_H * LOGO_SCALE);

export type HomeBrandHeaderProps = {
  onMessagesPress: () => void;
  unreadCount: number;
};

export function HomeBrandHeader({ onMessagesPress, unreadCount }: HomeBrandHeaderProps) {
  const { width } = useWindowDimensions();
  const logoW = Math.min(
    LOGO_MAX_W,
    Math.max(Math.round(160 * LOGO_SCALE), width - SIDE_SLOT * 2 - 24)
  );

  return (
    <View style={styles.row}>
      <View style={styles.sideSlot} />
      <View style={styles.logoWrap} accessibilityRole="header">
        <Image
          source={require('../../assets/images/web-header-logo-1600x400.png')}
          style={[styles.logo, { width: logoW, height: LOGO_H }]}
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
    minHeight: LOGO_H + 12,
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
