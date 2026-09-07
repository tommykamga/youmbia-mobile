/**
 * Sell / publish listing – stack screen (dedicated route).
 * Form: title, price, city, description, images. On success shows next actions.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  Platform,
  Pressable,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { buildAccountProfileHref } from '@/lib/profileReturnNavigation';
import {
  getSellerProfileDisplayName,
  getSellerProfilePhone,
  isSellerProfileComplete,
} from '@/lib/sellerProfile';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Button, Input, Loader, KeyboardSafeView } from '@/components';
import { type ListingCategoryId } from '@/lib/listingCategories';
import {
  categoryHasChildren,
  getChildMarketplaceCategories,
  getRootMarketplaceCategories,
  getSellParentIcon,
  resolveMarketplaceCategoryLabel,
  resolveSellCategorySelection,
} from '@/lib/marketplaceCategories';
import { consumeListingPublishDuplicateDraft } from '@/lib/listingPublishDraft';
import {
  readListingPublishMemory,
  saveListingPublishMemory,
  getAttributeHintsForCategory,
} from '@/lib/listingPublishMemory';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
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
import { getSellerShop } from '@/services/shops';
import { getSession } from '@/services/auth';
import {
  checkPhoneUniquenessForPublish,
  getCurrentProfile,
} from '@/services/profile';
import { supabase } from '@/lib/supabase';
import { getSellCategoryGuidanceForCategoryId } from '@/lib/sellCategoryGuidance';
import {
  LISTING_DESCRIPTION_MAX,
  LISTING_TITLE_MAX,
  parseListingPrice,
  sanitizeListingPriceDigits,
  shouldShowListingFieldError,
  validateListingCity,
  validateListingDescription,
  validateListingPrice,
  validateListingTitle,
} from '@/lib/listingPublishFormValidation';
import { computeListingQualityScore } from '@/lib/listingQualityScore';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  trackListingCreationCompleted,
  trackListingCreationStarted,
  trackPostPublishViewed,
} from '@/lib/analytics';
import { shareListingPreferWhatsApp } from '@/lib/shareListing';

/** Aligné web : maximum 4 photos par annonce. */
const MAX_LISTING_IMAGES = 4;
/** Garde-fou trust : limite haute de publications / 24h, conservée pour éviter le spam massif. */
const MAX_LISTINGS_PER_24H = 100;
const YOUMBIA_SELECTED_BG = 'rgba(22, 163, 74, 0.08)';
const YOUMBIA_SELECTED_GLOW = 'rgba(22, 163, 74, 0.18)';

function getSellCategoryColumnCount(screenWidth: number): number {
  if (screenWidth >= 900) return 5;
  if (screenWidth >= 600) return 4;
  return 3;
}

function getSellCategoryCardWidth(screenWidth: number, columns: number): number {
  const contentMaxWidth = 520;
  const horizontalPadding = spacing.base * 2;
  const gridGap = 6;
  const contentWidth = Math.min(screenWidth, contentMaxWidth) - horizontalPadding;
  const totalGap = gridGap * Math.max(0, columns - 1);
  return Math.max(56, Math.floor((contentWidth - totalGap) / columns));
}

function getSellPhotoSlotSize(screenWidth: number): number {
  const contentMaxWidth = 520;
  const horizontalPadding = spacing.base * 2;
  const gridGap = spacing.sm;
  const contentWidth = Math.min(screenWidth, contentMaxWidth) - horizontalPadding;
  const totalGap = gridGap * Math.max(0, MAX_LISTING_IMAGES - 1);
  return Math.max(68, Math.floor((contentWidth - totalGap) / MAX_LISTING_IMAGES));
}

function RequiredFieldLabel({ children }: { children: string }) {
  return (
    <Text style={styles.label}>
      {children}
      <Text style={styles.requiredMark}> *</Text>
    </Text>
  );
}

function SellFieldMeta({
  hint,
  counter,
  max,
}: {
  hint: string;
  counter: number;
  max: number;
}) {
  const atLimit = counter >= max;
  return (
    <View style={styles.fieldMetaRow}>
      <Text style={styles.fieldHint} numberOfLines={2}>
        {hint}
      </Text>
      <Text style={[styles.charCounter, atLimit ? styles.charCounterAtLimit : null]}>
        {counter} / {max}
      </Text>
    </View>
  );
}

type PickedImage = { uri: string; base64: string | null; mimeType?: string | null };

type PublishState =
  | { status: 'idle' }
  | { status: 'success'; listingId: string; title: string; price: number; city: string }
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

