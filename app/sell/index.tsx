/**
 * Sell / publish listing – stack screen (dedicated route).
 * Form: title, price, city, description, images. On success shows next actions.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Pressable,
  Keyboard,
  useWindowDimensions,
  PixelRatio,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type View as RNView,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { buildAccountProfileHref } from '@/lib/profileReturnNavigation';
import {
  getSellerProfileDisplayName,
  getSellerProfilePhone,
  isSellerProfileComplete,
} from '@/lib/sellerProfile';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Button, Loader, KeyboardSafeView } from '@/components';
import { type ListingCategoryId } from '@/lib/listingCategories';
import {
  categoryHasChildren,
  getChildMarketplaceCategories,
  getRootMarketplaceCategories,
  resolveMarketplaceCategoryLabel,
  resolveSellCategorySelection,
} from '@/lib/marketplaceCategories';
import { consumeListingPublishDuplicateDraft } from '@/lib/listingPublishDraft';
import {
  DRAFT_LISTING_SAVE_ACTION,
  DRAFT_LISTING_SAVED_ACK_FAILED_SUBTITLE,
  DRAFT_LISTING_SAVED_MESSAGE,
  DRAFT_LISTING_SAVED_SUBTITLE,
} from '@/lib/listingStatus';
import { acknowledgeDraftRemindersNotice } from '@/services/emailPreferences';
import {
  filterUploadableListingPhotos,
  isPersistedListingImageId,
  nextListingImageSortOrders,
  pendingCopiedListingImageSources,
} from '@/lib/listingDraftPhotoPlan';
import { toPendingCopiedDraftImages } from '@/lib/listingDuplicateImages';
import {
  readListingPublishMemory,
  saveListingPublishMemory,
  getAttributeHintsForCategory,
} from '@/lib/listingPublishMemory';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
import type {
  CategoryAttributeOption,
  EffectiveCategoryAttributeDefinitionResolved,
} from '@/lib/categoryAttributesTypes';
import {
  getEffectiveCategoryAttributeDefinitionsResolved,
  getCategoryAttributeOptionsByDefinitionIds,
} from '@/services/categoryAttributes';
import { collectEmptyDynamicAttributeDefinitionIds, buildListingDynamicAttributeRows } from '@/lib/listingDynamicAttributesPayload';
import { SellFlowHeader } from '@/features/sell/SellFlowHeader';
import { SellPrequalBanner } from '@/features/sell/SellPrequalBanner';
import { SellPublishSuccess } from '@/features/sell/SellPublishSuccess';
import { SellStepDetails } from '@/features/sell/SellStepDetails';
import { SellStepPhotos, MAX_SELL_LISTING_PHOTOS } from '@/features/sell/SellStepPhotos';
import { SellStepReview } from '@/features/sell/SellStepReview';
import {
  resolveInitialSellFlowStep,
  sellFlowNextStep,
  sellFlowPreviousStep,
  shouldHideSellStickyFooter,
  type SellFlowStepId,
} from '@/features/sell/sellFlowSteps';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import {
  createListingDraft,
  updateListingDraft,
  publishListingSafely,
  buildListingResumeDraft,
  copyListingImagesToListing,
  uploadListingImages,
  deleteListingImage,
  deleteListing,
  getListingForEdit,
  saveListingDynamicAttributeValues,
  deleteListingDynamicAttributeValuesForDefinitions,
  LISTING_IMAGE_COPY_FAILED_MESSAGE,
  type ListingResumeDraftData,
} from '@/services/listings';
import { getSellerShop } from '@/services/shops';
import { getSession } from '@/services/auth';
import {
  checkPhoneUniquenessForPublish,
  getCurrentProfile,
} from '@/services/profile';
import { getSellCategoryGuidanceForCategoryId } from '@/lib/sellCategoryGuidance';
import {
  parseListingPrice,
  sanitizeListingPriceDigits,
  shouldShowListingFieldError,
  validateListingCity,
  validateListingDescription,
  validateListingPrice,
  validateListingTitle,
} from '@/lib/listingPublishFormValidation';
import { computeListingQualityScore } from '@/lib/listingQualityScore';
import { canonicalCityInputValue, canonicalCityLabel, resolveCanonicalCity } from '@/lib/canonicalCity';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  trackListingCreationCompleted,
  trackListingCreationStarted,
  trackListingDuplicatePublished,
  trackPostPublishViewed,
} from '@/lib/analytics';
import { shareListingPreferWhatsApp } from '@/lib/shareListing';
import {
  scheduleSellDetailsFieldScroll,
  scrollSellDetailsFieldIntoView,
  shouldRunSellDetailsAndroidFocusScroll,
  type SellDetailsKeyboardFieldId,
} from '@/features/sell/sellDetailsKeyboardFocus';

/** Aligné web : maximum 4 photos par annonce. */
const MAX_LISTING_IMAGES = MAX_SELL_LISTING_PHOTOS;
const YOUMBIA_SELECTED_GLOW = 'rgba(22, 163, 74, 0.18)';

