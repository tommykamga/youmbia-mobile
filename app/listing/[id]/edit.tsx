/**
 * Édition d’annonce (propriétaire) — champs principaux + attributs dynamiques (Véhicules + Électronique).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Button, Input, Loader, EmptyState, AppHeader } from '@/components';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import { shouldUseDynamicAttributesPilot } from '@/lib/vehicleDynamicPilot';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';
import {
  collectEmptyDynamicAttributeDefinitionIds,
  buildListingDynamicAttributeRows,
} from '@/lib/listingDynamicAttributesPayload';
import {
  getEffectiveCategoryAttributeDefinitionsResolved,
  getCategoryAttributeOptionsByDefinitionIds,
} from '@/services/categoryAttributes';
import {
  getListingForEdit,
  updateListing,
  getListingDynamicAttributeValuesForForm,
  saveListingDynamicAttributeValues,
  deleteListingDynamicAttributeValuesForDefinitions,
  uploadListingImages,
  deleteListingImage,
  type ListingForEdit,
} from '@/services/listings';
import { getSession } from '@/services/auth';
import { DynamicCategoryAttributesFields } from '@/features/sell/DynamicCategoryAttributesFields';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const MAX_LISTING_IMAGES = 4;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated' }
  | { status: 'ready'; listing: ListingForEdit };

type ImageItem = ListingForEdit['imageItems'][number];
type PickedImage = { uri: string; base64: string | null; mimeType?: string | null };

export default function ListingEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  const [title, setTitle] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');

  const [dynamicDefs, setDynamicDefs] = useState<EffectiveCategoryAttributeDefinitionResolved[]>([]);
  const [dynamicOptionsByDef, setDynamicOptionsByDef] = useState<
    Map<string, CategoryAttributeOption[]>
  >(() => new Map());
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [dynamicAttributesPilotActive, setDynamicAttributesPilotActive] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [photoActionLoading, setPhotoActionLoading] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== 'string') {
      setLoadState({ status: 'error', message: 'Identifiant manquant' });
      return;
    }

    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (!session?.user) {
        if (!cancelled) setLoadState({ status: 'unauthenticated' });
        return;
      }

      const res = await getListingForEdit(id);
      if (cancelled) return;
      if (res.error) {
        setLoadState({ status: 'error', message: res.error.message });
        return;
      }

      const L = res.data;
      setTitle(L.title);
      setPriceStr(String(L.price));
      setCity(L.city ?? '');
      setDescription(L.description ?? '');
      setImages(L.imageItems ?? []);

      const pilot =
        L.category_id != null ? await shouldUseDynamicAttributesPilot(L.category_id) : false;
      if (cancelled) return;
      setDynamicAttributesPilotActive(pilot);

      if (pilot && L.category_id != null) {
        setDynamicLoading(true);
        const defs = await getEffectiveCategoryAttributeDefinitionsResolved(L.category_id);
        const formVals = await getListingDynamicAttributeValuesForForm(L.id);
        const selectIds = defs.filter((d) => d.type === 'select').map((d) => d.definition_id);
        const optsMap = await getCategoryAttributeOptionsByDefinitionIds(selectIds);
        if (cancelled) return;
        setDynamicDefs(defs);
        setDynamicOptionsByDef(optsMap);
        setDynamicValues(formVals);
        setDynamicLoading(false);
      } else {
        setDynamicDefs([]);
        setDynamicOptionsByDef(new Map());
        setDynamicValues({});
        setDynamicLoading(false);
      }

      setLoadState({ status: 'ready', listing: L });
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (loadState.status === 'unauthenticated' && id) {
      router.replace(buildAuthGateHref('account', { redirect: `/listing/${id}/edit` }));
    }
  }, [loadState.status, id, router]);

  const handleDynamicChange = useCallback((key: string, value: string) => {
    setDynamicValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const getAvailableSortOrders = useCallback((current: ImageItem[]) => {
    const used = new Set(
      current
        .map((img) => img.sort_order)
        .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    );
    const available: number[] = [];
    for (let i = 0; i < MAX_LISTING_IMAGES; i++) {
      if (!used.has(i)) available.push(i);
    }
    return available;
  }, []);

  const handleDeletePhoto = useCallback(
    (img: ImageItem) => {
      if (photoActionLoading) return;
      if (images.length <= 1) {
        Alert.alert('Photos', 'Une annonce doit conserver au moins une photo.');
        return;
      }
      Alert.alert('Supprimer la photo ?', 'Cette action est définitive.', [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setPhotoActionLoading(true);
            const result = await deleteListingImage(img.id);
            if (!result.success) {
              Alert.alert('Erreur', result.error || 'Impossible de supprimer la photo.');
              setPhotoActionLoading(false);
              return;
            }
            setImages((prev) => prev.filter((p) => p.id !== img.id));
            setPhotoActionLoading(false);
          },
        },
      ]);
    },
    [images.length, photoActionLoading]
  );

  const pickAndUploadPhotos = useCallback(async () => {
    if (loadState.status !== 'ready') return;
    if (photoActionLoading) return;

    const availableSlots = getAvailableSortOrders(images);
    if (availableSlots.length <= 0) {
      Alert.alert('Photos', 'Une annonce ne peut pas contenir plus de 4 photos.');
      return;
    }

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

    const picked: PickedImage[] = result.assets.map((a) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
      mimeType: a.mimeType ?? null,
    }));

    const pickedWithBase64 = picked.filter(
      (p): p is PickedImage & { base64: string } => typeof p.base64 === 'string' && p.base64.length > 0
    );

    if (pickedWithBase64.length === 0) {
      Alert.alert('Photos', "Certaines photos n'ont pas pu être préparées.");
      return;
    }

    if (pickedWithBase64.length > availableSlots.length) {
      Alert.alert('Photos', 'Une annonce ne peut pas contenir plus de 4 photos.');
      return;
    }

    setPhotoActionLoading(true);
    try {
      const sortOrders = availableSlots.slice(0, pickedWithBase64.length);
      const uploadResult = await uploadListingImages(
        loadState.listing.id,
        pickedWithBase64.map((p) => ({
          base64: p.base64,
          uri: p.uri,
          mimeType: p.mimeType ?? null,
        })),
        { sortOrders }
      );

      if (uploadResult.status === 'failed') {
        Alert.alert('Erreur', uploadResult.error?.message || "Impossible d'ajouter les photos.");
        return;
      }
      if (uploadResult.status === 'partial') {
        Alert.alert('Photos', uploadResult.error?.message || "Certaines photos n'ont pas pu être ajoutées.");
      }

      // Recharger uniquement les photos depuis le backend sans toucher aux champs texte en cours d’édition.
      const refreshed = await getListingForEdit(loadState.listing.id);
      if (refreshed.error) {
        Alert.alert('Photos', "Photos ajoutées, mais impossible d'actualiser l'affichage.");
        return;
      }
      setImages(refreshed.data.imageItems ?? []);
    } finally {
      setPhotoActionLoading(false);
    }
  }, [getAvailableSortOrders, images, loadState, photoActionLoading]);

  const categoryLabel =
    loadState.status === 'ready'
      ? LISTING_CATEGORIES.find((c) => c.id === loadState.listing.category_id)?.label ?? 'Catégorie'
      : '';

  const handleSave = async () => {
    if (loadState.status !== 'ready' || !id) return;
    setSubmitError(null);

    const price = priceStr.trim() ? Number(priceStr.trim().replace(',', '.')) : NaN;
    if (!title.trim() || title.trim().length < 2) {
      setSubmitError('Titre requis (2 caractères minimum)');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setSubmitError('Prix invalide (doit être supérieur à 0)');
      return;
    }
    if (dynamicAttributesPilotActive && dynamicLoading) {
      setSubmitError('Chargement des caractéristiques… Réessayez dans un instant.');
      return;
    }

    setSubmitLoading(true);
    try {
      const up = await updateListing(id, {
        title: title.trim(),
        price: Math.round(price),
        city: city.trim(),
        description: description.trim() || '',
      });

      if (!up.success) {
        setSubmitError(up.error);
        return;
      }

      if (dynamicAttributesPilotActive && dynamicDefs.length > 0) {
        const emptyIds = collectEmptyDynamicAttributeDefinitionIds(dynamicDefs, dynamicValues);
        if (emptyIds.length > 0) {
          const delRes = await deleteListingDynamicAttributeValuesForDefinitions(id, emptyIds);
          if (!delRes.success) {
            console.warn('[ListingEdit] delete dynamic', delRes.error);
            Alert.alert(
              'Mise à jour partielle',
              `L’annonce a été enregistrée, mais la synchronisation des caractéristiques (suppression) a échoué : ${delRes.error}`
            );
            return;
          }
        }

        const rows = buildListingDynamicAttributeRows(
          dynamicDefs,
          dynamicValues,
          dynamicOptionsByDef
        );
        if (rows.length > 0) {
          const saveRes = await saveListingDynamicAttributeValues(id, rows);
          if (!saveRes.success) {
            console.warn('[ListingEdit] save dynamic', saveRes.error);
            Alert.alert(
              'Mise à jour partielle',
              `L’annonce a été enregistrée, mais l’enregistrement des caractéristiques a échoué : ${saveRes.error}`
            );
            return;
          }
        }
      }

      Alert.alert('Enregistré', 'Votre annonce a été mise à jour.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loadState.status === 'loading') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (loadState.status === 'error') {
    return (
      <Screen>
        <EmptyState
          title="Impossible de charger"
          message={loadState.message}
          action={
            <Button variant="secondary" onPress={() => router.back()}>
              Retour
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoid>
      <AppHeader title="Modifier l’annonce" showBack />
      <Text style={styles.subtitle}>Catégorie : {categoryLabel}</Text>

      {images.length > 0 ? (
        <View style={styles.imagesSection}>
          <Text style={styles.label}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbsRow}
          >
            {images.map((img) => (
              <View key={img.id} style={styles.thumbWrap}>
                <Image source={{ uri: img.displayUrl }} style={styles.thumb} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer la photo"
                  onPress={() => handleDeletePhoto(img)}
                  style={({ pressed }) => [
                    styles.removeThumb,
                    pressed && { opacity: 0.85 },
                    photoActionLoading && { opacity: 0.6 },
                  ]}
                >
                  <Ionicons name="close" size={14} color={colors.surface} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_LISTING_IMAGES ? (
              <Button
                variant="outline"
                size="md"
                onPress={pickAndUploadPhotos}
                disabled={photoActionLoading}
                loading={photoActionLoading}
                style={styles.addPhotoBtn}
              >
                + Photo
              </Button>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <Input
        label="Titre"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Input
        label="Prix (FCFA)"
        placeholder="0"
        value={priceStr}
        onChangeText={setPriceStr}
        keyboardType={Platform.OS === 'web' ? 'numeric' : 'decimal-pad'}
      />
      <Input
        label="Ville (optionnel)"
        value={city}
        onChangeText={setCity}
      />
      <Input
        label="Description (optionnelle)"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        style={styles.descriptionInput}
      />

      {dynamicAttributesPilotActive ? (
        <DynamicCategoryAttributesFields
          definitions={dynamicDefs}
          optionsByDefinitionId={dynamicOptionsByDef}
          loading={dynamicLoading}
          values={dynamicValues}
          onChange={handleDynamicChange}
        />
      ) : null}

      {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

      <View style={styles.actions}>
        <Button
          size="lg"
          onPress={handleSave}
          loading={submitLoading}
          disabled={submitLoading || (dynamicAttributesPilotActive && dynamicLoading)}
        >
          Enregistrer
        </Button>
        <Button variant="ghost" onPress={() => router.back()} style={styles.cancel}>
          Annuler
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: typography.sm.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
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
  thumbsRow: {
    flexDirection: 'row',
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
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text + 'AA',
  },
  addPhotoBtn: {
    alignSelf: 'center',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
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
