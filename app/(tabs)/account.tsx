import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Screen, Loader, NotificationsActivationCard } from '@/components';
import { getSession, signOut } from '@/services/auth';
import { spacing, colors, typography } from '@/theme';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import Constants from 'expo-constants';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';
import { resolveSingleAvatarUrl, invalidateAvatarCache } from '@/lib/avatarImageUrl';
import { subscribeProfileEvents } from '@/lib/profileRealtime';
import { getCurrentProfile, getAvatarVersion, getUserDisplayName, isApplePrivateRelayEmail } from '@/services/profile';
import {
  AccountScreenHeader,
  AccountProfileSummaryCard,
  AccountPriorityActions,
  AccountMenuSection,
  AccountLogoutRow,
  ACCOUNT_MENU_SECTIONS,
  ACCOUNT_TAB_BAR_SCROLL_PAD,
  ACCOUNT_LOGOUT_ROW,
  ACCOUNT_MARKETPLACE_SURFACE,
} from '@/features/account';

const APP_VERSION_LABEL =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—';

export default function AccountScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [appleName, setAppleName] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading');
  const [signingOut, setSigningOut] = useState(false);
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [avatarUrlRaw, setAvatarUrlRaw] = useState<string>('');
  const [avatarVersion, setAvatarVersion] = useState<string>('');

  const fetchSession = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setStatus('unauthenticated');
        return;
      }
      const userId = session.user.id;
      setEmail(session.user.email ?? 'Utilisateur YOUMBIA');

      const metaFullName =
        typeof session.user.user_metadata?.full_name === 'string'
          ? session.user.user_metadata.full_name.trim()
          : '';
      setAppleName(metaFullName || null);

      const cached = await lightCacheRead<{
        userId: string;
        avatarUrl: string;
        avatarVersion?: string;
        fullName?: string;
        phone?: string;
        incomplete?: boolean;
      }>(lightCacheKeys.profile(userId));
      const cachedFullName = String(cached?.payload?.fullName ?? '').trim();
      if (cachedFullName) setFullName(cachedFullName);
      const cachedRaw = String(cached?.payload?.avatarUrl ?? '').trim();
      setAvatarUrlRaw(cachedRaw);
      setAvatarVersion(String(cached?.payload?.avatarVersion ?? ''));
      if (cachedRaw) {
        try {
          const resolved = await resolveSingleAvatarUrl(cachedRaw, cached?.payload?.avatarVersion);
          if (resolved) setAvatarDisplayUrl(resolved);
        } catch {
          // ignore
        }
      } else {
        setAvatarDisplayUrl('');
      }
      setStatus('authenticated');

      try {
        const result = await getCurrentProfile();
        if (!result.error) {
          const raw = String(result.data?.avatar_url ?? '').trim();
          const version = getAvatarVersion(result.data);
          const freshFullName = result.data?.full_name ?? null;
          setFullName(freshFullName);
          setAvatarUrlRaw(raw);
          setAvatarVersion(version);
          if (raw) {
            const resolved = await resolveSingleAvatarUrl(raw, version);
            setAvatarDisplayUrl(resolved || '');
          } else {
            setAvatarDisplayUrl('');
          }
          await lightCacheWrite(lightCacheKeys.profile(userId), {
            userId,
            fullName: freshFullName ?? cached?.payload?.fullName ?? '',
            phone: cached?.payload?.phone ?? '',
            avatarUrl: raw,
            avatarVersion: version,
            incomplete: cached?.payload?.incomplete ?? false,
          });
        }
      } catch {
        // Offline / transient: keep the cached avatar already shown.
      }
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSession();
    }, [fetchSession])
  );

  useEffect(() => {
    return subscribeProfileEvents((event) => {
      if (event.type !== 'avatar_updated') return;
      const raw = String(event.avatarUrl ?? '').trim();
      setAvatarUrlRaw(raw);
      setAvatarVersion(event.avatarVersion);
      if (raw) {
        invalidateAvatarCache(raw);
        void resolveSingleAvatarUrl(raw, event.avatarVersion).then((url) => {
          setAvatarDisplayUrl(url || '');
        });
      } else {
        setAvatarDisplayUrl('');
      }
      void getSession().then((session) => {
        const uid = session?.user?.id;
        if (!uid) return;
        void lightCacheRead<{
          userId: string;
          fullName?: string;
          phone?: string;
          avatarUrl?: string;
          avatarVersion?: string;
          incomplete?: boolean;
        }>(lightCacheKeys.profile(uid)).then((cached) => {
          void lightCacheWrite(lightCacheKeys.profile(uid), {
            userId: uid,
            fullName: cached?.payload?.fullName ?? fullName ?? '',
            phone: cached?.payload?.phone ?? '',
            avatarUrl: raw,
            avatarVersion: event.avatarVersion,
            incomplete: cached?.payload?.incomplete ?? false,
          });
        });
      });
    });
  }, [fullName]);

  const handleSignOut = async () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleMenuPress = useCallback(
    (route: string) => {
      router.push(route as never);
    },
    [router]
  );

  if (status === 'loading') {
    return (
      <Screen noPadding safe={false} style={styles.loadingRoot}>
        <AccountScreenHeader />
        <View style={styles.loadingBody}>
          <Loader />
        </View>
      </Screen>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('account')} />;
  }

  const resolvedFullName = fullName || appleName;
  const displayName = getUserDisplayName(
    { full_name: resolvedFullName, email },
    email?.split('@')[0] || 'Mon Compte'
  );
  const emailLabel = isApplePrivateRelayEmail(email) ? 'Adresse masquée par Apple' : email;

  return (
    <Screen noPadding safe={false} style={styles.screenRoot}>
      <View style={styles.accountHero}>
        <AccountScreenHeader />
        <AccountProfileSummaryCard
          displayName={displayName}
          emailLabel={emailLabel}
          avatarUrlRaw={avatarUrlRaw}
          avatarVersion={avatarVersion}
          avatarDisplayUrl={avatarDisplayUrl}
          onEditPress={() => router.push('/account/profile')}
        />
      </View>
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AccountPriorityActions />

        <NotificationsActivationCard />

        {ACCOUNT_MENU_SECTIONS.map((section) => (
          <AccountMenuSection key={section.title} section={section} onItemPress={handleMenuPress} />
        ))}

        <View style={styles.logoutSection}>
          <View style={styles.logoutCard}>
            <AccountLogoutRow
              label={signingOut ? ACCOUNT_LOGOUT_ROW.labelLoading : ACCOUNT_LOGOUT_ROW.label}
              loading={signingOut}
              disabled={signingOut}
              onPress={handleSignOut}
            />
          </View>
        </View>

        <Text style={styles.version} accessibilityLabel={`Version ${APP_VERSION_LABEL}`}>
          Version {APP_VERSION_LABEL}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: ACCOUNT_MARKETPLACE_SURFACE,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: ACCOUNT_MARKETPLACE_SURFACE,
  },
  loadingBody: {
    flex: 1,
    backgroundColor: colors.background,
  },
  accountHero: {
    backgroundColor: ACCOUNT_MARKETPLACE_SURFACE,
    overflow: 'visible',
    zIndex: 1,
  },
  mainScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: ACCOUNT_TAB_BAR_SCROLL_PAD + spacing.lg,
    backgroundColor: colors.background,
    paddingTop: 0,
  },
  logoutSection: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.screenHorizontal,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  logoutCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  version: {
    ...typography.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
