/**
 * Onboarding vendeur pro — création boutique (volontaire, hors inscription).
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, AppHeader, Button, Input, Loader } from '@/components';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { getSession } from '@/services/auth';
import { createProShop, getMySellerProStatus } from '@/services/shops';
import { invalidatePopularShopsCache } from '@/services/shops/popularShopsCache';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type PickedAsset = { uri: string; base64: string | null; mimeType?: string | null };

export default function ProShopOnboardingScreen() {
  const router = useRouter();
  const [gate, setGate] = useState<'loading' | 'guest' | 'ready' | 'already'>('loading');
  const [existingSlug, setExistingSlug] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [logo, setLogo] = useState<PickedAsset | null>(null);
  const [banner, setBanner] = useState<PickedAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      setGate('guest');
      return;
    }
    const status = await getMySellerProStatus();
    if (status.data?.shop?.slug) {
      setExistingSlug(status.data.shop.slug);
      setGate('already');
      return;
    }
    setGate('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkAccess();
    }, [checkAccess])
  );

  const pickImage = async (target: 'logo' | 'banner') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', "Autorisez l'accès aux photos pour ajouter une image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const picked: PickedAsset = {
      uri: asset.uri,
      base64: asset.base64 ?? null,
      mimeType: asset.mimeType ?? null,
    };
    if (target === 'logo') setLogo(picked);
    else setBanner(picked);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createProShop({
        name,
        city: city.trim() || null,
        whatsapp_phone: whatsapp.trim() || null,
        phone: phone.trim() || null,
        description: description.trim() || null,
        logo:
          logo?.base64 != null
            ? { uri: logo.uri, base64: logo.base64, mimeType: logo.mimeType ?? null }
            : null,
        banner:
          banner?.base64 != null
            ? { uri: banner.uri, base64: banner.base64, mimeType: banner.mimeType ?? null }
            : null,
      });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      invalidatePopularShopsCache();
      Alert.alert(
        'Boutique créée',
        'Votre espace professionnel est actif. Vos prochaines annonces seront liées à votre boutique.',
        [
          {
            text: 'Voir ma boutique',
            onPress: () => router.replace(`/shop/${result.data.slug}`),
          },
        ]
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (gate === 'loading') {
    return (
      <Screen>
        <AppHeader title="Boutique pro" showBack />
        <Loader />
      </Screen>
    );
  }

  if (gate === 'guest') {
    return <Redirect href={buildAuthGateHref('account')} />;
  }

  if (gate === 'already' && existingSlug) {
    return (
      <Screen>
        <AppHeader title="Boutique pro" showBack />
        <View style={styles.alreadyWrap}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
          <Text style={styles.alreadyTitle}>Vous avez déjà une boutique</Text>
          <Text style={styles.alreadyText}>
            Votre espace professionnel est configuré. Consultez votre boutique ou publiez une nouvelle annonce.
          </Text>
          <Button onPress={() => router.replace(`/shop/${existingSlug}`)}>Voir ma boutique</Button>
          <Button variant="ghost" onPress={() => router.back()}>
            Retour
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Boutique pro"
        showBack
        density="compact"
        style={styles.onboardingHeader}
        titleStyle={styles.onboardingHeaderTitle}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
        <Text style={styles.lead}>
          Donnez une vitrine crédible à votre activité. Quelques informations suffisent — vous pourrez affiner plus tard.
        </Text>

        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Ce que vous obtenez</Text>
          <Text style={styles.benefitLine}>• Page boutique dédiée et partageable</Text>
          <Text style={styles.benefitLine}>• Badge Vendeur Pro sur vos annonces</Text>
          <Text style={styles.benefitLine}>• Visibilité renforcée sur YOUMBIA</Text>
          <Text style={styles.benefitNote}>
            La vérification « Boutique vérifiée » reste attribuée manuellement par l&apos;équipe YOUMBIA.
          </Text>
        </View>

        <Input
          label="Nom de la boutique *"
          placeholder="Ex. Tech Store Douala"
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
        <Input label="Ville" placeholder="Ex. Douala" value={city} onChangeText={setCity} />
        <Input
          label="WhatsApp"
          placeholder="+237 6XX XX XX XX"
          value={whatsapp}
          onChangeText={setWhatsapp}
          keyboardType="phone-pad"
        />
        <Input
          label="Téléphone"
          placeholder="Optionnel si identique au WhatsApp"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label="Description courte"
          placeholder="Présentez votre activité en quelques lignes…"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={styles.descriptionInput}
        />

        <Text style={styles.mediaLabel}>Image de marque (optionnel)</Text>
        <View style={styles.mediaRow}>
          <Pressable
            style={({ pressed }) => [styles.mediaSlot, pressed && styles.mediaSlotPressed]}
            onPress={() => void pickImage('logo')}
          >
            {logo?.uri ? (
              <Image source={{ uri: logo.uri }} style={styles.mediaPreview} resizeMode="cover" />
            ) : (
              <>
                <Ionicons name="image-outline" size={22} color={colors.primary} />
                <Text style={styles.mediaSlotText}>Logo</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.mediaSlotWide, pressed && styles.mediaSlotPressed]}
            onPress={() => void pickImage('banner')}
          >
            {banner?.uri ? (
              <Image source={{ uri: banner.uri }} style={styles.mediaBannerPreview} resizeMode="cover" />
            ) : (
              <>
                <Ionicons name="images-outline" size={22} color={colors.primary} />
                <Text style={styles.mediaSlotText}>Bannière</Text>
              </>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button size="lg" onPress={() => void handleSubmit()} loading={submitting} disabled={submitting}>
          Créer ma boutique
        </Button>
        <Button variant="ghost" onPress={() => router.back()} disabled={submitting}>
          Plus tard
        </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  onboardingHeader: {
    paddingBottom: 2,
  },
  onboardingHeaderTitle: {
    fontSize: typography.base.fontSize,
    lineHeight: 20,
    fontWeight: fontWeights.bold,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  lead: {
    ...typography.base,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  benefitsCard: {
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.sm,
    gap: 4,
  },
  benefitsTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  benefitLine: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  benefitNote: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  descriptionInput: {
    minHeight: 76,
  },
  mediaLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mediaSlot: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  mediaSlotWide: {
    flex: 1,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 4,
  },
  mediaSlotPressed: {
    opacity: 0.9,
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  mediaBannerPreview: {
    width: '100%',
    height: '100%',
  },
  mediaSlotText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  errorText: {
    ...typography.sm,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  alreadyWrap: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
  },
  alreadyTitle: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  alreadyText: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
});
