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
import {
  checkPhoneUniquenessForPublish,
  getCurrentProfile,
  sanitizeProfileDisplayValue,
} from '@/services/profile';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Aligné web : maximum 4 photos par annonce. */
const MAX_LISTING_IMAGES = 4;
/** Garde-fou trust (Sprint TRUST SAFE) : limite de publications / 24h. */
const MAX_LISTINGS_PER_24H = 5;
const TOTAL_STEPS = 3;

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

type PrequalStatus = 'loading' | 'ready';

function ChecklistRow({
  label,
  ok,
  hint,
}: {
  label: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkIconSlot}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'warning'}
          size={20}
          color={ok ? colors.success : colors.warning}
        />
      </View>
      <View style={styles.checkTextSlot}>
        <Text style={styles.checkLabel}>{label}</Text>
        {hint ? <Text style={styles.checkHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

function StepProgress({ step }: { step: number }) {
  const safeStep = Math.min(TOTAL_STEPS, Math.max(1, step));
  const pct = (safeStep / TOTAL_STEPS) * 100;
  return (
    <View style={styles.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ now: safeStep, min: 1, max: TOTAL_STEPS }}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>Publication</Text>
        <Text style={styles.progressMeta}>
          Étape {safeStep} / {TOTAL_STEPS}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export default function SellScreen() {
  const router = useRouter();
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [currentStep, setCurrentStep] = useState(1);
  const [showPrequal, setShowPrequal] = useState(true);
  const [prequalStatus, setPrequalStatus] = useState<PrequalStatus>('loading');
  const [profileAny, setProfileAny] = useState<Record<string, unknown> | null>(null);

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

  const goBackOrHome = useCallback(() => {
    const canGoBack =
      typeof (router as unknown as { canGoBack?: () => boolean }).canGoBack === 'function'
        ? (router as unknown as { canGoBack: () => boolean }).canGoBack()
        : false;
    if (canGoBack) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home' as Href);
  }, [router]);

  const resetForm = () => {
    setPublishState({ status: 'idle' });
    setCurrentStep(1);
    setShowPrequal(true);
    setPrequalStatus('loading');
    setProfileAny(null);
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
    let cancelled = false;
    (async () => {
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) {
            setProfileAny(null);
            setPrequalStatus('ready');
          }
          return;
        }
        const profileRes = await getCurrentProfile();
        const any = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
        if (!cancelled) {
          setProfileAny(any);
          setPrequalStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setProfileAny(null);
          setPrequalStatus('ready');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const profileAnyLocal = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
    const sellerNameValid = getFirstNonEmptyProfileField(profileAnyLocal, [
      'display_name',
      'username',
      'pseudo',
      'full_name',
    ]);
    const sellerPhoneValid = getFirstNonEmptyProfileField(profileAnyLocal, [
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

    if (profileAnyLocal?.is_banned === true) {
      const message = "Votre compte ne peut pas publier d'annonce pour le moment.";
      setSubmitError(message);
      Alert.alert('Publication impossible', message);
      return;
    }

    try {
      const phoneCheck = await checkPhoneUniquenessForPublish(session.user.id, sellerPhoneValid);
      if (!phoneCheck.ok) {
        const message = 'Ce numéro de téléphone est déjà utilisé par un autre compte.';
        setSubmitError(message);
        Alert.alert('Publication impossible', message);
        return;
      }
    } catch (e) {
      const message = 'Impossible de vérifier votre profil pour le moment. Réessayez.';
      console.warn('[SellScreen] checkPhoneUniquenessForPublish', e);
      setSubmitError(message);
      Alert.alert('Vérification impossible', message);
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
    if (!description.trim()) {
      setSubmitError('Veuillez ajouter une description à votre annonce.');
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
      // Limite publications / 24h (safe: si erreur Supabase/réseau, on bloque la publication).
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', since);

      if (countError) {
        const message = 'Impossible de vérifier votre limite de publication pour le moment. Réessayez.';
        console.warn('[SellScreen] dailyLimitCheck', countError);
        setSubmitError(message);
        Alert.alert('Vérification impossible', message);
        return;
      }

      if (typeof count !== 'number') {
        const message = 'Impossible de vérifier votre limite de publication pour le moment. Réessayez.';
        setSubmitError(message);
        Alert.alert('Vérification impossible', message);
        return;
      }

      if (count >= MAX_LISTINGS_PER_24H) {
        const message = "Vous avez atteint la limite de publication pour aujourd’hui. Réessayez plus tard.";
        setSubmitError(message);
        Alert.alert('Limite atteinte', message);
        return;
      }

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

  const sellerNamePrequal = getFirstNonEmptyProfileField(profileAny, [
    'display_name',
    'username',
    'pseudo',
    'full_name',
  ]);
  const sellerPhonePrequal = getFirstNonEmptyProfileField(profileAny, [
    'whatsapp_phone',
    'phone_number',
    'phone',
  ]);
  const hasProfileSellerName = !!sellerNamePrequal.trim();
  const hasPhone = !!sellerPhonePrequal.trim();
  const isAuthed = prequalStatus === 'ready' ? profileAny != null : false;

  if (showPrequal) {
    return (
      <Screen>
        <View style={styles.prequalWrap}>
          <Text style={styles.prequalTitle}>Avant de publier</Text>
          <Text style={styles.prequalSubtitle}>
            Vérifiez ces prérequis pour éviter un refus en fin de parcours.
          </Text>

          <View style={styles.prequalCard}>
            <Text style={styles.prequalCardTitle}>Pré‑requis</Text>
            <ChecklistRow
              label="Profil vendeur"
              ok={prequalStatus === 'ready' && isAuthed && hasProfileSellerName}
              hint={!isAuthed ? 'Connectez‑vous pour vérifier votre profil.' : !hasProfileSellerName ? 'Nom/pseudo manquant (non bloquant ici).' : undefined}
            />
            <ChecklistRow
              label="Téléphone"
              ok={prequalStatus === 'ready' && isAuthed && hasPhone}
              hint={!isAuthed ? 'Connectez‑vous pour vérifier votre téléphone.' : !hasPhone ? 'Téléphone manquant (non bloquant ici).' : undefined}
            />
            <ChecklistRow
              label="Photos (1 à 4)"
              ok={true}
              hint="Préparez 1 à 4 photos nettes (fond simple, bonne lumière)."
            />
          </View>

          {prequalStatus === 'ready' && isAuthed && !hasPhone ? (
            <View style={styles.softWarning}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.softWarningText}>
                Conseil: ajoutez un téléphone dans votre profil pour éviter un blocage au moment de publier.
              </Text>
            </View>
          ) : null}

          <View style={styles.prequalActions}>
            <Button
              size="lg"
              onPress={() => {
                setShowPrequal(false);
                setCurrentStep(1);
              }}
            >
              Continuer
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.push('/account/profile')}
            >
              Compléter mon profil
            </Button>
            <Button variant="ghost" onPress={goBackOrHome}>
              Annuler
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoid>
      <StepProgress step={currentStep} />
      <Text style={styles.title}>Vendre</Text>
      <Text style={styles.subtitle}>Publiez votre annonce en quelques minutes.</Text>

      {prequalStatus === 'ready' && isAuthed && !hasPhone ? (
        <View style={styles.inlineWarning}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={styles.inlineWarningText}>
            Téléphone manquant dans le profil: la publication sera bloquée au moment de publier.
          </Text>
          <Pressable onPress={() => router.push('/account/profile')} hitSlop={8}>
            <Text style={styles.inlineWarningLink}>Compléter</Text>
          </Pressable>
        </View>
      ) : null}

      {currentStep === 1 ? (
        <>
          <Input
            label="Titre"
            placeholder="Ex. Vélo de ville"
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
          <Input
            label="Ville (optionnel)"
            placeholder="Ex. Paris"
            value={city}
            onChangeText={setCity}
          />
        </>
      ) : null}

      {currentStep === 2 ? (
        <>
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
            label="Description"
            placeholder="Décrivez votre article..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.descriptionInput}
          />
        </>
      ) : null}

      {currentStep === 3 ? (
        <>
          <View style={styles.imagesSection}>
            <Text style={styles.label}>Photos</Text>
            <Text style={styles.stepHelper}>
              Ajoutez 1 à 4 photos. Une bonne première photo augmente les messages.
            </Text>
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
        </>
      ) : null}

      {submitError ? (
        <Text style={styles.submitError}>{submitError}</Text>
      ) : null}

      <View style={styles.actions}>
        {currentStep < TOTAL_STEPS ? (
          <>
            <Button
              size="lg"
              onPress={() => setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              disabled={dynamicAttributesPilotActive && dynamicLoading}
            >
              Continuer
            </Button>
            <View style={styles.stepActionsRow}>
              <Button
                variant="secondary"
                onPress={() => setCurrentStep((s) => Math.max(1, s - 1))}
                disabled={currentStep === 1}
              >
                Retour
              </Button>
              <Button variant="ghost" onPress={goBackOrHome} style={styles.cancelInline}>
                Annuler
              </Button>
            </View>
          </>
        ) : (
          <>
            <Button
              size="lg"
              onPress={handleSubmit}
              loading={submitLoading}
              disabled={submitLoading || (dynamicAttributesPilotActive && dynamicLoading)}
            >
              {"Publier l'annonce"}
            </Button>
            <View style={styles.stepActionsRow}>
              <Button
                variant="secondary"
                onPress={() => setCurrentStep((s) => Math.max(1, s - 1))}
              >
                Retour
              </Button>
              <Button variant="ghost" onPress={goBackOrHome} style={styles.cancelInline}>
                Annuler
              </Button>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.base,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  progressTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  progressMeta: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  prequalWrap: {
    paddingTop: spacing.xl,
    gap: spacing.base,
  },
  prequalTitle: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  prequalSubtitle: {
    ...typography.base,
    color: colors.textSecondary,
  },
  prequalCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    gap: spacing.sm,
  },
  prequalCardTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkIconSlot: {
    width: 24,
    paddingTop: 1,
    alignItems: 'center',
  },
  checkTextSlot: {
    flex: 1,
    gap: 2,
  },
  checkLabel: {
    ...typography.base,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  checkHint: {
    ...typography.xs,
    color: colors.textMuted,
  },
  prequalActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  softWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.xl,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning + '33',
  },
  softWarningText: {
    flex: 1,
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.warning + '33',
    backgroundColor: colors.warningLight,
    marginBottom: spacing.base,
  },
  inlineWarningText: {
    flex: 1,
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  inlineWarningLink: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: fontWeights.bold,
    textDecorationLine: 'underline',
  },
  stepHelper: {
    ...typography.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  stepActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cancelInline: {
    marginTop: 0,
    alignSelf: 'flex-end',
  },
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
