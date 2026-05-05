/**
 * Header Home — logo horizontal YOUMBIA (SVG brand officiel, bundle local),
 * centré, notifications à droite. Pas d’animation / glow / texte React sous le logo.
 *
 * Source web : https://www.youmbia.com/brand/youmbia-logo-header.svg
 * Fichier : `assets/images/youmbia-logo-header.svg` (viewBox 148×40).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ui, colors } from '@/theme';

/** Aligné sur `viewBox="0 0 148 40"` du SVG officiel. */
const LOGO_VIEWBOX_W = 148;
const LOGO_VIEWBOX_H = 40;
const LOGO_ASPECT = LOGO_VIEWBOX_W / LOGO_VIEWBOX_H;

function getHomeLogoMetrics(screenWidth: number): { targetHeight: number; logoMaxWidth: number } {
  if (screenWidth < 380) {
    return { targetHeight: 26, logoMaxWidth: 168 };
  }
  if (screenWidth < 430) {
    return { targetHeight: 30, logoMaxWidth: 200 };
  }
  return { targetHeight: 34, logoMaxWidth: 228 };
}

function computeLogoBox(
  screenWidth: number,
  targetHeight: number,
  logoMaxWidth: number,
  sideSlot: number,
  rowHPadding: number
): { logoWidth: number; logoHeight: number } {
  const reserved = rowHPadding * 2 + sideSlot * 2;
  const available = Math.max(64, screenWidth - reserved);
  const widthAtTargetH = Math.round(targetHeight * LOGO_ASPECT);
  let w = Math.min(logoMaxWidth, available, widthAtTargetH);
  let h = Math.round(w / LOGO_ASPECT);
  if (h > targetHeight) {
    h = targetHeight;
    w = Math.min(logoMaxWidth, available, Math.round(h * LOGO_ASPECT));
  }
  return { logoWidth: Math.max(1, w), logoHeight: Math.max(1, h) };
}

export type HomeBrandHeaderProps = {
  onNotificationsPress: () => void;
  unreadCount: number;
  /** Onglet Chercher : cloche plus compacte + marge sous le header (écart avec la search bar). */
  searchTabLayout?: boolean;
};

export function HomeBrandHeader({
  onNotificationsPress,
  unreadCount,
  searchTabLayout = false,
}: HomeBrandHeaderProps) {
  const { width } = useWindowDimensions();

  const layout = useMemo(() => {
    const sideSlot = width < 380 ? 42 : width < 430 ? 46 : 48;
    const rowHPadding = width < 380 ? 16 : width < 430 ? 18 : 20;
    const { targetHeight, logoMaxWidth } = getHomeLogoMetrics(width);
    const { logoWidth, logoHeight } = computeLogoBox(
      width,
      targetHeight,
      logoMaxWidth,
      sideSlot,
      rowHPadding
    );
    const rowExtra = width < 380 ? 6 : 10;
    /** Réf. recette : 34–36 px, icône 17–19 (onglet Chercher uniquement). */
    const notifIcon = searchTabLayout ? 18 : width < 380 ? 18 : width < 430 ? 19 : 20;
    const btnSize = searchTabLayout ? 35 : width < 380 ? 40 : width < 430 ? 40 : 42;
    const rowPadV = searchTabLayout ? (width < 380 ? 4 : 5) : width < 380 ? 2 : width < 430 ? 4 : 5;
    return {
      logoWidth,
      logoHeight,
      rowMinHeight: logoHeight + rowExtra,
      sideSlot,
      rowHPadding,
      notifIcon,
      btnSize,
      rowPadV,
    };
  }, [width, searchTabLayout]);

  return (
    <View
      style={[
        styles.row,
        searchTabLayout && styles.rowSearchTab,
        {
          minHeight: layout.rowMinHeight,
          paddingVertical: layout.rowPadV,
          paddingHorizontal: layout.rowHPadding,
        },
      ]}
    >
      <View style={[styles.sideSlot, styles.sideSlotStart, { width: layout.sideSlot }]} />
      <View style={styles.logoWrap} accessibilityRole="header">
        <Image
          source={require('../../assets/images/youmbia-logo-header.svg')}
          style={[styles.logo, { width: layout.logoWidth, height: layout.logoHeight }]}
          contentFit="contain"
          accessibilityLabel="YOUMBIA"
        />
      </View>
      <View style={[styles.sideSlot, styles.sideSlotEnd, { width: layout.sideSlot }]}>
        <Pressable
          onPress={onNotificationsPress}
          style={({ pressed }) => [
            styles.msgBtn,
            searchTabLayout ? styles.msgBtnSearchTab : null,
            { minWidth: layout.btnSize, minHeight: layout.btnSize },
            pressed && styles.msgBtnPressed,
          ]}
          hitSlop={searchTabLayout ? 8 : 12}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <View style={[styles.msgIconSlot, searchTabLayout && styles.msgIconSlotSearchTab]}>
            <Ionicons
              name="notifications-outline"
              size={layout.notifIcon}
              color={ui.colors.textSecondary}
            />
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
    backgroundColor: colors.surface,
  },
  rowSearchTab: {
    marginBottom: 10,
  },
  sideSlot: {
    minHeight: 40,
    justifyContent: 'center',
  },
  sideSlotStart: {
    alignItems: 'flex-start',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ui.radius.pill,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  msgBtnSearchTab: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0.03,
        shadowRadius: 2,
      },
      android: { elevation: 0 },
      default: {},
    }),
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
  msgIconSlotSearchTab: {
    width: 20,
    height: 20,
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
