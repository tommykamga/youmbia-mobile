/**
 * Bottom tab bar YOUMBIA — hiérarchie premium (filled/outline + cercle Vendre discret).
 * Order: Chercher | Messages | Vendre | Favoris | Compte.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Tabs, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, typography } from '@/theme';
import { getTabBarVisualMetrics } from '@/lib/responsiveLayout';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import type { AuthGateContextId } from '@/config/authGateContext';

const TAB_BAR_TOP_BORDER = 'rgba(15,23,42,0.06)';
const TAB_ACTIVE = colors.tabIconSelected;
const TAB_ICON_INACTIVE = 'rgba(15, 23, 42, 0.42)';
const TAB_LABEL_INACTIVE = 'rgba(15, 23, 42, 0.45)';

/** Cercle Vendre : 28–32 px, + blanc 17–19. */
const SELL_CIRCLE = 30;
const SELL_PLUS_SIZE = 18;
const SELL_CIRCLE_INACTIVE = 'rgba(22, 163, 74, 0.42)';
const SELL_LABEL_INACTIVE = 'rgba(15, 23, 42, 0.5)';

/** Hauteur slot icône commune (= diamètre cercle Vendre) → labels alignés. */
const TAB_ICON_SLOT_H = 30;

const TAB_ICON_NAMES = {
  search: { active: 'search' as const, inactive: 'search-outline' as const },
  messages: { active: 'chatbubbles' as const, inactive: 'chatbubbles-outline' as const },
  favorites: { active: 'heart' as const, inactive: 'heart-outline' as const },
  account: { active: 'person' as const, inactive: 'person-outline' as const },
};

type TabIconKey = keyof typeof TAB_ICON_NAMES;

function makeTabBarLabel(label: string, fontSize: number) {
  return function TabBarLabel(_props: { focused: boolean; color: string }) {
    const { focused } = _props;
    return (
      <Text
        numberOfLines={1}
        style={{
          fontSize,
          fontWeight: focused ? '600' : '500',
          color: focused ? TAB_ACTIVE : TAB_LABEL_INACTIVE,
          marginTop: 0,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    );
  };
}

function makeSellTabBarLabel(fontSize: number) {
  return function SellTabBarLabel(_props: { focused: boolean; color: string }) {
    const { focused } = _props;
    return (
      <Text
        numberOfLines={1}
        style={{
          fontSize,
          fontWeight: '600',
          color: focused ? TAB_ACTIVE : SELL_LABEL_INACTIVE,
          marginTop: 0,
          textAlign: 'center',
        }}
      >
        Vendre
      </Text>
    );
  };
}

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

function TabIconSlot({ children }: { children: React.ReactNode }) {
  return <View style={styles.iconSlot}>{children}</View>;
}

function TabGlyphIcon({ tabKey, focused, size }: { tabKey: TabIconKey; focused: boolean; size: number }) {
  const pair = TAB_ICON_NAMES[tabKey];
  const name = focused ? pair.active : pair.inactive;
  const iconColor = focused ? TAB_ACTIVE : TAB_ICON_INACTIVE;
  return <Ionicons name={name} size={size} color={iconColor} />;
}

function SellCircleIcon({ focused }: { focused: boolean }) {
  const bg = focused ? TAB_ACTIVE : SELL_CIRCLE_INACTIVE;
  return (
    <View style={[styles.sellCircle, { backgroundColor: bg }]}>
      <Ionicons name="add" size={SELL_PLUS_SIZE} color={colors.surface} />
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const tabBarMetrics = useMemo(() => getTabBarVisualMetrics(width), [width]);

  const tabBarBottomPad = insets.bottom > 0 ? insets.bottom : 6;
  const totalTabBarHeight = tabBarMetrics.barHeight + insets.bottom;

  const iconSize = tabBarMetrics.tabIconSize;

  return (
    <Tabs
      initialRouteName="search"
      screenOptions={{
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_ICON_INACTIVE,
        tabBarStyle: [
          styles.tabBar,
          {
            height: totalTabBarHeight,
            paddingBottom: tabBarBottomPad,
            paddingTop: tabBarMetrics.paddingTop,
          },
        ],
        tabBarLabelStyle: styles.tabBarLabelBase,
        tabBarIconStyle: [styles.tabBarIcon, { marginBottom: tabBarMetrics.tabIconMarginBottom }],
        tabBarItemStyle: [styles.tabBarItem, { paddingVertical: 0, minWidth: 0 }],
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
        name="search"
        options={{
          title: 'Chercher',
          headerShown: false,
          tabBarLabel: makeTabBarLabel('Chercher', tabBarMetrics.labelFontSize),
          tabBarIcon: ({ focused }) => (
            <TabIconSlot>
              <TabGlyphIcon tabKey="search" focused={focused} size={iconSize} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          headerShown: false,
          tabBarLabel: makeTabBarLabel('Messages', tabBarMetrics.labelFontSize),
          tabBarIcon: ({ focused }) => (
            <TabIconSlot>
              <TabGlyphIcon tabKey="messages" focused={focused} size={iconSize} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Vendre',
          tabBarLabel: makeSellTabBarLabel(tabBarMetrics.labelFontSize),
          tabBarIcon: ({ focused }) => (
            <TabIconSlot>
              <SellCircleIcon focused={focused} />
            </TabIconSlot>
          ),
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
          headerShown: false,
          tabBarLabel: makeTabBarLabel('Favoris', tabBarMetrics.labelFontSize),
          tabBarIcon: ({ focused }) => (
            <TabIconSlot>
              <TabGlyphIcon tabKey="favorites" focused={focused} size={iconSize} />
            </TabIconSlot>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/(tabs)/favorites' as Href, 'favorites');
          },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          headerShown: false,
          tabBarLabel: makeTabBarLabel('Compte', tabBarMetrics.labelFontSize),
          tabBarIcon: ({ focused }) => (
            <TabIconSlot>
              <TabGlyphIcon tabKey="account" focused={focused} size={iconSize} />
            </TabIconSlot>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            void navigateProtectedTab(router, '/(tabs)/account' as Href, 'account');
          },
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: TAB_BAR_TOP_BORDER,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  iconSlot: {
    height: TAB_ICON_SLOT_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellCircle: {
    width: SELL_CIRCLE,
    height: SELL_CIRCLE,
    borderRadius: SELL_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarIcon: {
    marginTop: 0,
  },
  tabBarLabelBase: {
    marginTop: 0,
  },
  tabBarItem: {
    paddingVertical: 0,
  },
});
