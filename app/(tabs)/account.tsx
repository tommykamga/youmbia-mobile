/**
 * Account tab – dashboard with access to my listings, favorites, messages, profile, settings.
 * Simple summary when authenticated; sign-in CTA when not.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Button, Loader } from '@/components';
import { getSession, signOut } from '@/services/auth';
import { colors, spacing, typography, fontWeights, radius, cardStyles } from '@/theme';

const ROW_ICON_SIZE = 22;
const CHEVRON_SIZE = 20;

type DashboardRow = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
};

export default function AccountScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (!cancelled) {
          setEmail(session?.user?.email ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (!error) {
      router.replace('/(auth)/login');
    }
  };

  if (loading) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (!email) {
    return (
      <Screen>
        <Text style={styles.title}>Mon compte</Text>
        <Text style={styles.subtitle}>
          Connectez-vous pour accéder à vos annonces et messages.
        </Text>
        <View style={styles.actions}>
          <Link href="/(auth)/login?redirect=/(tabs)/account" asChild>
            <Button variant="outline">Se connecter</Button>
          </Link>
        </View>
      </Screen>
    );
  }

  const rows: DashboardRow[] = [
    {
      id: 'listings',
      label: 'Mes annonces',
      icon: 'list-outline',
      onPress: () => router.push('/account/listings'),
    },
    {
      id: 'favorites',
      label: 'Favoris',
      icon: 'heart-outline',
      onPress: () => router.replace('/(tabs)/favorites'),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'chatbubbles-outline',
      onPress: () => router.replace('/(tabs)/messages'),
    },
    {
      id: 'profile',
      label: 'Profil',
      icon: 'person-outline',
      onPress: () => router.push('/account/profile'),
    },
    {
      id: 'settings',
      label: 'Paramètres',
      icon: 'settings-outline',
      onPress: () => router.push('/account/settings'),
    },
  ];

  return (
    <Screen scroll={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Mon compte</Text>
        <Text style={styles.email}>{email}</Text>

        <View style={styles.section}>
          {rows.map((row) => (
            <Pressable
              key={row.id}
              style={({ pressed }) => [styles.row, cardStyles.default, pressed && styles.rowPressed]}
              onPress={row.onPress}
            >
              <Ionicons
                name={row.icon}
                size={ROW_ICON_SIZE}
                color={colors.textSecondary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={CHEVRON_SIZE}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.signOutWrap}>
          <Button
            variant="secondary"
            onPress={handleSignOut}
            loading={signingOut}
            disabled={signingOut}
          >
            Se déconnecter
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  title: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  email: {
    fontSize: typography.base.fontSize,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: radius.xl,
  },
  rowPressed: {
    opacity: 0.95,
  },
  rowIcon: {
    marginRight: spacing.base,
  },
  rowLabel: {
    flex: 1,
    ...typography.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  signOutWrap: {
    marginTop: spacing.lg,
  },
  actions: {
    gap: spacing.base,
  },
});