type ExistingDraftImage = {
  id: string;
  path: string;
  sort_order: number | null;
  displayUrl: string;
};

type PickedImage = { uri: string; base64: string | null; mimeType?: string | null };

type PublishState =
  | { status: 'idle' }
  | { status: 'success'; listingId: string; title: string; price: number; city: string };

type PrequalStatus = 'loading' | 'ready';

export default function SellScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ draftId?: string | string[] }>();
  const routeDraftId = useMemo(() => {
    const raw = rawParams.draftId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value ?? '').trim() || null;
  }, [rawParams.draftId]);
  const { categories: marketplaceCategories, loading: categoriesLoading, error: categoriesError } =
    useMarketplaceCategories();
  const parentCategories = useMemo(
    () => getRootMarketplaceCategories(marketplaceCategories),
    [marketplaceCategories]
  );
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });
  const [prequalStatus, setPrequalStatus] = useState<PrequalStatus>('loading');
  const [profileAny, setProfileAny] = useState<Record<string, unknown> | null>(null);
  const [flowStep, setFlowStep] = useState<SellFlowStepId>('photos');
  const flowBootKeyRef = useRef<string | null>(null);

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
  const [existingDraftImages, setExistingDraftImages] = useState<ExistingDraftImage[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftLoadStatus, setDraftLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    () => (routeDraftId ? 'loading' : 'idle')
  );
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftSaveLoading, setDraftSaveLoading] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [publishShopId, setPublishShopId] = useState<string | null>(null);
  const [pendingDuplicateCategoryId, setPendingDuplicateCategoryId] = useState<number | null>(null);
  const pendingDuplicateDynamicRef = useRef<Record<string, string> | null>(null);
  const publishMemoryAppliedRef = useRef(false);
  const listingCreationStartedRef = useRef(false);
  const loadedRouteDraftIdRef = useRef<string | null>(null);

  const [dynamicDefs, setDynamicDefs] = useState<EffectiveCategoryAttributeDefinitionResolved[]>([]);
  const [dynamicOptionsByDef, setDynamicOptionsByDef] = useState<
    Map<string, CategoryAttributeOption[]>
  >(() => new Map());
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [dynamicLoading, setDynamicLoading] = useState(false);
  /** Render every effective definition required by the server publication contract. */
  const [dynamicAttributesPilotActive, setDynamicAttributesPilotActive] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const publicationBusyRef = useRef(false);
  const publicationDraftIdRef = useRef<string | null>(null);
  const publicationPhotoSlotsRef = useRef(new Map<string, number>());
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [slowPublishHint, setSlowPublishHint] = useState(false);
  const postPublishViewedRef = useRef<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const formScrollRef = useRef<ScrollView>(null);
  const formScrollOffsetYRef = useRef(0);
  const lastSellDetailsFocusAnchorRef = useRef<RNView | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();

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
  const cityResolution = useMemo(() => resolveCanonicalCity(city), [city]);

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
        categoryId: publishCategoryId ?? 0,
        title,
        description,
        priceStr,
        city,
        imageCount: existingDraftImages.length + images.length,
      }),
    [publishCategoryId, title, description, priceStr, city, existingDraftImages.length, images.length]
  );

  const totalPhotoCount = existingDraftImages.length + images.length;

  const flowCompletionInput = useMemo(
    () => ({
      totalPhotoCount,
      title,
      description,
      priceStr,
      city,
      publishCategoryId,
      selectedParentCategoryId,
      marketplaceCategories,
    }),
    [
      totalPhotoCount,
      title,
      description,
      priceStr,
      city,
      publishCategoryId,
      selectedParentCategoryId,
      marketplaceCategories,
    ]
  );

  const flowBootKey = `${routeDraftId ?? ''}:${duplicateSourceId ?? ''}:${editingDraftId ?? 'new'}`;

  useEffect(() => {
    if (routeDraftId && draftLoadStatus !== 'ready') return;
    if (flowBootKeyRef.current === flowBootKey) return;
    flowBootKeyRef.current = flowBootKey;
    setFlowStep(resolveInitialSellFlowStep(flowCompletionInput));
  }, [flowBootKey, routeDraftId, draftLoadStatus, flowCompletionInput]);

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

  const applySellDetailsFocusScroll = useCallback(
    (anchor: RNView) => {
      scrollSellDetailsFieldIntoView({
        scrollRef: formScrollRef,
        anchor,
        currentScrollY: formScrollOffsetYRef.current,
        viewportHeight: windowHeight,
        fontScale,
      });
    },
    [fontScale, windowHeight]
  );

  const handleDetailsFieldFocus = useCallback(
    (_fieldId: SellDetailsKeyboardFieldId, anchor: RNView) => {
      if (!shouldRunSellDetailsAndroidFocusScroll(Platform.OS, flowStep)) return;
      lastSellDetailsFocusAnchorRef.current = anchor;
      applySellDetailsFocusScroll(anchor);
    },
    [applySellDetailsFocusScroll, flowStep]
  );

  const handleFormScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    formScrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      if (shouldRunSellDetailsAndroidFocusScroll(Platform.OS, flowStep)) {
        const anchor = lastSellDetailsFocusAnchorRef.current;
        if (anchor) {
          scheduleSellDetailsFieldScroll(() => applySellDetailsFocusScroll(anchor));
        }
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [applySellDetailsFocusScroll, flowStep]);

  useEffect(() => {
    if (!submitLoading) {
      setSlowPublishHint(false);
      return;
    }
    const timer = setTimeout(() => setSlowPublishHint(true), 8000);
    return () => clearTimeout(timer);
  }, [submitLoading]);

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

  const handleFlowBack = useCallback(() => {
    const previous = sellFlowPreviousStep(flowStep);
    if (previous) {
      setFlowStep(previous);
      return;
    }
    goBackOrHome();
  }, [flowStep, goBackOrHome]);

  const handleFlowContinue = useCallback(() => {
    const next = sellFlowNextStep(flowStep);
    if (next) setFlowStep(next);
  }, [flowStep]);

  const handleEditFlowStep = useCallback((stepId: SellFlowStepId) => {
    setFlowStep(stepId);
  }, []);

  const handleCityChipPress = useCallback((label: string) => {
    setCity(label);
    setSubmitError(null);
  }, []);

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
    setExistingDraftImages([]);
    setEditingDraftId(null);
    setDraftLoadStatus('idle');
    setDraftLoadError(null);
    setDraftSaveLoading(false);
    loadedRouteDraftIdRef.current = null;
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
    flowBootKeyRef.current = null;
    setFlowStep('photos');
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
      city: canonicalCityInputValue(city),
    });
  }, [city, priceStr, title]);

  const loadSellerPrequalProfile = useCallback(async () => {
    setPrequalStatus('loading');
    try {
      const session = await getSession();
      if (!session?.user) {
        setProfileAny(null);
        setPrequalStatus('ready');
        return;
      }
      const profileRes = await getCurrentProfile();
      const any = (profileRes.data ?? null) as unknown as Record<string, unknown> | null;
      setProfileAny(any);
      const shopRes = await getSellerShop(session.user.id);
      setPublishShopId(shopRes.data?.id ?? null);
      setPrequalStatus('ready');
    } catch {
      setProfileAny(null);
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
    setExistingDraftImages(toPendingCopiedDraftImages(draft.sourceImages ?? []));
    setEditingDraftId(null);
    setDraftLoadStatus('idle');
    setDraftLoadError(null);
    setPendingDuplicateCategoryId(draft.publishCategoryId);
    pendingDuplicateDynamicRef.current = draft.dynamicValues;
    setSubmitError(null);
  }, []);

  /** Préremplit depuis un payload DB (source de vérité = Supabase, pas la mémoire session). */
  const applyResumeDraftData = useCallback((draft: ListingResumeDraftData) => {
    const persisted = (draft.existingImages ?? []).filter(
      (img) => String(img.displayUrl ?? '').trim() !== '' && String(img.id ?? '').trim() !== ''
    );
    setEditingDraftId(draft.listingId);
    setPublishShopId(draft.shopId);
    setTitle(draft.title);
    setPriceStr(draft.price > 0 ? String(draft.price) : '');
    setCity(draft.city);
    setDescription(draft.description);
    // Photos persistées → existingDraftImages (pas besoin de base64 ; uri = signedUrl).
    // `images` = uniquement nouvelles photos locales picker.
    setImages([]);
    setExistingDraftImages(persisted);
    if (__DEV__) {
      console.log('[DRAFT_RESUME] setImages count', persisted.length);
    }
    setDuplicateSourceId(null);
    if (draft.publishCategoryId != null) {
      setPendingDuplicateCategoryId(draft.publishCategoryId);
    } else {
      setSelectedParentCategoryId(null);
      setSelectedChildCategoryId(null);
    }
    pendingDuplicateDynamicRef.current = draft.dynamicValues;
    setSubmitError(null);
    setDraftLoadStatus('ready');
    setDraftLoadError(null);
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
      if (routeDraftId) {
        // Reprise persistante : chargée depuis Supabase via useEffect(routeDraftId).
        return;
      }
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
    }, [applyDuplicateDraft, routeDraftId])
  );

  useEffect(() => {
    if (!routeDraftId) {
      loadedRouteDraftIdRef.current = null;
      return;
    }
    if (loadedRouteDraftIdRef.current === routeDraftId) {
      return;
    }

    let cancelled = false;
    setDraftLoadStatus('loading');
    setDraftLoadError(null);
    publishMemoryAppliedRef.current = true;

    (async () => {
      const result = await buildListingResumeDraft(routeDraftId);
      if (cancelled) return;
      if (!result.success) {
        setDraftLoadStatus('error');
        setDraftLoadError(result.error.message);
        setEditingDraftId(null);
        return;
      }
      loadedRouteDraftIdRef.current = routeDraftId;
      applyResumeDraftData(result.data);
      if (!listingCreationStartedRef.current) {
        listingCreationStartedRef.current = true;
        trackListingCreationStarted({
          creation_origin: 'draft_resume',
          city_selected: result.data.city,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeDraftId, applyResumeDraftData]);

  useEffect(() => {
    if (duplicateSourceId || editingDraftId || routeDraftId || publishMemoryAppliedRef.current) {
      return;
    }
    if (marketplaceCategories.length === 0) return;
    void applyPublishMemoryDefaults(marketplaceCategories);
  }, [
    duplicateSourceId,
    editingDraftId,
    routeDraftId,
    marketplaceCategories,
    applyPublishMemoryDefaults,
  ]);

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
      setDynamicAttributesPilotActive(true);
      setDynamicDefs([]);
      setDynamicLoading(true);
      const defs = await getEffectiveCategoryAttributeDefinitionsResolved(publishCategoryId);
      if (cancelled) return;
      const selectIds = defs.filter((d) => d.type === 'select').map((d) => d.definition_id);
      const optsMap = await getCategoryAttributeOptionsByDefinitionIds(selectIds);
      if (cancelled) return;
      setDynamicDefs(defs);
      setDynamicAttributesPilotActive(defs.length > 0);
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

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        "Autorisez l'accès aux photos pour ajouter des images à votre annonce."
      );
      return;
    }

    const remaining = Math.max(0, MAX_LISTING_IMAGES - totalPhotoCount);
    if (remaining <= 0) return;

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
    setImages((prev) =>
      [...prev, ...newImages].slice(0, Math.max(0, MAX_LISTING_IMAGES - existingDraftImages.length))
    );
    setSubmitError(null);
  };

  const removeImage = (index: number) => {
    if (index < existingDraftImages.length) {
      const target = existingDraftImages[index];
      setExistingDraftImages((prev) => prev.filter((_, i) => i !== index));
      if (isPersistedListingImageId(target?.id)) {
        void deleteListingImage(target.id).then((res) => {
          if (!res.success) {
            console.warn('[SellScreen] deleteListingImage', res.error);
          }
        });
      }
      return;
    }
    const pickedIndex = index - existingDraftImages.length;
    setImages((prev) => prev.filter((_, i) => i !== pickedIndex));
  };

  const uploadNewDraftImages = async (listingId: string) => {
    const uploadable = filterUploadableListingPhotos(images);
    const missingSourceCount = Math.max(0, images.length - uploadable.length);
    if (uploadable.length === 0) {
      return {
        uploadedCount: 0,
        failedCount: images.length,
        missingSourceCount: images.length,
        uploadStatus: 'failed' as const,
        uploadError: "Impossible de préparer les photos du brouillon.",
      };
    }
    const sortOrders = nextListingImageSortOrders(
      existingDraftImages.map((img) => img.sort_order),
      uploadable.length
    );
    const uploadResult = await uploadListingImages(
      listingId,
      uploadable.map((img) => ({
        base64: img.base64,
        uri: img.uri,
        mimeType: img.mimeType ?? null,
      })),
      { sortOrders }
    );
    return {
      uploadedCount: uploadResult.data.uploadedCount,
      failedCount: uploadResult.data.failedCount + missingSourceCount,
      missingSourceCount,
      uploadStatus: uploadResult.status,
      uploadError: uploadResult.error?.message ?? null,
    };
  };

  const persistPendingCopiedImages = async (listingId: string) => {
    const sources = pendingCopiedListingImageSources(existingDraftImages);
    if (sources.length === 0) {
      return { copiedCount: 0, failedCount: 0, status: 'ok' as const };
    }
    if (listingId === duplicateSourceId) {
      return { copiedCount: 0, failedCount: sources.length, status: 'failed' as const };
    }
    const result = await copyListingImagesToListing(listingId, sources);
    return {
      copiedCount: result.data.copiedCount,
      failedCount: result.data.failedCount,
      status: result.status,
    };
  };

  const rollbackNewListingIfNeeded = async (listingId: string, createdNewListing: boolean) => {
    if (!createdNewListing || !listingId || listingId === duplicateSourceId) return;
    await deleteListing(listingId);
  };

  /** Notice {@link DRAFT_REMINDERS_NOTICE} affichée en scroll (Détails/Vérification) ; ack via acknowledgeDraftRemindersNotice. */
  const handleSaveDraft = async () => {
    if (submitLoading || draftSaveLoading) return;
    setSubmitError(null);
    setDraftSaveLoading(true);

    try {
      const session = await getSession();
      if (!session?.user) {
        router.replace(buildAuthGateHref('sell'));
        return;
      }

      const cityValidationError = validateListingCity(city);
      if (cityValidationError) {
        setSubmitError(cityValidationError);
        return;
      }

      const parsedPrice = parseListingPrice(priceStr);
      const draftPayload = {
        title: title.trim(),
        price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.round(parsedPrice) : null,
        categoryId: publishCategoryId,
        city: canonicalCityInputValue(city),
        description: description.trim() || '',
        shopId: publishShopId,
      };

      const createdNewDraft = editingDraftId == null;
      const result = editingDraftId
        ? await updateListingDraft(editingDraftId, draftPayload)
        : await createListingDraft(draftPayload);

      if (result.error) {
        if (result.error.message === 'Non connecté') {
          router.replace(buildAuthGateHref('sell'));
          return;
        }
        setSubmitError(result.error.message);
        return;
      }

      const listingId = result.data?.id;
      if (!listingId) {
        setSubmitError("Impossible d'enregistrer le brouillon");
        return;
      }
      if (listingId === duplicateSourceId) {
        setSubmitError("Impossible de dupliquer : nouvel identifiant identique à la source.");
        return;
      }

      const copyMeta = await persistPendingCopiedImages(listingId);
      if (copyMeta.status !== 'ok') {
        await rollbackNewListingIfNeeded(listingId, createdNewDraft);
        setSubmitError(
          createdNewDraft
            ? "Impossible de copier les photos. Le brouillon n'a pas été enregistré."
            : LISTING_IMAGE_COPY_FAILED_MESSAGE
        );
        return;
      }

      setEditingDraftId(listingId);

      const dynamicRows = buildListingDynamicAttributeRows(
        dynamicDefs,
        dynamicValues,
        dynamicOptionsByDef
      );
      if (dynamicRows.length > 0) {
        const dynRes = await saveListingDynamicAttributeValues(listingId, dynamicRows);
        if (!dynRes.success) {
          console.warn('[SellScreen] saveListingDynamicAttributeValues draft', dynRes.error);
        }
      }

      if (images.length > 0) {
        const uploadMeta = await uploadNewDraftImages(listingId);
        const refreshedAfterUpload = await getListingForEdit(listingId);
        if (refreshedAfterUpload.data) {
          setExistingDraftImages(refreshedAfterUpload.data.imageItems ?? []);
        }

        if (uploadMeta.uploadStatus !== 'ok' || uploadMeta.failedCount > 0) {
          // Évite de ré-uploader les photos déjà persistées (doublons sort_order).
          if (uploadMeta.uploadedCount > 0) {
            setImages([]);
          }
          setSubmitError(
            uploadMeta.uploadError ??
              "Le brouillon est enregistré, mais certaines photos n'ont pas pu être sauvegardées."
          );
          return;
        }

        setImages([]);
      } else {
        const refreshed = await getListingForEdit(listingId);
        if (refreshed.data) {
          setExistingDraftImages(refreshed.data.imageItems ?? []);
        }
      }

      const ackResult = await acknowledgeDraftRemindersNotice();
      const ackOk =
        ackResult.error == null &&
        ackResult.data?.draft_reminders_notice_acknowledged_at != null;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        DRAFT_LISTING_SAVED_MESSAGE,
        ackOk ? DRAFT_LISTING_SAVED_SUBTITLE : DRAFT_LISTING_SAVED_ACK_FAILED_SUBTITLE,
        [
          { text: 'Continuer', style: 'cancel' },
          {
            text: 'Mes annonces',
            onPress: () => router.push('/account/listings' as Href),
          },
        ]
      );
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Impossible d'enregistrer le brouillon");
    } finally {
      setDraftSaveLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (publicationBusyRef.current) return;
    if (submitLoading || draftSaveLoading) return;
    setSubmitError(null);
    publicationBusyRef.current = true;
    publicationDraftIdRef.current = editingDraftId;
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
      if (totalPhotoCount === 0) {
        setSubmitError('Ajoutez au moins une photo pour publier.');
        return;
      }
      if (dynamicAttributesPilotActive && dynamicLoading) {
        setSubmitError('Chargement des caractéristiques… Réessayez dans un instant.');
        return;
      }
      const cityValidationError = validateListingCity(city);
      if (cityValidationError || city.trim().length < 2) {
        setSubmitError(cityValidationError ?? "Indiquez la ville pour publier (2 caractères minimum).");
        return;
      }

      const publishPayload = {
        title: title.trim(),
        price: Math.round(price),
        categoryId: publishCategoryId,
        city: canonicalCityInputValue(city),
        description: description.trim() || '',
        shopId: publishShopId,
      };

      const result = await publishListingSafely({
        listingId: editingDraftId,
        payload: publishPayload,
        onPrepared: (id) => { publicationDraftIdRef.current = id; setEditingDraftId(id); },
        persistAttributes: async (id) => {
          const empty = collectEmptyDynamicAttributeDefinitionIds(dynamicDefs, dynamicValues);
          if (empty.length) {
            const removed = await deleteListingDynamicAttributeValuesForDefinitions(id, empty);
            if (!removed.success) throw new Error(removed.error);
          }
          const rows = buildListingDynamicAttributeRows(dynamicDefs, dynamicValues, dynamicOptionsByDef);
          const saved = await saveListingDynamicAttributeValues(id, rows);
          if (!saved.success) throw new Error(saved.error);
        },
        persistPhotos: async (id) => {
          const copied = await persistPendingCopiedImages(id);
          if (copied.status !== 'ok') throw new Error("Brouillon conservé. Réessayez la copie des photos.");
          const uploadable = filterUploadableListingPhotos(images);
          if (uploadable.length !== images.length) throw new Error('Préparez à nouveau les photos manquantes.');
          if (uploadable.length) {
            // Stable slots make uncertain network responses and partial upload retries safe.
            const slots = publicationPhotoSlotsRef.current;
            const occupied = [...existingDraftImages.map((i) => i.sort_order ?? -1), ...slots.values()];
            let next = Math.max(-1, ...occupied) + 1;
            const orders = uploadable.map((photo) => {
              const key = `${id}:${photo.uri}`;
              if (!slots.has(key)) slots.set(key, next++);
              return slots.get(key)!;
            });
            const uploaded = await uploadListingImages(id, uploadable, { sortOrders: orders });
            if (uploaded.status !== 'ok') throw new Error(uploaded.error.message);
          }
          const refreshed = await getListingForEdit(id);
          if (refreshed.error) throw new Error(refreshed.error.message);
          setExistingDraftImages(refreshed.data.imageItems ?? []);
          setImages([]);
          publicationPhotoSlotsRef.current.clear();
        },
      });
      if (!result.alreadyPublished) {
        if (duplicateSourceId) trackListingDuplicatePublished({ source_listing_id: duplicateSourceId, listing_id: result.id });
        trackListingCreationCompleted({
          listing_id: result.id, has_photos: true,
          category: resolveMarketplaceCategoryLabel(marketplaceCategories, publishCategoryId),
          city: canonicalCityInputValue(city),
        });
      }
      void saveListingPublishMemory({ city: canonicalCityInputValue(city), parentCategoryId: selectedParentCategoryId,
        childCategoryId: selectedChildCategoryId, publishCategoryId, dynamicValues });
      setEditingDraftId(null);
      markPublishSuccess(result.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Impossible de confirmer la publication";
      setSubmitError(publicationDraftIdRef.current
        ? `${message} Retrouvez votre annonce dans Mes annonces pour reprendre ou vérifier sa publication.`
        : message);
    } finally {
      publicationBusyRef.current = false;
      setSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (publishState.status !== 'success') return;
    if (postPublishViewedRef.current === publishState.listingId) return;
    postPublishViewedRef.current = publishState.listingId;
    trackPostPublishViewed({ listing_id: publishState.listingId });
  }, [publishState]);

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
        <SellPublishSuccess
          onViewListing={handleViewPublishedListing}
          onShareWhatsApp={() => void handleSharePublishedWhatsApp()}
          onPublishAnother={resetForm}
          sharingWhatsApp={sharingWhatsApp}
        />
      </Screen>
    );
  }

  const sellerNamePrequal = getSellerProfileDisplayName(profileAny);
  const sellerPhonePrequal = getSellerProfilePhone(profileAny);
  const hasProfileSellerName = !!sellerNamePrequal.trim();
  const hasPhone = !!sellerPhonePrequal.trim();
  const isAuthed = prequalStatus === 'ready' ? profileAny != null : false;

  const flowBackLabel =
    flowStep === 'photos' ? 'Retour ou accueil' : `Retour à l'étape précédente`;
  const categoryLabelForReview =
    publishCategoryId != null
      ? resolveMarketplaceCategoryLabel(marketplaceCategories, publishCategoryId) ?? '—'
      : '—';
  const cityRecognizedLabel =
    city.trim() && cityResolution.kind === 'canonical'
      ? canonicalCityLabel(cityResolution.code)
      : null;
  const showStickyFooter = !shouldHideSellStickyFooter(keyboardVisible, flowStep);

  if (prequalStatus === 'loading' || (routeDraftId && draftLoadStatus === 'loading')) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (routeDraftId && draftLoadStatus === 'error') {
    return (
      <Screen>
        <View style={styles.successBlock}>
          <Text style={styles.partialTitle}>Brouillon introuvable</Text>
          <Text style={styles.successSubtitle}>
            {draftLoadError?.trim() ||
              'Impossible de reprendre ce brouillon. Vérifiez votre connexion ou réessayez depuis Mes annonces.'}
          </Text>
          <View style={styles.successActions}>
            <Button size="lg" onPress={() => router.push('/account/listings' as Href)}>
              Mes annonces
            </Button>
            <Button variant="ghost" size="lg" onPress={goBackOrHome}>
              Retour
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} safe={false} noPadding>
      <SellFlowHeader
        activeStepId={flowStep}
        onBackPress={handleFlowBack}
        backAccessibilityLabel={flowBackLabel}
      />
      <KeyboardSafeView style={styles.formLayout}>
        <ScrollView
          ref={formScrollRef}
          style={styles.formScroll}
          contentContainerStyle={[
            styles.formScrollContent,
            flowStep === 'photos' ? styles.formScrollContentPhotosStep : null,
            flowStep === 'details' ? styles.formScrollContentDetailsStep : null,
            flowStep === 'review' ? styles.formScrollContentReviewStep : null,
            keyboardVisible ? styles.formScrollContentKeyboardOpen : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleFormScroll}
        >
          <View style={styles.content}>
            {duplicateSourceId ? (
              <View style={styles.duplicateBanner}>
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
                <View style={styles.duplicateBannerTextSlot}>
                  <Text style={styles.duplicateBannerTitle}>Copie d’une annonce</Text>
                  <Text style={styles.duplicateBannerText}>
                    Les informations et photos sont préremplies. Modifiez-les avant d’enregistrer ou de
                    publier — l’annonce d’origine n’est pas modifiée.
                  </Text>
                </View>
              </View>
            ) : null}

            {flowStep === 'photos' ? (
              <SellPrequalBanner
                hasSellerName={hasProfileSellerName}
                hasPhone={hasPhone}
                isAuthed={isAuthed}
                onCompleteProfile={() => router.push(buildAccountProfileHref('/sell'))}
              />
            ) : null}

            {flowStep === 'photos' ? (
              <SellStepPhotos
                totalPhotoCount={totalPhotoCount}
                existingDraftImages={existingDraftImages}
                pickedImages={images}
                duplicateSourceId={duplicateSourceId}
                editingDraftId={editingDraftId}
                onPickImages={() => void pickImages()}
                onRemoveImage={removeImage}
              />
            ) : null}

            {flowStep === 'details' ? (
              <SellStepDetails
                title={title}
                description={description}
                priceStr={priceStr}
                city={city}
                cityRecognizedLabel={cityRecognizedLabel}
                sellGuidance={sellGuidance}
                showTitleError={showTitleError}
                titleError={titleError}
                showDescriptionError={showDescriptionError}
                descriptionError={descriptionError}
                showPriceError={showPriceError}
                priceError={priceError}
                showCityError={showCityError}
                cityError={cityError}
                onTitleChange={handleTitleChange}
                onDescriptionChange={handleDescriptionChange}
                onPriceChange={handlePriceChange}
                onCityChange={handleCityChange}
                onCityChipPress={handleCityChipPress}
                parentCategories={parentCategories}
                subcategoryOptions={subcategoryOptions}
                selectedParentCategoryId={selectedParentCategoryId}
                selectedChildCategoryId={selectedChildCategoryId}
                onSelectParent={selectParentCategory}
                onSelectChild={selectChildCategory}
                categoriesLoading={categoriesLoading}
                categoriesError={categoriesError ?? null}
                dynamicAttributesPilotActive={dynamicAttributesPilotActive}
                dynamicDefs={dynamicDefs}
                dynamicOptionsByDef={dynamicOptionsByDef}
                dynamicLoading={dynamicLoading}
                dynamicValues={dynamicValues}
                onDynamicChange={handleDynamicChange}
                onDetailsFieldFocus={
                  Platform.OS === 'android' ? handleDetailsFieldFocus : undefined
                }
              />
            ) : null}

            {flowStep === 'review' ? (
              <SellStepReview
                totalPhotoCount={totalPhotoCount}
                existingDraftImages={existingDraftImages}
                pickedImages={images}
                title={title}
                description={description}
                priceStr={priceStr}
                city={city}
                categoryLabel={categoryLabelForReview}
                listingQuality={listingQuality}
                submitError={submitError}
                slowPublishHint={slowPublishHint}
                onEditStep={handleEditFlowStep}
                dynamicAttributesPilotActive={dynamicAttributesPilotActive}
                dynamicDefs={dynamicDefs}
                dynamicValues={dynamicValues}
                dynamicOptionsByDef={dynamicOptionsByDef}
              />
            ) : null}
          </View>
        </ScrollView>

        {showStickyFooter ? (
          <View style={styles.stickyFooter}>
            <View
              style={[
                styles.content,
                styles.stickyFooterActions,
                { paddingBottom: spacing.sm + insets.bottom },
              ]}
            >
              {flowStep === 'photos' || flowStep === 'details' ? (
                <Button size="lg" onPress={handleFlowContinue} style={styles.flowCta}>
                  Continuer
                </Button>
              ) : null}

              {flowStep === 'details' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={DRAFT_LISTING_SAVE_ACTION}
                  onPress={() => void handleSaveDraft()}
                  disabled={submitLoading || draftSaveLoading}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  style={({ pressed }) => [
                    styles.detailsDraftLink,
                    pressed && !submitLoading && !draftSaveLoading ? styles.detailsDraftLinkPressed : null,
                    submitLoading || draftSaveLoading ? styles.detailsDraftLinkDisabled : null,
                  ]}
                >
                  <Text style={styles.detailsDraftLinkText}>
                    {draftSaveLoading ? 'Enregistrement…' : DRAFT_LISTING_SAVE_ACTION}
                  </Text>
                </Pressable>
              ) : null}

              {flowStep === 'review' ? (
                <>
                  <Button
                    size="lg"
                    onPress={handleSubmit}
                    loading={submitLoading}
                    disabled={
                      submitLoading ||
                      draftSaveLoading ||
                      (dynamicAttributesPilotActive && dynamicLoading)
                    }
                    leftIcon={
                      submitLoading ? undefined : (
                        <Ionicons name="paper-plane" size={16} color={colors.surface} />
                      )
                    }
                    style={styles.flowCta}
                  >
                    {"Publier l'annonce"}
                  </Button>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={DRAFT_LISTING_SAVE_ACTION}
                    onPress={() => void handleSaveDraft()}
                    disabled={submitLoading || draftSaveLoading}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                    style={({ pressed }) => [
                      styles.detailsDraftLink,
                      pressed && !submitLoading && !draftSaveLoading ? styles.detailsDraftLinkPressed : null,
                      submitLoading || draftSaveLoading ? styles.detailsDraftLinkDisabled : null,
                    ]}
                  >
                    <Text style={styles.detailsDraftLinkText}>
                      {draftSaveLoading ? 'Enregistrement…' : DRAFT_LISTING_SAVE_ACTION}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {(flowStep === 'photos' || flowStep === 'details') && !isSellerProfileComplete(profileAny) ? (
                <Text style={styles.footerHint}>
                  Vous pouvez préparer l&apos;annonce maintenant. Nom, pseudo et téléphone seront
                  obligatoires pour publier.
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Annuler"
                onPress={goBackOrHome}
                disabled={submitLoading || draftSaveLoading}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                style={({ pressed }) => [
                  styles.footerCancelPressable,
                  pressed && !submitLoading && !draftSaveLoading ? styles.footerCancelPressed : null,
                  submitLoading || draftSaveLoading ? styles.footerCancelDisabled : null,
                ]}
              >
                <Text style={styles.footerCancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
  formScrollContentPhotosStep: {
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  formScrollContentDetailsStep: {
    paddingBottom: spacing['2xl'] + spacing.base,
  },
  formScrollContentReviewStep: {
    paddingBottom: spacing['3xl'] + spacing['2xl'],
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
    gap: spacing.sm,
  },
  flowCta: {
    width: '100%',
  },
  footerHint: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  publishCta: {
    width: '100%',
    minHeight: 44,
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
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.base,
  },
  successBlock: {
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
    paddingHorizontal: spacing.screenHorizontal,
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
  draftRemindersNotice: {
    ...typography.xs,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  detailsDraftLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  detailsDraftLinkPressed: {
    opacity: 0.65,
  },
  detailsDraftLinkDisabled: {
    opacity: 0.4,
  },
  detailsDraftLinkText: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary + '66',
  },
});