export default function SellScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const categoryColumns = useMemo(() => getSellCategoryColumnCount(screenWidth), [screenWidth]);
  const categoryCardWidth = useMemo(
    () => getSellCategoryCardWidth(screenWidth, categoryColumns),
    [screenWidth, categoryColumns]
  );
  const photoSlotSize = useMemo(() => getSellPhotoSlotSize(screenWidth), [screenWidth]);
  const { categories: marketplaceCategories, loading: categoriesLoading, error: categoriesError } =
    useMarketplaceCategories();
  const parentCategories = useMemo(
    () => getRootMarketplaceCategories(marketplaceCategories),
    [marketplaceCategories]
  );
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [showPrequal, setShowPrequal] = useState(false);
  const [prequalStatus, setPrequalStatus] = useState<PrequalStatus>('loading');
  const [profileAny, setProfileAny] = useState<Record<string, unknown> | null>(null);

  const [title, setTitle] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [selectedParentCategoryId, setSelectedParentCategoryId] =
    useState<ListingCategoryId | null>(null);
  const [selectedChildCategoryId, setSelectedChildCategoryId] =
    useState<ListingCategoryId | null>(null);
  const publishCategoryId = selectedChildCategoryId ?? selectedParentCategoryId;
  /** Catégorie pour les aides titre/description (parent seul si sous-catégorie pas encore choisie). */
  const guidanceCategoryId = publishCategoryId ?? selectedParentCategoryId;
  const sellGuidance = useMemo(
    () => getSellCategoryGuidanceForCategoryId(marketplaceCategories, guidanceCategoryId),
    [marketplaceCategories, guidanceCategoryId]
  );
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [publishShopId, setPublishShopId] = useState<string | null>(null);
  const [pendingDuplicateCategoryId, setPendingDuplicateCategoryId] = useState<number | null>(null);
  const pendingDuplicateDynamicRef = useRef<Record<string, string> | null>(null);
  const publishMemoryAppliedRef = useRef(false);
  const listingCreationStartedRef = useRef(false);

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
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [retryUploadLoading, setRetryUploadLoading] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [slowPublishHint, setSlowPublishHint] = useState(false);
  const postPublishViewedRef = useRef<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const subcategoryOptions = useMemo(() => {
    if (selectedParentCategoryId == null) {
      return [];
    }
    return getChildMarketplaceCategories(marketplaceCategories, selectedParentCategoryId);
  }, [selectedParentCategoryId, marketplaceCategories]);

  const selectParentCategory = useCallback((parentCategoryId: ListingCategoryId) => {
    setSelectedParentCategoryId(parentCategoryId);
    setSelectedChildCategoryId(null);
    setSubmitError(null);
  }, []);

  const selectChildCategory = useCallback((childCategoryId: ListingCategoryId) => {
    setSelectedChildCategoryId(childCategoryId);
    setSubmitError(null);
  }, []);

  const titleError = useMemo(() => validateListingTitle(title), [title]);
  const descriptionError = useMemo(() => validateListingDescription(description), [description]);
  const priceError = useMemo(() => validateListingPrice(priceStr), [priceStr]);
  const cityError = useMemo(() => validateListingCity(city), [city]);

  const showTitleError = shouldShowListingFieldError(title, titleError, validationAttempted);
  const showDescriptionError = shouldShowListingFieldError(
    description,
    descriptionError,
    validationAttempted
  );
  const showPriceError = shouldShowListingFieldError(priceStr, priceError, validationAttempted);
  const showCityError = shouldShowListingFieldError(city, cityError, validationAttempted);

  const listingQuality = useMemo(
    () =>
      computeListingQualityScore({
        title,
        description,
        priceStr,
        city,
        imageCount: images.length,
      }),
    [title, description, priceStr, city, images.length]
  );

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    setSubmitError(null);
  }, []);

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    setSubmitError(null);
  }, []);

  const handlePriceChange = useCallback((text: string) => {
    setPriceStr(sanitizeListingPriceDigits(text));
    setSubmitError(null);
  }, []);

  const handleCityChange = useCallback((text: string) => {
    setCity(text);
    setSubmitError(null);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!submitLoading && !retryUploadLoading) {
      setSlowPublishHint(false);
      return;
    }
    const timer = setTimeout(() => setSlowPublishHint(true), 8000);
    return () => clearTimeout(timer);
  }, [submitLoading, retryUploadLoading]);

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
    postPublishViewedRef.current = null;
    setSharingWhatsApp(false);
    setSlowPublishHint(false);
    setPublishState({ status: 'idle' });
    setPrequalStatus('loading');
    setProfileAny(null);
    setSubmitError(null);
    setValidationAttempted(false);
    setTitle('');
    setPriceStr('');
    setSelectedParentCategoryId(null);
    setSelectedChildCategoryId(null);
    setCity('');
    setDescription('');
    setImages([]);
    setDynamicDefs([]);
    setDynamicOptionsByDef(new Map());
    setDynamicValues({});
    setDynamicLoading(false);
    setDynamicAttributesPilotActive(false);
    setDuplicateSourceId(null);
    setPublishShopId(null);
    setPendingDuplicateCategoryId(null);
    pendingDuplicateDynamicRef.current = null;
    publishMemoryAppliedRef.current = false;
    void loadSellerPrequalProfile();
  };

  const markPublishSuccess = useCallback((listingId: string) => {
    const parsed = parseListingPrice(priceStr);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPublishState({
      status: 'success',
      listingId,
      title: title.trim(),
      price: Number.isFinite(parsed) ? Math.round(parsed) : 0,
      city: city.trim(),
    });
  }, [city, priceStr, title]);

  const loadSellerPrequalProfile = useCallback(async () => {
    setPrequalStatus('loading');
    try {
      const session = await getSession();
      if (!session?.user) {
        setProfileAny(null);
        setShowPrequal(true);
        setPrequalStatus('ready');
        return;
      }
      const profileRes = await getCurrentProfile();
      const any = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
      setProfileAny(any);
      const shopRes = await getSellerShop(session.user.id);
      setPublishShopId(shopRes.data?.id ?? null);
      setShowPrequal(!isSellerProfileComplete(any));
      setPrequalStatus('ready');
    } catch {
      setProfileAny(null);
      setShowPrequal(true);
      setPrequalStatus('ready');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSellerPrequalProfile();
    }, [loadSellerPrequalProfile])
  );

  const applyDuplicateDraft = useCallback((draft: ReturnType<typeof consumeListingPublishDuplicateDraft>) => {
    if (!draft) return;
    setDuplicateSourceId(draft.sourceListingId);
    setPublishShopId(draft.shopId);
    setTitle(draft.title);
    setPriceStr(String(draft.price));
    setCity(draft.city);
    setDescription(draft.description);
    setImages([]);
    setPendingDuplicateCategoryId(draft.publishCategoryId);
    pendingDuplicateDynamicRef.current = draft.dynamicValues;
    setSubmitError(null);
  }, []);

  const applyPublishMemoryDefaults = useCallback(
    async (categories: typeof marketplaceCategories) => {
      if (publishMemoryAppliedRef.current || categories.length === 0) return;
      publishMemoryAppliedRef.current = true;
      const memory = await readListingPublishMemory();
      setCity((prev) => prev.trim() || memory.lastCity?.trim() || '');
      if (memory.lastParentCategoryId != null) {
        const leafId = memory.lastChildCategoryId ?? memory.lastParentCategoryId;
        const { parentId, childId } = resolveSellCategorySelection(categories, leafId);
        setSelectedParentCategoryId(parentId);
        setSelectedChildCategoryId(childId);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const draft = consumeListingPublishDuplicateDraft();
      if (draft) {
        publishMemoryAppliedRef.current = true;
        applyDuplicateDraft(draft);
        if (!listingCreationStartedRef.current) {
          listingCreationStartedRef.current = true;
          trackListingCreationStarted({
            creation_origin: 'duplicate',
            city_selected: draft.city,
          });
        }
        return;
      }
      if (!listingCreationStartedRef.current) {
        listingCreationStartedRef.current = true;
        trackListingCreationStarted({ creation_origin: 'sell_tab' });
      }
    }, [applyDuplicateDraft])
  );

  useEffect(() => {
    if (duplicateSourceId || publishMemoryAppliedRef.current) return;
    if (marketplaceCategories.length === 0) return;
    void applyPublishMemoryDefaults(marketplaceCategories);
  }, [duplicateSourceId, marketplaceCategories, applyPublishMemoryDefaults]);

  useEffect(() => {
    if (pendingDuplicateCategoryId == null || marketplaceCategories.length === 0) return;
    const { parentId, childId } = resolveSellCategorySelection(
      marketplaceCategories,
      pendingDuplicateCategoryId
    );
    setSelectedParentCategoryId(parentId);
    setSelectedChildCategoryId(childId);
    setPendingDuplicateCategoryId(null);
  }, [pendingDuplicateCategoryId, marketplaceCategories]);

  useEffect(() => {
    if (publishCategoryId == null) {
      setDynamicAttributesPilotActive(false);
      setDynamicDefs([]);
      setDynamicOptionsByDef(new Map());
      setDynamicValues({});
      setDynamicLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const pilot = await shouldUseDynamicAttributesPilot(publishCategoryId);
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
      const defs = await getEffectiveCategoryAttributeDefinitionsResolved(publishCategoryId);
      if (cancelled) return;
      const selectIds = defs.filter((d) => d.type === 'select').map((d) => d.definition_id);
      const optsMap = await getCategoryAttributeOptionsByDefinitionIds(selectIds);
      if (cancelled) return;
      setDynamicDefs(defs);
      setDynamicOptionsByDef(optsMap);
      const duplicateValues = pendingDuplicateDynamicRef.current;
      if (duplicateValues && Object.keys(duplicateValues).length > 0) {
        setDynamicValues(duplicateValues);
        pendingDuplicateDynamicRef.current = null;
      } else if (!duplicateSourceId) {
        const memory = await readListingPublishMemory();
        if (!cancelled) {
          const hints = getAttributeHintsForCategory(memory, publishCategoryId);
          if (Object.keys(hints).length > 0) {
            setDynamicValues((prev) => {
              const next = { ...prev };
              for (const def of defs) {
                const hint = hints[def.key];
                if (hint && !String(prev[def.key] ?? '').trim()) {
                  next[def.key] = hint;
                }
              }
              return next;
            });
          }
        }
      }
      setDynamicLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [publishCategoryId, duplicateSourceId]);

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
      mimeType: a.mimeType ?? null,
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, MAX_LISTING_IMAGES));
    setSubmitError(null);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (submitLoading) return;
    setSubmitError(null);
    setSubmitLoading(true);

    try {
      const session = await getSession();
      if (!session?.user) {
        router.replace(buildAuthGateHref('sell'));
        return;
      }

      // Aligné web : profil vendeur obligatoire (nom/pseudo) + téléphone obligatoire
      const profileRes = await getCurrentProfile();
      const profileAnyLocal = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
      const sellerNameValid = getSellerProfileDisplayName(profileAnyLocal);
      const sellerPhoneValid = getSellerProfilePhone(profileAnyLocal);
      if (!sellerNameValid.trim() || !sellerPhoneValid.trim()) {
        const message =
          "Avant de publier une annonce, complète ton profil vendeur avec ton nom ou pseudo et ton numéro de téléphone.";
        setSubmitError(message);
        Alert.alert('Profil vendeur incomplet', message, [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Compléter mon profil', onPress: () => router.push(buildAccountProfileHref('/sell')) },
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

      setValidationAttempted(true);

      const titleValidationError = validateListingTitle(title);
      if (titleValidationError) {
        setSubmitError(titleValidationError);
        return;
      }
      const descriptionValidationError = validateListingDescription(description);
      if (descriptionValidationError) {
        setSubmitError(descriptionValidationError);
        return;
      }
      const priceValidationError = validateListingPrice(priceStr);
      if (priceValidationError) {
        setSubmitError(priceValidationError);
        return;
      }
      const price = parseListingPrice(priceStr);
      if (!publishCategoryId) {
        if (
          selectedParentCategoryId != null &&
          categoryHasChildren(marketplaceCategories, selectedParentCategoryId)
        ) {
          setSubmitError('Choisissez une sous-catégorie pour continuer.');
        } else {
          setSubmitError('Catégorie requise');
        }
        return;
      }
      if (images.length === 0 || !images.some((img) => !!img.base64 || !!img.uri)) {
        setSubmitError('Ajoutez au moins une photo pour publier.');
        return;
      }
      if (dynamicAttributesPilotActive && dynamicLoading) {
        setSubmitError('Chargement des caractéristiques… Réessayez dans un instant.');
        return;
      }
      const cityValidationError = validateListingCity(city);
      if (cityValidationError) {
        setSubmitError(cityValidationError);
        return;
      }

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
        categoryId: publishCategoryId,
        city: city.trim(),
        description: description.trim() || '',
        shopId: publishShopId,
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

      trackListingCreationCompleted({
        listing_id: listingId,
        has_photos: images.length > 0,
        category: resolveMarketplaceCategoryLabel(marketplaceCategories, publishCategoryId),
        city: city.trim(),
      });

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
          withBase64.map((img) => ({
            base64: img.base64,
            uri: img.uri,
            mimeType: img.mimeType ?? null,
          }))
        );

        const uploadedCount = uploadResult.data.uploadedCount;
        const failedCount = uploadResult.data.failedCount + missingBase64Count;
        const totalCount = images.length;

        if (uploadResult.status === 'ok' && missingBase64Count === 0) {
          void saveListingPublishMemory({
            city: city.trim(),
            parentCategoryId: selectedParentCategoryId,
            childCategoryId: selectedChildCategoryId,
            publishCategoryId,
            dynamicValues,
          });
          markPublishSuccess(listingId);
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

      void saveListingPublishMemory({
        city: city.trim(),
        parentCategoryId: selectedParentCategoryId,
        childCategoryId: selectedChildCategoryId,
        publishCategoryId,
        dynamicValues,
      });
      markPublishSuccess(listingId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Impossible de publier l'annonce");
    } finally {
      setSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (publishState.status !== 'success') return;
    if (postPublishViewedRef.current === publishState.listingId) return;
    postPublishViewedRef.current = publishState.listingId;
    trackPostPublishViewed({ listing_id: publishState.listingId });
  }, [publishState]);

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
        withBase64.map((img) => ({
          base64: img.base64,
          uri: img.uri,
          mimeType: img.mimeType ?? null,
        }))
      );

      const uploadedCount = uploadResult.data.uploadedCount;
      const failedCount = uploadResult.data.failedCount + missingBase64Count;
      const totalCount = images.length;

      if (uploadResult.status === 'ok' && missingBase64Count === 0) {
        markPublishSuccess(publishState.listingId);
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

  const handleViewPublishedListing = () => {
    if (publishState.status !== 'success' || !publishState.listingId) return;
    router.push(`/listing/${publishState.listingId}`);
  };

  const handleSharePublishedWhatsApp = async () => {
    if (publishState.status !== 'success' || sharingWhatsApp || !publishState.listingId) return;
    setSharingWhatsApp(true);
    try {
      const result = await shareListingPreferWhatsApp({
        id: publishState.listingId,
        title: publishState.title,
        price: publishState.price,
        city: publishState.city,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage', result.error);
      }
    } catch {
      Alert.alert('Partage', 'Impossible de partager cette annonce.');
    } finally {
      setSharingWhatsApp(false);
    }
  };

  if (publishState.status === 'success') {
    return (
      <Screen>
        <View style={styles.successBlock}>
          <Text style={styles.successTitle}>Votre annonce est en ligne</Text>
          <Text style={styles.successSubtitle}>
            Consultez-la ou partagez-la avec vos contacts.
          </Text>
          <View style={styles.successActions}>
            <Button
              size="lg"
              onPress={handleViewPublishedListing}
              style={styles.successBtn}
            >
              Voir mon annonce
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={handleSharePublishedWhatsApp}
              loading={sharingWhatsApp}
              disabled={sharingWhatsApp}
              style={styles.successBtn}
            >
              Partager sur WhatsApp
            </Button>
            <Button variant="ghost" size="lg" onPress={resetForm} style={styles.successBtn}>
              Publier une autre annonce
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
          {slowPublishHint ? (
            <Text style={styles.slowPublishHint}>
              La connexion est lente. Votre annonce est déjà créée ; les photos peuvent être réessayées.
            </Text>
          ) : null}
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

  const sellerNamePrequal = getSellerProfileDisplayName(profileAny);
  const sellerPhonePrequal = getSellerProfilePhone(profileAny);
  const hasProfileSellerName = !!sellerNamePrequal.trim();
  const hasPhone = !!sellerPhonePrequal.trim();
  const isAuthed = prequalStatus === 'ready' ? profileAny != null : false;
  const sellerProfileComplete = isSellerProfileComplete(profileAny);

  if (prequalStatus === 'loading') {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (showPrequal && !sellerProfileComplete) {
    return (
      <Screen>
        <View style={styles.content}>
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
              }}
            >
              Continuer
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.push(buildAccountProfileHref('/sell'))}
            >
              Compléter mon profil
            </Button>
            <Button variant="ghost" onPress={goBackOrHome}>
              Annuler
            </Button>
          </View>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <KeyboardSafeView style={styles.formLayout}>
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={[
            styles.formScrollContent,
            keyboardVisible ? styles.formScrollContentKeyboardOpen : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Vendre</Text>
            <Text style={styles.subtitle}>Publiez votre annonce en quelques minutes.</Text>
            <Text style={styles.publishQualityTip}>
              Quelques détails de plus augmentent vos chances de vendre rapidement.
            </Text>

            {duplicateSourceId ? (
              <View style={styles.duplicateBanner}>
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
                <View style={styles.duplicateBannerTextSlot}>
                  <Text style={styles.duplicateBannerTitle}>Brouillon depuis une annonce</Text>
                  <Text style={styles.duplicateBannerText}>
                    Les informations sont préremplies. Ajoutez de nouvelles photos avant de publier — les
                    images de l&apos;annonce d&apos;origine ne sont pas recopiées.
                  </Text>
                </View>
              </View>
            ) : null}

            {prequalStatus === 'ready' && isAuthed && !hasPhone ? (
              <View style={styles.inlineWarning}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.inlineWarningText}>
                  Ajoutez un numéro pour publier votre annonce.
                </Text>
                <Pressable onPress={() => router.push(buildAccountProfileHref('/sell'))} hitSlop={8}>
                  <Text style={styles.inlineWarningLink}>Compléter</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.imagesSection}>
              <RequiredFieldLabel>Photos</RequiredFieldLabel>
              <Text style={styles.stepHelper}>
                {duplicateSourceId
                  ? 'Photos obligatoires pour cette nouvelle annonce (non dupliquées depuis l’originale). Ajoutez jusqu’à 4 photos — la première sera affichée en couverture.'
                  : 'Ajoutez jusqu’à 4 photos. La première sera affichée en couverture.'}
              </Text>
              <Text style={styles.photoCounter}>
                {images.length} / {MAX_LISTING_IMAGES} photos
              </Text>
              {images.length === 0 ? (
                <Text style={styles.photoZeroHint}>Ajoutez au moins une photo pour publier.</Text>
              ) : null}
              <View style={styles.photoSlotsRow}>
                {Array.from({ length: MAX_LISTING_IMAGES }, (_, index) => {
                  const image = images[index];
                  const slotStyle = { width: photoSlotSize, height: photoSlotSize };

                  if (image) {
                    return (
                      <View key={`photo-slot-${index}`} style={[styles.photoSlot, slotStyle]}>
                        <Image source={{ uri: image.uri }} style={styles.photoSlotImage} resizeMode="cover" />
                        {index === 0 ? (
                          <View style={styles.photoCoverBadge} pointerEvents="none">
                            <Text style={styles.photoCoverBadgeText}>Couverture</Text>
                          </View>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Supprimer la photo"
                          onPress={() => removeImage(index)}
                          style={styles.photoSlotRemove}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={12} color={colors.text} />
                        </Pressable>
                      </View>
                    );
                  }

                  const isPrimaryAddSlot = images.length === 0 && index === 0;

                  return (
                    <Pressable
                      key={`photo-slot-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={isPrimaryAddSlot ? 'Ajouter une photo' : 'Ajouter une photo'}
                      style={({ pressed }) => [
                        styles.photoSlot,
                        isPrimaryAddSlot ? styles.photoSlotPrimaryAdd : styles.photoSlotEmpty,
                        slotStyle,
                        pressed && (isPrimaryAddSlot ? styles.photoSlotPrimaryAddPressed : styles.photoSlotEmptyPressed),
                      ]}
                      onPress={() => {
                        if (images.length < MAX_LISTING_IMAGES) {
                          void pickImages();
                        }
                      }}
                      disabled={images.length >= MAX_LISTING_IMAGES}
                    >
                      {isPrimaryAddSlot ? (
                        <View style={styles.photoSlotPrimaryAddContent}>
                          <Ionicons name="camera-outline" size={20} color={colors.primary} />
                          <Text style={styles.photoSlotPrimaryAddTitle}>Ajouter une photo</Text>
                        </View>
                      ) : (
                        <Ionicons name="add" size={20} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.photoQualityTip}>
                Conseil : utilisez des photos nettes, bien éclairées, sans montage.
              </Text>
            </View>

            <View style={styles.validatedField}>
              <Input
                label="Titre *"
                placeholder={sellGuidance.titlePlaceholder}
                value={title}
                onChangeText={handleTitleChange}
                maxLength={LISTING_TITLE_MAX}
                error={showTitleError ? (titleError ?? undefined) : undefined}
                containerStyle={styles.validatedFieldInput}
              />
              <SellFieldMeta
                hint={sellGuidance.titleHint}
                counter={title.length}
                max={LISTING_TITLE_MAX}
              />
            </View>

            <View style={styles.validatedField}>
              <Input
                label="Description *"
                placeholder={sellGuidance.descriptionPlaceholder}
                value={description}
                onChangeText={handleDescriptionChange}
                multiline
                numberOfLines={4}
                style={styles.descriptionInput}
                maxLength={LISTING_DESCRIPTION_MAX}
                error={showDescriptionError ? (descriptionError ?? undefined) : undefined}
                containerStyle={styles.validatedFieldInput}
              />
              <SellFieldMeta
                hint={sellGuidance.descriptionHint}
                counter={description.length}
                max={LISTING_DESCRIPTION_MAX}
              />
            </View>

            <View style={styles.categorySection}>
              <RequiredFieldLabel>Catégorie</RequiredFieldLabel>
              {categoriesLoading ? (
                <View style={styles.categoryLoadingSlot}>
                  <Loader />
                </View>
              ) : categoriesError ? (
                <Text style={styles.categoryLoadError}>{categoriesError}</Text>
              ) : (
                <>
                  <View style={styles.categoryGrid}>
                    {parentCategories.map((category) => {
                      const isSelected = selectedParentCategoryId === category.id;
                      return (
                        <Pressable
                          key={category.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          style={({ pressed }) => [
                            styles.categoryCard,
                            { width: categoryCardWidth },
                            isSelected && styles.categoryCardSelected,
                            pressed && styles.categoryCardPressed,
                          ]}
                          onPress={() => selectParentCategory(category.id)}
                        >
                          {isSelected ? (
                            <View style={styles.categoryCardCheck}>
                              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                            </View>
                          ) : null}
                          <View style={styles.categoryIconSlot}>
                            <Ionicons
                              name={getSellParentIcon(category.slug)}
                              size={isSelected ? 17 : 15}
                              color={isSelected ? colors.primary : colors.textSecondary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.categoryCardLabel,
                              isSelected && styles.categoryCardLabelSelected,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.9}
                          >
                            {category.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {subcategoryOptions.length > 0 ? (
                    <View style={styles.subcategorySection}>
                      <Text style={styles.subcategoryLabel}>Sous-catégorie</Text>
                      <View style={styles.subcategoryChipRow}>
                        {subcategoryOptions.map((subcategory) => {
                          const isSelected = selectedChildCategoryId === subcategory.id;
                          return (
                            <Pressable
                              key={subcategory.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                              style={({ pressed }) => [
                                styles.subcategoryChip,
                                isSelected && styles.subcategoryChipSelected,
                                pressed && styles.subcategoryChipPressed,
                              ]}
                              onPress={() => selectChildCategory(subcategory.id)}
                            >
                              <Text
                                style={[
                                  styles.subcategoryChipText,
                                  isSelected && styles.subcategoryChipTextSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {subcategory.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </>
              )}
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
              label="Prix (FCFA) *"
              placeholder="50000"
              value={priceStr}
              onChangeText={handlePriceChange}
              keyboardType={Platform.OS === 'web' ? 'numeric' : 'number-pad'}
              error={showPriceError ? (priceError ?? undefined) : undefined}
            />

            <Input
              label="Ville (optionnel)"
              placeholder="Ex. Douala"
              value={city}
              onChangeText={handleCityChange}
              maxLength={20}
              error={showCityError ? (cityError ?? undefined) : undefined}
            />

            <Text style={styles.requiredLegend}>* Champ obligatoire</Text>

            {submitError ? <Text style={styles.submitErrorForm}>{submitError}</Text> : null}
            {slowPublishHint ? (
              <Text style={styles.slowPublishHint} accessibilityLiveRegion="polite">
                Connexion lente. Vos informations restent enregistrées, sans republication automatique.
              </Text>
            ) : null}

            <View
              style={styles.qualityCardCompact}
              accessibilityRole="progressbar"
              accessibilityLabel={`Qualité de l'annonce : ${listingQuality.score} sur 100. ${listingQuality.label}`}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: listingQuality.score,
                text: `${listingQuality.score} sur 100`,
              }}
            >
              <View style={styles.qualityCardCompactHeader}>
                <Text style={styles.qualityCardCompactTitle}>Qualité de l&apos;annonce</Text>
                <Text style={styles.qualityCardCompactScore}>{listingQuality.score}/100</Text>
              </View>
              <Text style={styles.qualityCardCompactAdvice} numberOfLines={2}>
                {listingQuality.priorityTip ?? listingQuality.label}
              </Text>
              <View style={styles.qualityCardCompactTrack}>
                <View
                  style={[
                    styles.qualityCardCompactFill,
                    { width: `${listingQuality.progressRatio * 100}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.stickyFooter}>
          <View style={[styles.content, styles.stickyFooterActions]}>
            <Button
              size="sm"
              onPress={handleSubmit}
              loading={submitLoading}
              disabled={submitLoading || (dynamicAttributesPilotActive && dynamicLoading)}
              leftIcon={
                submitLoading ? undefined : (
                  <Ionicons name="paper-plane" size={15} color={colors.surface} />
                )
              }
              style={styles.publishCta}
            >
              {"Publier l'annonce"}
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Annuler"
              onPress={goBackOrHome}
              disabled={submitLoading}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={({ pressed }) => [
                styles.footerCancelPressable,
                pressed && !submitLoading ? styles.footerCancelPressed : null,
                submitLoading ? styles.footerCancelDisabled : null,
              ]}
            >
              <Text style={styles.footerCancelText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardSafeView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formLayout: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  formScrollContentKeyboardOpen: {
    paddingBottom: spacing['2xl'],
  },
  stickyFooter: {
    paddingTop: 2,
    ...Platform.select({
      ios: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderLight,
        backgroundColor: colors.background,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        elevation: 0,
      },
      default: {
        backgroundColor: colors.background,
      },
    }),
  },
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    backgroundColor: colors.primary + '0D',
    marginBottom: spacing.base,
  },
  duplicateBannerTextSlot: {
    flex: 1,
    gap: 2,
  },
  duplicateBannerTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  duplicateBannerText: {
    ...typography.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  stickyFooterActions: {
    gap: 2,
    paddingBottom: 0,
  },
  qualityCardCompact: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: 3,
  },
  qualityCardCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  qualityCardCompactTitle: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    flex: 1,
  },
  qualityCardCompactScore: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  qualityCardCompactAdvice: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 15,
  },
  qualityCardCompactTrack: {
    height: 2,
    borderRadius: radius.full,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  qualityCardCompactFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minWidth: 0,
  },
  footerCancelPressable: {
    alignSelf: 'center',
    paddingVertical: 2,
    minHeight: 28,
    justifyContent: 'center',
  },
  footerCancelPressed: {
    opacity: 0.65,
  },
  footerCancelDisabled: {
    opacity: 0.4,
  },
  footerCancelText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
    textDecorationLine: 'underline',
    textDecorationColor: colors.border,
  },
  content: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
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
    marginBottom: spacing.xs,
  },
  photoCounter: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  photoZeroHint: {
    ...typography.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  photoQualityTip: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  photoCoverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  photoCoverBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  validatedField: {
    marginBottom: 0,
  },
  validatedFieldInput: {
    marginBottom: spacing.xs,
  },
  fieldMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.base,
    marginTop: -spacing.xs,
  },
  fieldHint: {
    flex: 1,
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 16,
  },
  charCounter: {
    ...typography.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  charCounterAtLimit: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
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
    marginBottom: spacing.sm,
  },
  publishQualityTip: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 18,
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
  requiredMark: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  requiredLegend: {
    ...typography.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  imagesSection: {
    marginBottom: spacing.lg,
  },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryLoadingSlot: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLoadError: {
    ...typography.sm,
    color: colors.error,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryCard: {
    minHeight: 60,
    paddingVertical: 0,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    position: 'relative',
  },
  categoryCardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: YOUMBIA_SELECTED_BG,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      default: {
        boxShadow: `0 2px 8px ${YOUMBIA_SELECTED_GLOW}`,
      },
    }),
  },
  categoryCardPressed: {
    opacity: 0.9,
  },
  categoryCardCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 1,
  },
  categoryIconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  categoryCardLabelSelected: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  subcategorySection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  subcategoryLabel: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  subcategoryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subcategoryChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    maxWidth: '100%',
  },
  subcategoryChipSelected: {
    borderColor: colors.primary,
    backgroundColor: YOUMBIA_SELECTED_BG,
  },
  subcategoryChipPressed: {
    opacity: 0.92,
  },
  subcategoryChipText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  subcategoryChipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  publishCta: {
    width: '100%',
    minHeight: 40,
    paddingVertical: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: `0 6px 14px ${YOUMBIA_SELECTED_GLOW}`,
      },
    }),
  },
  photoSlotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoSlot: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  photoSlotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  photoSlotEmptyPressed: {
    opacity: 0.92,
    backgroundColor: colors.primary + '08',
  },
  photoSlotPrimaryAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: 'rgba(22, 163, 74, 0.28)',
    backgroundColor: 'rgba(22, 163, 74, 0.06)',
    paddingHorizontal: spacing.xs,
  },
  photoSlotPrimaryAddPressed: {
    opacity: 0.94,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
  },
  photoSlotPrimaryAddContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  photoSlotPrimaryAddTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
    textAlign: 'center',
  },
  photoSlotImage: {
    width: '100%',
    height: '100%',
  },
  photoSlotRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      default: {
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.12)',
      },
    }),
  },
  submitErrorForm: {
    ...typography.xs,
    color: colors.error,
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  slowPublishHint: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
