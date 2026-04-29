/**
 * Sell / publish listing – stack screen (dedicated route).
 * Form: title, price, city, description, images. On success shows next actions.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Button, Input } from '@/components';
import { LISTING_CATEGORIES, type ListingCategoryId } from '@/lib/listingCategories';
import { shouldUseDynamicAttributesPilot } from '@/lib/vehicleDynamicPilot';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';
import {
  getEffectiveCategoryAttributeDefinitionsResolved,
  getCategoryAttributeOptionsByDefinitionIds,
} from '@/services/categoryAttributes';
import { buildListingDynamicAttributeRows } from '@/lib/listingDynamicAttributesPayload';
import { DynamicCategoryAttributesFields } from '@/features/sell/DynamicCategoryAttributesFields';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { createListing, uploadListingImages, saveListingDynamicAttributeValues } from '@/services/listings';
import { getSession } from '@/services/auth';
import { getCurrentProfile, sanitizeProfileDisplayValue } from '@/services/profile';

/** Aligné web : maximum 4 photos par annonce. */
const MAX_LISTING_IMAGES = 4;

type PickedImage = { uri: string; base64: string | null };

function getFirstNonEmptyProfileField(
  profile: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!profile) return '';
  for (const key of keys) {
    const value = profile[key];
    if (typeof value !== 'string') continue;
    const sanitized = sanitizeProfileDisplayValue(value);
    if (sanitized.trim()) return sanitized;
  }
  return '';
}

type PublishState =
  | { status: 'idle' }
  | { status: 'success'; listingId: string }
  | {
      status: 'partial';
      listingId: string;
      uploadedCount: number;
      failedCount: number;
      totalCount: number;
      message: string;
    };

