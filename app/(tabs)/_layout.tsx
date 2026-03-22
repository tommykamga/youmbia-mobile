/**
 * Premium bottom tab bar – YOUMBIA brand, safe-area aware, cross-platform icons.
 * Order: Home | Search | Vendre (center) | Favoris | Messages | Compte.
 *
 * Icons: @expo/vector-icons (Ionicons) – one icon set for iOS and Android, no platform branching.
 *
 * Sell tab: Currently a tab that redirects to /sell. It could later be refactored to a
 * prominent FAB/action that opens the same flow without occupying a tab slot (see product decision).
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Tabs, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, radius, typography } from '@/theme';
import { getWindowSizeBucket } from '@/lib/responsiveLayout';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import type { AuthGateContextId } from '@/config/authGateContext';

const ICON_SIZE = 24;
const SELL_PILL_ICON_SIZE = 26;
const SELL_PILL_SIZE = 44;

/**
 * Onglets protégés : si non connecté → Auth Gate contextuel (pas d’écran tab intermédiaire).
 * Si connecté → navigation habituelle vers la route cible.
 */
async function navigateProtectedTab(
  router: { push: (href: Href) => void },
  whenAuthedHref: Href,
  gateContext: AuthGateContextId
): Promise<void> {
  try {
    const session = await getSession();
    if (session?.user) {
      router.push(whenAuthedHref);
    } else {
      router.push(buildAuthGateHref(gateContext));
    }
  } catch {
    router.push(buildAuthGateHref(gateContext));
  }
}

const TAB_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  home: 'home',
  search: 'search',
  favorites: 'heart',
  messages: 'chatbubbles',
  account: 'person',
};

function TabIcon({
  name,
  color,
}: {
  name: keyof typeof TAB_ICONS;
  color: string;
}) {
  return (
    <Ionicons
      name={TAB_ICONS[name]}
      size={ICON_SIZE}
      color={color}
    />
  );
}

function SellTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.sellPill, focused && styles.sellPillFocused]}>
      <Ionicons
        name="add"
        size={SELL_PILL_ICON_SIZE}
        color={colors.surface}
      />
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bucket = getWindowSizeBucket(width);

  const tabBarMetrics = useMemo(() => {
    const labelFontSize = bucket === 'compact' ? 10 : bucket === 'regular' ? 11 : 12;
    const itemPadV = bucket === 'compact' ? 2 : 4;
    const barHeight = bucket === 'compact' ? 58 : 64;
    return { labelFontSize, itemPadV, barHeight };
  }, [bucket]);

  const totalTabBarHeight = tabBarMetrics.barHeight + insets.bottom;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: [
          styles.tabBar,
          { 
            height: totalTabBarHeight,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom + 4 : Math.max(insets.bottom, spacing.xs) + 4,
            paddingTop: bucket === 'compact' ? spacing.xs : spacing.sm,
          },
        ],
        tabBarLabelStyle: [styles.tabBarLabel, { fontSize: tabBarMetrics.labelFontSize }],
        tabBarItemStyle: [styles.tabBarItem, { paddingVertical: tabBarMetrics.itemPadV, minWidth: 0 }],
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: {
          fontWeight: '700',
          color: colors.text,
          fontSize: typography.base.fontSize,
        },
        headerShadowVisible: false,
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: bucket === 'compact' ? 'Chercher' : 'Rechercher',
          tabBarIcon: ({ color }) => <TabIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Vendre',
          tabBarIcon: ({ focused }) => <SellTabIcon focused={focused} />,
          tabBarLabelStyle: [
            styles.tabBarLabel,
            styles.sellLabel,
            { fontSize: tabBarMetrics.labelFontSize },
          ],
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/sell' as Href, 'sell');
          },
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favoris',
          tabBarIcon: ({ color }) => <TabIcon name="favorites" color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/(tabs)/favorites' as Href, 'favorites');
          },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabIcon name="messages" color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/(tabs)/messages' as Href, 'messages');
          },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color }) => <TabIcon name="account" color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/(tabs)/account' as Href, 'account');
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderLight,
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItem: {
    paddingVertical: spacing.xs,
  },
  sellPill: {
    width: SELL_PILL_SIZE,
    height: SELL_PILL_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  sellPillFocused: {
    backgroundColor: colors.primaryDark,
  },
  sellLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});
