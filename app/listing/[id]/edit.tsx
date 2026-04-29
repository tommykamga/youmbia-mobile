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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  type ListingForEdit,
} from '@/services/listings';
import { getSession } from '@/services/auth';
import { DynamicCategoryAttributesFields } from '@/features/sell/DynamicCategoryAttributesFields';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated' }
  | { status: 'ready'; listing: ListingForEdit };

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

  const listing = loadState.listing;

  return (
    <Screen scroll keyboardAvoid>
      <AppHeader title="Modifier l’annonce" showBack />
      <Text style={styles.subtitle}>Catégorie : {categoryLabel}</Text>

      {listing.images.length > 0 ? (
        <View style={styles.imagesSection}>
          <Text style={styles.label}>Photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>
            {listing.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.thumb} />
            ))}
          </ScrollView>
          <Text style={styles.photoHint}>La modification des photos arrive prochainement.</Text>
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
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  photoHint: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