export default function SellScreen() {
  const router = useRouter();
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });

  const [title, setTitle] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [categoryId, setCategoryId] = useState<ListingCategoryId | null>(null);
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);

  const [dynamicDefs, setDynamicDefs] = useState<EffectiveCategoryAttributeDefinitionResolved[]>([]);
  const [dynamicOptionsByDef, setDynamicOptionsByDef] = useState<
    Map<string, CategoryAttributeOption[]>
  >(() => new Map());
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [dynamicLoading, setDynamicLoading] = useState(false);
  /** Pilote Véhicules + Électronique : `form_profile` ou repli ids racines (voir `shouldUseDynamicAttributesPilot`). */
  const [dynamicAttributesPilotActive, setDynamicAttributesPilotActive] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryUploadLoading, setRetryUploadLoading] = useState(false);

  const resetForm = () => {
    setPublishState({ status: 'idle' });
    setSubmitError(null);
    setTitle('');
    setPriceStr('');
    setCategoryId(null);
    setCity('');
    setDescription('');
    setImages([]);
    setDynamicDefs([]);
    setDynamicOptionsByDef(new Map());
    setDynamicValues({});
    setDynamicLoading(false);
    setDynamicAttributesPilotActive(false);
  };

  useEffect(() => {
    if (categoryId == null) {
      setDynamicAttributesPilotActive(false);
      setDynamicDefs([]);
      setDynamicOptionsByDef(new Map());
      setDynamicValues({});
      setDynamicLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const pilot = await shouldUseDynamicAttributesPilot(categoryId);
      if (cancelled) return;
      setDynamicAttributesPilotActive(pilot);
      if (!pilot) {
        setDynamicDefs([]);
        setDynamicOptionsByDef(new Map());
        setDynamicValues({});
        setDynamicLoading(false);
        return;
      }
      setDynamicLoading(true);
      const defs = await getEffectiveCategoryAttributeDefinitionsResolved(categoryId);
      if (cancelled) return;
      const selectIds = defs.filter((d) => d.type === 'select').map((d) => d.definition_id);
      const optsMap = await getCategoryAttributeOptionsByDefinitionIds(selectIds);
      if (cancelled) return;
      setDynamicDefs(defs);
      setDynamicOptionsByDef(optsMap);
      setDynamicLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const handleDynamicChange = useCallback((key: string, value: string) => {
    setDynamicValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const buildPartialPublishState = (
    listingId: string,
    uploadedCount: number,
    failedCount: number,
    totalCount: number,
    message: string
  ): PublishState => ({
    status: 'partial',
    listingId,
    uploadedCount,
    failedCount,
    totalCount,
    message,
  });

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        "Autorisez l'accès aux photos pour ajouter des images à votre annonce."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const newImages: PickedImage[] = result.assets.map((a) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, MAX_LISTING_IMAGES));
    setSubmitError(null);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (submitLoading) return;

    const session = await getSession();
    if (!session?.user) {
      router.replace(buildAuthGateHref('sell'));
      return;
    }

    // Aligné web : profil vendeur obligatoire (nom/pseudo) + téléphone obligatoire
    const profileRes = await getCurrentProfile();
    const profileAny = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
    const sellerNameValid = getFirstNonEmptyProfileField(profileAny, [
      'display_name',
      'username',
      'pseudo',
      'full_name',
    ]);
    const sellerPhoneValid = getFirstNonEmptyProfileField(profileAny, [
      'whatsapp_phone',
      'phone_number',
      'phone',
    ]);
    if (!sellerNameValid.trim() || !sellerPhoneValid.trim()) {
      const message =
        "Avant de publier une annonce, complète ton profil vendeur avec ton nom ou pseudo et ton numéro de téléphone.";
      setSubmitError(message);
      Alert.alert('Profil vendeur incomplet', message, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Compléter mon profil', onPress: () => router.push('/account/profile') },
      ]);
      return;
    }

    const price = priceStr.trim() ? Number(priceStr.trim().replace(',', '.')) : NaN;
    if (!title.trim() || title.trim().length < 2) {
      setSubmitError('Titre requis (2 caractères minimum)');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setSubmitError('Prix invalide (doit être supérieur à 0)');
      return;
    }
    if (!categoryId) {
      setSubmitError('Catégorie requise');
      return;
    }
    if (images.length === 0 || !images.some((img) => !!img.base64 || !!img.uri)) {
      setSubmitError('Ajoutez au moins une photo');
      return;
    }
    if (dynamicAttributesPilotActive && dynamicLoading) {
      setSubmitError('Chargement des caractéristiques… Réessayez dans un instant.');
      return;
    }

    setSubmitLoading(true);
    try {
      const { data, error } = await createListing({
        title: title.trim(),
        price: Math.round(price),
        categoryId,
        city: city.trim(),
        description: description.trim() || '',
      });

      if (error) {
        if (error.message === 'Non connecté') {
          router.replace(buildAuthGateHref('sell'));
          return;
        }
        setSubmitError(error.message);
        return;
      }

      const listingId = data?.id;
      if (!listingId) {
        setSubmitError("Impossible de publier l'annonce");
        return;
      }

      const dynamicRows = buildListingDynamicAttributeRows(
        dynamicDefs,
        dynamicValues,
        dynamicOptionsByDef
      );
      if (dynamicRows.length > 0) {
        const dynRes = await saveListingDynamicAttributeValues(listingId, dynamicRows);
        if (!dynRes.success) {
          console.warn('[SellScreen] saveListingDynamicAttributeValues', dynRes.error);
        }
      }

      const withBase64 = images.filter((img): img is PickedImage & { base64: string } => !!img.base64);
      const missingBase64Count = Math.max(0, images.length - withBase64.length);

      if (withBase64.length > 0) {
        const uploadResult = await uploadListingImages(
          listingId,
          withBase64.map((img) => ({ base64: img.base64 }))
        );

        const uploadedCount = uploadResult.data.uploadedCount;
        const failedCount = uploadResult.data.failedCount + missingBase64Count;
        const totalCount = images.length;

        if (uploadResult.status === 'ok' && missingBase64Count === 0) {
          setPublishState({ status: 'success', listingId });
          return;
        }

        setPublishState(
          buildPartialPublishState(
            listingId,
            uploadedCount,
            failedCount,
            totalCount,
            missingBase64Count > 0 && !uploadResult.error
              ? "Annonce créée, mais certaines photos n'ont pas pu être préparées."
              : uploadResult.error?.message ?? "Annonce créée, mais certaines photos n'ont pas pu être ajoutées."
          )
        );
        return;
      }

      if (missingBase64Count > 0) {
        setPublishState(
          buildPartialPublishState(
            listingId,
            0,
            missingBase64Count,
            images.length,
            "Annonce créée, mais certaines photos n'ont pas pu être préparées."
          )
        );
        return;
      }

      setPublishState({ status: 'success', listingId });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Impossible de publier l'annonce");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRetryImageUpload = async () => {
    if (publishState.status !== 'partial' || retryUploadLoading) return;

    const withBase64 = images.filter((img): img is PickedImage & { base64: string } => !!img.base64);
    const missingBase64Count = Math.max(0, images.length - withBase64.length);

    if (withBase64.length === 0) {
      setPublishState(
        buildPartialPublishState(
          publishState.listingId,
          0,
          missingBase64Count,
          images.length,
          "Annonce créée, mais aucune photo exploitable n'a pu être ajoutée."
        )
      );
      return;
    }

    setRetryUploadLoading(true);
    try {
      const uploadResult = await uploadListingImages(
        publishState.listingId,
        withBase64.map((img) => ({ base64: img.base64 }))
      );

      const uploadedCount = uploadResult.data.uploadedCount;
      const failedCount = uploadResult.data.failedCount + missingBase64Count;
      const totalCount = images.length;

      if (uploadResult.status === 'ok' && missingBase64Count === 0) {
        setPublishState({ status: 'success', listingId: publishState.listingId });
        return;
      }

      setPublishState(
        buildPartialPublishState(
          publishState.listingId,
          uploadedCount,
          failedCount,
          totalCount,
          missingBase64Count > 0 && !uploadResult.error
            ? "Annonce créée, mais certaines photos n'ont pas pu être préparées."
            : uploadResult.error?.message ?? "Annonce créée, mais certaines photos n'ont pas pu être ajoutées."
        )
      );
    } finally {
      setRetryUploadLoading(false);
    }
  };

  if (publishState.status === 'success') {
    /* Sprint 3.2 – post-publish continuity: clear next steps (view listing, publish another, home). */
    return (
      <Screen>
        <View style={styles.successBlock}>
          <Text style={styles.successTitle}>Annonce publiée</Text>
          <Text style={styles.successSubtitle}>
            Votre annonce est en ligne. Vous pouvez la consulter ou en publier une autre.
          </Text>
          <View style={styles.successActions}>
            <Button
              size="lg"
              onPress={() => router.push(`/listing/${publishState.listingId}`)}
              style={styles.successBtn}
            >
              {"Voir l'annonce"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={resetForm}
            >
              Publier une autre annonce
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onPress={() => router.replace('/(tabs)/home' as Href)}
              style={styles.successBtn}
            >
              {"Retour à l'accueil"}
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  if (publishState.status === 'partial') {
    return (
      <Screen>
        <View style={styles.successBlock}>
          <Text style={styles.partialTitle}>Annonce créée</Text>
          <Text style={styles.successSubtitle}>
            {publishState.message}
          </Text>
          <Text style={styles.partialMeta}>
            Photos ajoutées : {publishState.uploadedCount}/{publishState.totalCount}
          </Text>
          <View style={styles.successActions}>
            <Button
              size="lg"
              onPress={handleRetryImageUpload}
              loading={retryUploadLoading}
              disabled={retryUploadLoading}
              style={styles.successBtn}
            >
              Réessayer les photos
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => router.push(`/listing/${publishState.listingId}`)}
            >
              {"Voir l'annonce"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onPress={resetForm}
              style={styles.successBtn}
            >
              Publier une autre annonce
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoid>
      <Text style={styles.title}>Vendre</Text>
      <Text style={styles.subtitle}>Publiez votre annonce en quelques minutes.</Text>

      <Input
        label="Titre"
        placeholder="Ex. Vélo de ville"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Input
        label="Prix (€)"
        placeholder="0"
        value={priceStr}
        onChangeText={setPriceStr}
        keyboardType={Platform.OS === 'web' ? 'numeric' : 'decimal-pad'}
      />
      <View style={styles.categorySection}>
        <Text style={styles.label}>Catégorie</Text>
        <View style={styles.categoryChips}>
          {LISTING_CATEGORIES.map((category) => {
            const isSelected = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                style={({ pressed }) => [
                  styles.categoryChip,
                  isSelected && styles.categoryChipSelected,
                  pressed && styles.categoryChipPressed,
                ]}
                onPress={() => {
                  setCategoryId(category.id);
                  setSubmitError(null);
                }}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected,
                  ]}
                >
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {dynamicAttributesPilotActive ? (
        <DynamicCategoryAttributesFields
          definitions={dynamicDefs}
          optionsByDefinitionId={dynamicOptionsByDef}
          loading={dynamicLoading}
          values={dynamicValues}
          onChange={handleDynamicChange}
        />
      ) : null}

      <Input
        label="Ville (optionnel)"
        placeholder="Ex. Paris"
        value={city}
        onChangeText={setCity}
      />
      <Input
        label="Description (optionnelle)"
        placeholder="Décrivez votre article..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        style={styles.descriptionInput}
      />

      <View style={styles.imagesSection}>
        <Text style={styles.label}>Photos</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbsRow}
        >
          {images.map((img, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} />
              <Button
                size="sm"
                variant="ghost"
                onPress={() => removeImage(i)}
                style={styles.removeThumb}
              >
                ✕
              </Button>
            </View>
          ))}
          {images.length < MAX_LISTING_IMAGES && (
            <Button variant="outline" size="md" onPress={pickImages} style={styles.addPhotoBtn}>
              + Photo
            </Button>
          )}
        </ScrollView>
      </View>

      {submitError ? (
        <Text style={styles.submitError}>{submitError}</Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          size="lg"
          onPress={handleSubmit}
          loading={submitLoading}
          disabled={
            submitLoading || (dynamicAttributesPilotActive && dynamicLoading)
          }
        >
          {"Publier l'annonce"}
        </Button>
        <Button variant="ghost" onPress={() => router.back()} style={styles.cancel}>
          Annuler
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  successBlock: {
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
  },
  successTitle: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  partialTitle: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: typography.base.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  partialMeta: {
    fontSize: typography.sm.fontSize,
    color: colors.textMuted,
  },
  successActions: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  successBtn: {
    alignSelf: 'flex-start',
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
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  imagesSection: {
    marginBottom: spacing.lg,
  },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '12',
  },
  categoryChipPressed: {
    opacity: 0.85,
  },
  categoryChipText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  categoryChipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  thumbsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  removeThumb: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 28,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  addPhotoBtn: {
    alignSelf: 'center',
  },
  submitError: {
    ...typography.sm,
    color: colors.error,
    marginBottom: spacing.base,
  },
  actions: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  cancel: {
    marginTop: spacing.base,
  },
});
