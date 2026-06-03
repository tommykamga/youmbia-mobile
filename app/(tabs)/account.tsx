import React, { useCallback, useEffect, useState, memo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Loader, AppHeader, NotificationsActivationCard, UserAvatar } from '@/components';
import { getSession, signOut } from '@/services/auth';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring } from 'react-native-reanimated';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import Constants from 'expo-constants';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';
import { resolveSingleAvatarUrl, invalidateAvatarCache } from '@/lib/avatarImageUrl';
import { subscribeProfileEvents } from '@/lib/profileRealtime';
import { getCurrentProfile, getAvatarVersion, getUserDisplayName, isApplePrivateRelayEmail } from '@/services/profile';
import { ProSellerActivationCard } from '@/features/shops';

const APP_VERSION_LABEL =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—';

type RouteItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  isDestructive?: boolean;
};

// Historique & Notifications masqués temporairement (écrans non prêts) — décommenter les lignes dans items pour réactiver.
const SECTIONS = [
  {
    title: 'Mes annonces & activités',
    items: [
      { icon: 'list', label: 'Mes annonces', route: '/account/listings' },
      { icon: 'chatbubbles-outline', label: 'Messages', route: '/(tabs)/messages' },
      { icon: 'heart-outline', label: 'Favoris', route: '/(tabs)/favorites' },
      // { icon: 'time-outline', label: 'Historique', route: '/history' },
    ] as RouteItem[],
  },
  {
    title: 'Paramètres',
    items: [
      { icon: 'person-outline', label: 'Profil public', route: '/account/profile' },
      // { icon: 'notifications-outline', label: 'Notifications', route: '/settings/notifications' },
      { icon: 'shield-checkmark-outline', label: 'Sécurité & Confidentialité', route: '/privacy' },
    ] as RouteItem[],
  },
  {
    title: 'Aide & Informations',
    items: [
      { icon: 'help-circle-outline', label: 'Centre d\'aide', route: '/help' },
      { icon: 'document-text-outline', label: 'Conditions d\'utilisation', route: '/terms' },
    ] as RouteItem[],
  },
  {
    title: 'Compte',
    items: [
      { icon: 'trash-outline', label: 'Supprimer mon compte', route: '/account/delete-account', isDestructive: true },
    ] as RouteItem[],
  },
];

const AccountRow = memo(function AccountRow({
  item,
  isLast,
  onPress,
}: {
  item: RouteItem;
  isLast: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const onPressIn = () => {
    scale.value = withTiming(0.98, { duration: 100, easing: Easing.out(Easing.quad) });
  };
  const onPressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
      >
        <View style={[styles.iconWrap, { backgroundColor: item.isDestructive ? '#FEE2E2' : colors.surfaceSubtle }]}>
          <Ionicons 
            name={item.icon} 
            size={20} 
            color={item.isDestructive ? colors.error : colors.primary} 
          />
        </View>
        <Text style={[styles.rowLabel, item.isDestructive && { color: colors.error }]}>
          {item.label}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.borderLight} />
        {!isLast && <View style={styles.rowSeparator} />}
      </Pressable>
    </Animated.View>
  );
});

export default function AccountScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  // Nom transmis par Apple au 1er consentement (stocké dans user_metadata, pas dans profiles).
  const [appleName, setAppleName] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading');
  const [signingOut, setSigningOut] = useState(false);
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [avatarUrlRaw, setAvatarUrlRaw] = useState<string>('');
  const [avatarVersion, setAvatarVersion] = useState<string>('');

  const editScale = useSharedValue(1);
  const editAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: editScale.value }]
  }));

  const onEditPressIn = () => {
    editScale.value = withTiming(0.95, { duration: 100, easing: Easing.out(Easing.quad) });
  };
  const onEditPressOut = () => {
    editScale.value = withSpring(1);
  };

  const fetchSession = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setStatus('unauthenticated');
        return;
      }
      const userId = session.user.id;
      setEmail(session.user.email ?? 'Utilisateur YOUMBIA');

      // Vrai nom Apple (ex. "Tommy KAMGA") récupéré au 1er login Apple et conservé
      // dans les métadonnées d'authentification — utilisé si profiles.full_name est vide.
      const metaFullName =
        typeof session.user.user_metadata?.full_name === 'string'
          ? session.user.user_metadata.full_name.trim()
          : '';
      setAppleName(metaFullName || null);

      // 1) Instant paint from local cache (NOT the source of truth — just for fast UI).
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

      // 2) Revalidate against profiles (single source of truth). Refresh avatar if it changed
      //    on another device. Version (updated_at) busts the image cache cross-device.
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

  if (status === 'loading') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('account')} />;
  }

  // Priorité : profiles.full_name → vrai nom Apple (user_metadata) → fallback.
  // Le helper renvoie "Utilisateur Apple" pour une adresse @privaterelay.appleid.com
  // seulement si aucun nom réel n'est disponible.
  const resolvedFullName = fullName || appleName;
  const displayName = getUserDisplayName({ full_name: resolvedFullName, email }, email?.split('@')[0] || 'Mon Compte');

  // L'email réel reste en base : on masque uniquement son affichage pour les comptes Apple.
  const emailLabel = isApplePrivateRelayEmail(email) ? 'Adresse masquée par Apple' : email;

  return (
    <Screen noPadding safe={false}>
      <AppHeader title="Compte" noBorder density="compact" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* User Profile Header Card */}
        <View style={styles.headerCard}>
          <UserAvatar
            name={displayName}
            avatarUrl={avatarUrlRaw}
            avatarVersion={avatarVersion}
            displayUrl={avatarDisplayUrl}
            size={56}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {emailLabel}
            </Text>
          </View>
          <Animated.View style={editAnimatedStyle}>
            <Pressable 
              style={styles.editBtn}
              onPressIn={onEditPressIn}
              onPressOut={onEditPressOut}
              onPress={() => router.push('/account/profile')}
            >
              <Text style={styles.editBtnText}>Modifier</Text>
            </Pressable>
          </Animated.View>
        </View>

        <ProSellerActivationCard variant="account" />

        <NotificationsActivationCard />

        {/* Sections */}
        {SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((item, i) => {
                const isLast = i === section.items.length - 1;
                return (
                  <AccountRow 
                    key={item.label}
                    item={item}
                    isLast={isLast}
                    onPress={() => router.push(item.route as any)}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={handleSignOut}
              disabled={signingOut}
            >
              <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
                {signingOut ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="log-out-outline" size={20} color={colors.error} />
                )}
              </View>
              <Text style={[styles.rowLabel, { color: colors.error, fontWeight: fontWeights.bold }]}>
                {signingOut ? 'Déconnexion...' : 'Se déconnecter'}
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.version}>Version {APP_VERSION_LABEL}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingTop: spacing['3xl'] },
  emptyAction: { minWidth: 240, marginTop: spacing.md },
  scrollContent: {
    paddingBottom: spacing['3xl'],
    backgroundColor: '#F9FAFB', // very light gray for premium background
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.base,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 64,
    height: 64,
  },
  avatarText: {
    ...typography['2xl'],
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  userInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  userName: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  editBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
  },
  editBtnText: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  section: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    ...typography.sm,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden', // to keep pressed feedback inside borders
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  rowSeparator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: spacing.base + 36 + spacing.base, // align with text
    height: 1,
    backgroundColor: colors.borderLight,
  },
  version: {
    ...typography.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
});
