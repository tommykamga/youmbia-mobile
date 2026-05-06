/**
 * Search tab – Sprint 2.2.
 * Complete search: query input, loading/error/empty/results, ListingCard, tap → listing detail.
 * Data: searchListings(query) → title/city/description ilike; suggestions dans la feuille de recherche.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Keyboard,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState, Button, HomeBrandHeader, HomeCategoryStrip } from '@/components';
import { ListingCard, ListingFeed } from '@/features/listings';
import {
  HomeMarketplaceFeedHeader,
  useAuthStateForHome,
} from '@/features/home/HomeMarketplaceFeedHeader';
import { searchListings } from '@/services/listings';
import { getSearchSuggestions } from '@/services/searchSuggestions';
import { getFavoriteIds as getFavIds } from '@/services/favorites';
import { sortListings, type SortOption } from '@/utils/sortListings';
import {
  getSavedSearches,
  removeSavedSearch,
  saveSearch,
  type SavedSearch,
} from '@/services/savedSearches';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import { formatPrice } from '@/lib/format';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { useResponsiveLayout, getScrollBottomReserveForTabBar } from '@/lib/responsiveLayout';

const SUGGESTIONS_DEBOUNCE_MS = 300;
/** Ne pas relancer `runSearch` si les params de navigation sont identiques sous ce délai (anti double effet / focus). */
const SEARCH_NAV_PARAMS_RUN_COOLDOWN_MS = 2 * 60 * 1000;
/** Première page recherche — le reste au bouton « Voir plus » (egress). */
const SEARCH_INITIAL_PAGE_SIZE = 6;
const HOME_LISTING_FEED_NETWORK_COOLDOWN_MS = 2 * 60 * 1000;
const HOME_FEED_PAGE_SIZE = 6;
/** Apostrophe typographique (’). Constante JS : évite le rendu littéral « \\u2019 » si mis en JSX texte brut. */
const LABEL_VOIR_PLUS_ANNONCES = 'Voir plus d\u2019annonces';

type SearchPage1SessionCacheEntry = {
  empty: boolean;
  data: PublicListing[];
  total: number;
};

/** Cache mémoire session : première page par clé query + filtres appliqués (hors tri UI). */
const searchSessionPage1Cache = new Map<string, SearchPage1SessionCacheEntry>();

function buildSearchPage1SessionKey(parts: {
  q: string;
  categoryId: number | null;
  city: string | null;
  min: number | null;
  max: number | null;
}): string {
  return JSON.stringify(parts);
}
const PRICE_INPUT_PATTERN = /^\d+$/;
const CATEGORY_OPTIONS = ['Véhicules', 'Mode', 'Maison', 'Électronique', 'Sport', 'Loisirs', 'Autre'] as const;

const SEARCH_FIELD_PLACEHOLDER = 'Rechercher';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; query: string }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      data: PublicListing[];
      query: string;
      total: number;
      page: number;
      hasMore: boolean;
    };

type AppliedPriceFilters = {
  min: number | null;
  max: number | null;
};

type AppliedSearchFilters = {
  category: string | null;
  categoryId: number | null;
  city: string | null;
};

function normalizeFilterText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeMatchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getCategoryIdByLabel(label: string | null): number | null {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  const found = LISTING_CATEGORIES.find(c => c.label.toLowerCase() === normalized);
  return found ? found.id : null;
}

function parsePriceValue(value: string, invalidMessage: string): { value: number | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, error: null };
  if (!PRICE_INPUT_PATTERN.test(trimmed)) {
    return { value: null, error: invalidMessage };
  }
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: invalidMessage };
  }
  return { value: parsed, error: null };
}

function validatePriceFilters(priceMin: string, priceMax: string): {
  min: number | null;
  max: number | null;
  error: string | null;
} {
  const minResult = parsePriceValue(priceMin, 'Prix minimum invalide');
  if (minResult.error) {
    return { min: null, max: null, error: minResult.error };
  }
  const maxResult = parsePriceValue(priceMax, 'Prix maximum invalide');
  if (maxResult.error) {
    return { min: null, max: null, error: maxResult.error };
  }
  if (minResult.value != null && maxResult.value != null && minResult.value > maxResult.value) {
    return { min: null, max: null, error: 'La fourchette de prix est incohérente' };
  }
  return { min: minResult.value, max: maxResult.value, error: null };
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string;
    priceMin?: string;
    priceMax?: string;
    category?: string;
    categoryLabel?: string;
    categoryId?: string;
    city?: string;
    from?: string;
  }>();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [appliedPriceFilters, setAppliedPriceFilters] = useState<AppliedPriceFilters>({ min: null, max: null });
  const [appliedSearchFilters, setAppliedSearchFilters] = useState<AppliedSearchFilters>({
    category: null,
    categoryId: null,
    city: null,
  });
  const [priceFilterError, setPriceFilterError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const lastFavoritesFetchAtRef = useRef<number>(0);
  const FAVORITES_FETCH_TTL_MS = 120_000;
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchFeedback, setSavedSearchFeedback] = useState<string | null>(null);
  const [overlaySuggestions, setOverlaySuggestions] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [overlayDraft, setOverlayDraft] = useState('');
  const [savedOpen, setSavedOpen] = useState(false);
  const mainSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDisplayedPage1KeyRef = useRef<string | null>(null);
  const searchSeqRef = useRef(0);
  const runSearchRef = useRef<(q: string, filters?: Partial<AppliedSearchFilters & AppliedPriceFilters>) => Promise<void>>(
    async () => {}
  );
  const resultsListRef = useRef<FlatList<PublicListing> | null>(null);
  const homeFeedListRef = useRef<any>(null);
  const lastResultsScrollOffsetRef = useRef(0);
  const savedSearchFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavParamsSearchEffectKeyRef = useRef<string>('');
  const lastNavParamsSearchEffectAtRef = useRef(0);
  const overlayInputRef = useRef<TextInput | null>(null);
  const overlaySuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Clic « Voir plus d’annonces » sur le feed accueil : lancer une recherche sans mot-clé ni injection UI. */
  const browseFromHomeFooterRef = useRef(false);

  const clearPendingMainSearchDebounce = useCallback(() => {
    if (mainSearchDebounceRef.current) {
      clearTimeout(mainSearchDebounceRef.current);
      mainSearchDebounceRef.current = null;
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    const now = Date.now();
    if (now - lastFavoritesFetchAtRef.current < FAVORITES_FETCH_TTL_MS) return;
    lastFavoritesFetchAtRef.current = now;
    const res = await getFavIds();
    if (res.data) setFavoriteIds(new Set(res.data));
  }, []);

  const loadSavedSearches = useCallback(() => {
    setSavedSearches(getSavedSearches());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      loadSavedSearches();
    }, [loadFavorites, loadSavedSearches])
  );

  /** Suggestions dans la feuille de recherche uniquement (pas de recherche auto sur la saisie principale). */
  useEffect(() => {
    if (!searchOverlayOpen) {
      if (overlaySuggestDebounceRef.current) {
        clearTimeout(overlaySuggestDebounceRef.current);
        overlaySuggestDebounceRef.current = null;
      }
      setOverlaySuggestions([]);
      return;
    }
    if (overlaySuggestDebounceRef.current) {
      clearTimeout(overlaySuggestDebounceRef.current);
      overlaySuggestDebounceRef.current = null;
    }
    const trimmed = overlayDraft.trim();
    if (trimmed.length < 2) {
      setOverlaySuggestions([]);
      return;
    }
    overlaySuggestDebounceRef.current = setTimeout(() => {
      overlaySuggestDebounceRef.current = null;
      getSearchSuggestions(trimmed).then((result) => {
        if (result.error) {
          setOverlaySuggestions([]);
          return;
        }
        setOverlaySuggestions(result.data ?? []);
      });
    }, SUGGESTIONS_DEBOUNCE_MS);
    return () => {
      if (overlaySuggestDebounceRef.current) {
        clearTimeout(overlaySuggestDebounceRef.current);
        overlaySuggestDebounceRef.current = null;
      }
    };
  }, [overlayDraft, searchOverlayOpen]);

  const runSearch = useCallback(async (q: string, filters?: Partial<AppliedSearchFilters & AppliedPriceFilters>) => {
    const trimmed = q.trim();
    const browseFromHome = browseFromHomeFooterRef.current;
    if (browseFromHome) {
      browseFromHomeFooterRef.current = false;
    }

    const searchCategoryId = filters?.categoryId !== undefined ? filters.categoryId : appliedSearchFilters.categoryId;
    const searchCity = filters?.city !== undefined ? filters.city : appliedSearchFilters.city;
    const searchMinPrice = filters?.min !== undefined ? filters.min : appliedPriceFilters.min;
    const searchMaxPrice = filters?.max !== undefined ? filters.max : appliedPriceFilters.max;

    const hasSearchIntent =
      browseFromHome ||
      trimmed.length >= 2 ||
      searchCategoryId != null ||
      (searchCity != null && String(searchCity).trim() !== '') ||
      searchMinPrice != null ||
      searchMaxPrice != null;

    if (!hasSearchIntent) {
      searchSeqRef.current += 1;
      setSubmittedQuery('');
      setState({ status: 'idle' });
      lastDisplayedPage1KeyRef.current = null;
      return;
    }

    const page1Key = buildSearchPage1SessionKey({
      q: trimmed,
      categoryId: searchCategoryId,
      city: searchCity,
      min: searchMinPrice,
      max: searchMaxPrice,
    });

    if (page1Key === lastDisplayedPage1KeyRef.current) {
      setSubmittedQuery(trimmed);
      return;
    }

    const cached = searchSessionPage1Cache.get(page1Key);
    if (cached) {
      setSubmittedQuery(trimmed);
      lastDisplayedPage1KeyRef.current = page1Key;
      if (cached.empty) {
        setState({ status: 'empty', query: trimmed });
      } else {
        setState({
          status: 'success',
          data: cached.data.slice(),
          query: trimmed,
          total: cached.total,
          page: 1,
          hasMore: cached.data.length === SEARCH_INITIAL_PAGE_SIZE,
        });
      }
      return;
    }

    const seq = ++searchSeqRef.current;
    setSubmittedQuery(trimmed);
    setState({ status: 'loading' });

    const result = await searchListings({
      query: trimmed,
      categoryId: searchCategoryId,
      city: searchCity,
      minPrice: searchMinPrice,
      maxPrice: searchMaxPrice,
      sortBy: sortBy,
      page: 1,
      pageSize: SEARCH_INITIAL_PAGE_SIZE,
    });

    if (seq !== searchSeqRef.current) return;

    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    const total = result.total ?? 0;
    const empty = list.length === 0;
    searchSessionPage1Cache.set(page1Key, {
      empty,
      data: list.slice(),
      total,
    });
    lastDisplayedPage1KeyRef.current = page1Key;

    if (seq !== searchSeqRef.current) return;

    setState(
      empty
        ? { status: 'empty', query: trimmed }
        : {
            status: 'success',
            data: list,
            query: trimmed,
            total,
            page: 1,
            hasMore: list.length === SEARCH_INITIAL_PAGE_SIZE,
          }
    );
  }, [appliedSearchFilters, appliedPriceFilters, sortBy]);

  runSearchRef.current = runSearch;

  /** When navigating with query params, pre-fill and run search once. */
  useEffect(() => {
    clearPendingMainSearchDebounce();
    const nextQ = typeof params.q === 'string' ? params.q.trim() : '';
    const nextMin = typeof params.priceMin === 'string' ? params.priceMin.trim() : '';
    const nextMax = typeof params.priceMax === 'string' ? params.priceMax.trim() : '';
    const nextCategory = typeof params.categoryLabel === 'string'
      ? params.categoryLabel.trim()
      : (typeof params.category === 'string' ? params.category.trim() : '');
    const nextCity = typeof params.city === 'string' ? params.city.trim() : '';
    const nextCategoryIdStr = typeof params.categoryId === 'string' ? params.categoryId.trim() : '';
    const nextCategoryId = nextCategoryIdStr ? parseInt(nextCategoryIdStr, 10) : getCategoryIdByLabel(nextCategory);

    setQuery(nextQ);
    setPriceMin(nextMin);
    setPriceMax(nextMax);
    setCategory(nextCategory);
    setCity(nextCity);
    setCategoryId(nextCategoryId);

    const validation = validatePriceFilters(nextMin, nextMax);
    const filters: AppliedSearchFilters & AppliedPriceFilters = {
      category: normalizeFilterText(nextCategory),
      categoryId: nextCategoryId,
      city: normalizeFilterText(nextCity),
      min: validation.error ? null : validation.min,
      max: validation.error ? null : validation.max,
    };

    setAppliedPriceFilters({ min: filters.min, max: filters.max });
    setAppliedSearchFilters({
      category: filters.category,
      categoryId: filters.categoryId,
      city: filters.city,
    });
    setPriceFilterError(validation.error);

    const navParamsKey = JSON.stringify({
      q: params.q ?? '',
      priceMin: params.priceMin ?? '',
      priceMax: params.priceMax ?? '',
      category: params.category ?? '',
      categoryLabel: params.categoryLabel ?? '',
      categoryId: params.categoryId ?? '',
      city: params.city ?? '',
      appliedMin: validation.error ? 'err' : String(validation.min ?? ''),
      appliedMax: validation.error ? 'err' : String(validation.max ?? ''),
    });
    const now = Date.now();
    const skipDuplicateRunSearch =
      navParamsKey === lastNavParamsSearchEffectKeyRef.current &&
      now - lastNavParamsSearchEffectAtRef.current < SEARCH_NAV_PARAMS_RUN_COOLDOWN_MS;
    if (!skipDuplicateRunSearch) {
      lastNavParamsSearchEffectKeyRef.current = navParamsKey;
      lastNavParamsSearchEffectAtRef.current = now;
      void runSearchRef.current(nextQ, filters);
    }
  }, [
    params.q,
    params.priceMin,
    params.priceMax,
    params.category,
    params.categoryLabel,
    params.categoryId,
    params.city,
    clearPendingMainSearchDebounce,
  ]);

  const loadMoreSearchResults = useCallback(async () => {
    if (state.status !== 'success' || !state.hasMore || loadingMoreSearch) return;
    setLoadingMoreSearch(true);
    const nextPage = state.page + 1;
    try {
      const result = await searchListings({
        query: state.query,
        categoryId: appliedSearchFilters.categoryId,
        city: appliedSearchFilters.city,
        minPrice: appliedPriceFilters.min,
        maxPrice: appliedPriceFilters.max,
        sortBy,
        page: nextPage,
        pageSize: SEARCH_INITIAL_PAGE_SIZE,
      });
      if (result.error) {
        return;
      }
      const batch = result.data ?? [];
      const nextTotal = result.total ?? 0;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        const seen = new Set(prev.data.map((i) => i.id));
        const added = batch.filter((i) => !seen.has(i.id));
        return {
          status: 'success',
          data: [...prev.data, ...added],
          query: prev.query,
          total: nextTotal > 0 ? nextTotal : prev.total,
          page: nextPage,
          hasMore: batch.length === SEARCH_INITIAL_PAGE_SIZE,
        };
      });
    } finally {
      setLoadingMoreSearch(false);
    }
  }, [
    state,
    loadingMoreSearch,
    appliedSearchFilters.categoryId,
    appliedSearchFilters.city,
    appliedPriceFilters.min,
    appliedPriceFilters.max,
    sortBy,
  ]);

  /** Scroll results list to top when a new search returns success (Sprint 3.2). */
  const scrollResetKey = state.status === 'success' ? state.query : '';
  useEffect(() => {
    if (state.status === 'success') {
      resultsListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [state.status, scrollResetKey]);

  const scrollActiveListToTop = useCallback((): boolean => {
    const canScrollResults = resultsListRef.current != null && state.status === 'success';
    const list = canScrollResults ? resultsListRef.current : homeFeedListRef.current;
    if (!list || typeof (list as any).scrollToOffset !== 'function') return false;

    const isLikelyAlreadyTop = canScrollResults && lastResultsScrollOffsetRef.current <= 4;
    if (isLikelyAlreadyTop) return false;

    try {
      (list as any).scrollToOffset({ offset: 0, animated: true });
      return true;
    } catch {
      return false;
    }
  }, [state.status]);

  const openSearchOverlay = useCallback(() => {
    Keyboard.dismiss();
    setOverlayDraft(query);
    const didScroll = scrollActiveListToTop();
    // Avoid "double animation": let the scroll start before sliding the sheet.
    const delayMs = didScroll ? 180 : 0;
    if (delayMs > 0) {
      setTimeout(() => setSearchOverlayOpen(true), delayMs);
    } else {
      setSearchOverlayOpen(true);
    }
  }, [query, scrollActiveListToTop]);

  const closeSearchOverlay = useCallback(() => {
    Keyboard.dismiss();
    setSearchOverlayOpen(false);
    setOverlaySuggestions([]);
  }, []);

  useEffect(() => {
    if (!searchOverlayOpen) return;
    const t = setTimeout(() => overlayInputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [searchOverlayOpen]);

  /** Validation mot-clé depuis la feuille de recherche (submit clavier ou suggestion). */
  const submitKeywordSearch = useCallback(
    (explicit?: string) => {
      const q = (explicit !== undefined ? explicit : overlayDraft).trim();
      clearPendingMainSearchDebounce();
      Keyboard.dismiss();
      setOverlaySuggestions([]);
      setQuery(q);
      runSearch(q);
      setSearchOverlayOpen(false);
    },
    [overlayDraft, runSearch, clearPendingMainSearchDebounce]
  );

  const handleResetSearch = useCallback(() => {
    clearPendingMainSearchDebounce();
    lastDisplayedPage1KeyRef.current = null;
    setQuery('');
    setSubmittedQuery('');
    setOverlayDraft('');
    setOverlaySuggestions([]);
    setPriceMin('');
    setPriceMax('');
    setCategory('');
    setCity('');
    setCategoryId(null);
    setAppliedPriceFilters({ min: null, max: null });
    setAppliedSearchFilters({ category: null, categoryId: null, city: null });
    setPriceFilterError(null);
    runSearch('');
  }, [runSearch, clearPendingMainSearchDebounce]);

  const handleOverlaySuggestionPress = useCallback(
    (suggestion: string) => {
      submitKeywordSearch(suggestion);
    },
    [submitKeywordSearch]
  );

  const handleSaveSearch = useCallback(() => {
    const result = saveSearch({
      query: submittedQuery,
      priceMin: appliedPriceFilters.min,
      priceMax: appliedPriceFilters.max,
      category: appliedSearchFilters.category,
      categoryId: appliedSearchFilters.categoryId,
      city: appliedSearchFilters.city,
    });
    loadSavedSearches();
    if (savedSearchFeedbackTimeoutRef.current) {
      clearTimeout(savedSearchFeedbackTimeoutRef.current);
      savedSearchFeedbackTimeoutRef.current = null;
    }
    if (!result.ok) {
      setSavedSearchFeedback(result.error.message);
    } else if (result.status === 'exists') {
      setSavedSearchFeedback('Cette recherche existe déjà');
    } else {
      setSavedSearchFeedback('Recherche enregistrée');
    }
    savedSearchFeedbackTimeoutRef.current = setTimeout(() => setSavedSearchFeedback(null), 2000);
  }, [submittedQuery, appliedPriceFilters, appliedSearchFilters, loadSavedSearches]);

  useEffect(() => {
    return () => {
      if (savedSearchFeedbackTimeoutRef.current) {
        clearTimeout(savedSearchFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const handleSavedSearchPress = useCallback(
    (item: SavedSearch) => {
      clearPendingMainSearchDebounce();
      setQuery(item.query);
      setSubmittedQuery(item.query);
      setPriceMin(item.priceMin != null ? String(item.priceMin) : '');
      setPriceMax(item.priceMax != null ? String(item.priceMax) : '');
      setCategory(item.category ?? '');
      setCity(item.city ?? '');
      setCategoryId(item.categoryId ?? null);
      setAppliedPriceFilters({ min: item.priceMin ?? null, max: item.priceMax ?? null });
      setAppliedSearchFilters({ 
        category: item.category ?? null, 
        categoryId: item.categoryId ?? null, 
        city: item.city ?? null 
      });
      setPriceFilterError(null);
      setOverlaySuggestions([]);
      runSearch(item.query, {
        categoryId: item.categoryId ?? null,
        city: item.city ?? null,
        min: item.priceMin ?? null,
        max: item.priceMax ?? null,
      });
    },
    [runSearch, clearPendingMainSearchDebounce]
  );

  const handleRemoveSavedSearch = useCallback(
    (id: string) => {
      const ok = removeSavedSearch(id);
      if (!ok) {
        setSavedSearchFeedback('Impossible de supprimer la recherche');
        return;
      }
      loadSavedSearches();
    },
    [loadSavedSearches]
  );

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard listing={item} />
    ),
    []
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const successSearchData = state.status === 'success' ? state.data : null;
  const sortedListings = useMemo(() => {
    const list = successSearchData ?? [];
    return sortListings(list, sortBy);
  }, [successSearchData, sortBy]);

  const availableCities = useMemo(() => {
    const values = new Set<string>();
    sortedListings.forEach((item) => {
      const normalizedCity = normalizeFilterText(item.city);
      if (normalizedCity) values.add(normalizedCity);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [sortedListings]);

  const hasAppliedPriceFilter = appliedPriceFilters.min != null || appliedPriceFilters.max != null;
  const hasAppliedSearchFilter =
    appliedSearchFilters.category != null || appliedSearchFilters.city != null;
  const hasDraftPriceChanges = useMemo(() => {
    const appliedMin = appliedPriceFilters.min != null ? String(appliedPriceFilters.min) : '';
    const appliedMax = appliedPriceFilters.max != null ? String(appliedPriceFilters.max) : '';
    return priceMin.trim() !== appliedMin || priceMax.trim() !== appliedMax;
  }, [priceMin, priceMax, appliedPriceFilters]);
  const hasDraftSearchChanges = useMemo(() => {
    return (
      category.trim() !== (appliedSearchFilters.category ?? '') ||
      city.trim() !== (appliedSearchFilters.city ?? '') ||
      categoryId !== appliedSearchFilters.categoryId
    );
  }, [category, city, categoryId, appliedSearchFilters]);

  const activeFilterSummary = useMemo(() => {
    const chips: string[] = [];
    if (appliedSearchFilters.category) {
      chips.push(`Catégorie ${appliedSearchFilters.category}`);
    }
    if (appliedSearchFilters.city) {
      chips.push(`Ville ${appliedSearchFilters.city}`);
    }
    if (appliedPriceFilters.min != null) {
      chips.push(`Min ${formatPrice(appliedPriceFilters.min)}`);
    }
    if (appliedPriceFilters.max != null) {
      chips.push(`Max ${formatPrice(appliedPriceFilters.max)}`);
    }
    return chips;
  }, [appliedPriceFilters, appliedSearchFilters]);

  /** Chips sous « Résultats de recherche » : mot-clé, catégorie, agrégat filtres (ville / prix). */
  const resultsChipsDisplay = useMemo(() => {
    const chips: string[] = [];
    const kw = submittedQuery.trim();
    if (kw.length >= 2) {
      chips.push(kw.length > 28 ? `« ${kw.slice(0, 25)}… »` : `« ${kw} »`);
    }
    if (appliedSearchFilters.category) {
      chips.push(`Catégorie ${appliedSearchFilters.category}`);
    }
    let filterExtras = 0;
    if (appliedSearchFilters.city) filterExtras += 1;
    if (appliedPriceFilters.min != null) filterExtras += 1;
    if (appliedPriceFilters.max != null) filterExtras += 1;
    if (filterExtras > 0) {
      chips.push(`Filtres (${filterExtras})`);
    }
    return chips;
  }, [submittedQuery, appliedSearchFilters.category, appliedSearchFilters.city, appliedPriceFilters]);

  const filteredListings = useMemo(() => {
    // Le filtrage est maintenant fait côté serveur (Supabase) via searchListings.
    // Cette variable reste pour ne pas casser l'UI, mais elle contient juste sortedListings.
    return sortedListings;
  }, [sortedListings]);

  const handleApplyAllFilters = useCallback(() => {
    const validation = validatePriceFilters(priceMin, priceMax);
    if (validation.error) {
      setPriceFilterError(validation.error);
      return;
    }
    clearPendingMainSearchDebounce();
    setAppliedPriceFilters({ min: validation.min, max: validation.max });
    const newAppliedSearchFilters = {
      category: normalizeFilterText(category),
      categoryId: categoryId,
      city: normalizeFilterText(city),
    };
    setAppliedSearchFilters(newAppliedSearchFilters);
    setPriceFilterError(null);

    // On relance la recherche avec les nouveaux filtres
    runSearch(submittedQuery, {
      ...newAppliedSearchFilters,
      min: validation.min,
      max: validation.max,
    });
  }, [priceMin, priceMax, category, categoryId, city, submittedQuery, runSearch, clearPendingMainSearchDebounce]);

  const handleResetAllFilters = useCallback(() => {
    clearPendingMainSearchDebounce();
    setCity('');
    setCategoryId(null);
    setAppliedPriceFilters({ min: null, max: null });
    setAppliedSearchFilters({ category: null, categoryId: null, city: null });
    setPriceFilterError(null);
    runSearch(submittedQuery, {
      category: null,
      categoryId: null,
      city: null,
      min: null,
      max: null
    });
  }, [submittedQuery, runSearch, clearPendingMainSearchDebounce]);

  const openFilters = useCallback(() => {
    Keyboard.dismiss();
    setFiltersOpen(true);
  }, []);

  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const openSaved = useCallback(() => {
    Keyboard.dismiss();
    setSavedOpen(true);
  }, []);

  const closeSaved = useCallback(() => setSavedOpen(false), []);

  const handleNotificationsPress = useCallback(() => {
    router.push('/notifications' as Href);
  }, [router]);

  const { width, bucket } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const scrollBottomReserve = useMemo(
    () => getScrollBottomReserveForTabBar(width, insets.bottom),
    [width, insets.bottom]
  );
  const searchChrome = useMemo(() => {
    const borderColor = 'rgba(15,23,42,0.04)';
    const searchBg = '#F4F6F8';
    const rowShadow = Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    });
    if (width < 380) {
      return {
        hPad: 16,
        searchMinH: 47,
        searchPadV: 10,
        stripPadTop: 2,
        searchIconSize: 21,
        searchRadius: 20,
        searchBg,
        borderColor,
        rowShadow,
      };
    }
    if (width >= 430) {
      return {
        hPad: 28,
        searchMinH: 53,
        searchPadV: 13,
        stripPadTop: 4,
        searchIconSize: 23,
        searchRadius: 21,
        searchBg,
        borderColor,
        rowShadow,
      };
    }
    return {
      hPad: 20,
      searchMinH: 50,
      searchPadV: 12,
      stripPadTop: 3,
      searchIconSize: 22,
      searchRadius: 20,
      searchBg,
      borderColor,
      rowShadow,
    };
  }, [width]);
  const authState = useAuthStateForHome();

  const showMarketplaceHomeFeed = state.status === 'idle';

  const handleBoostedVoirTout = useCallback(() => {}, []);

  const handleCategoriesVoirTout = useCallback(() => {
    router.push('/categories' as Href);
  }, [router]);

  const handleSellPress = useCallback(async () => {
    try {
      const session = await getSession();
      if (session?.user) {
        router.push('/sell' as Href);
      } else {
        router.push(buildAuthGateHref('sell'));
      }
    } catch {
      router.push(buildAuthGateHref('sell'));
    }
  }, [router]);

  const handleQuickCategoryPress = useCallback(
    (id: string, label: string) => {
      const cid = parseInt(id, 10);
      const cidOk = Number.isFinite(cid) ? cid : null;
      const nextCat = normalizeFilterText(label);
      setSearchOverlayOpen(false);
      clearPendingMainSearchDebounce();
      lastDisplayedPage1KeyRef.current = null;

      const isSameCategory =
        cidOk != null && appliedSearchFilters.categoryId != null && cidOk === appliedSearchFilters.categoryId;

      if (isSameCategory) {
        // Toggle off: remove category filter.
        setCategory('');
        setCategoryId(null);
        setAppliedSearchFilters((prev) => ({
          ...prev,
          category: null,
          categoryId: null,
        }));

        const hasOtherActiveFilters =
          !!query.trim() ||
          !!appliedSearchFilters.city ||
          appliedPriceFilters.min != null ||
          appliedPriceFilters.max != null;

        if (!hasOtherActiveFilters) {
          // Return to global marketplace feed (home).
          browseFromHomeFooterRef.current = false;
          setState({ status: 'idle' });
          setSubmittedQuery('');
          setOverlayDraft('');
          return;
        }

        void runSearchRef.current(query.trim(), {
          category: null,
          categoryId: null,
          city: appliedSearchFilters.city,
          min: appliedPriceFilters.min,
          max: appliedPriceFilters.max,
        });
        return;
      }

      // Toggle on / replace: apply new category filter.
      setCategory(label);
      setCategoryId(cidOk);
      setAppliedSearchFilters((prev) => ({
        ...prev,
        category: nextCat,
        categoryId: cidOk,
      }));
      void runSearchRef.current(query.trim(), {
        category: nextCat,
        categoryId: cidOk,
        city: appliedSearchFilters.city,
        min: appliedPriceFilters.min,
        max: appliedPriceFilters.max,
      });
    },
    [
      query,
      appliedSearchFilters.categoryId,
      appliedSearchFilters.city,
      appliedPriceFilters.min,
      appliedPriceFilters.max,
      clearPendingMainSearchDebounce,
    ]
  );

  const marketplaceListHeader = useMemo(
    () => (
      <HomeMarketplaceFeedHeader
        authState={authState}
        bucket={bucket}
        onBoostedVoirTout={handleBoostedVoirTout}
        onCategoryPress={handleQuickCategoryPress}
        onCategoriesVoirTout={handleCategoriesVoirTout}
        onSellPress={handleSellPress}
        showCategoryStrip={false}
        showSellCta={false}
      />
    ),
    [
      authState,
      bucket,
      handleBoostedVoirTout,
      handleQuickCategoryPress,
      handleCategoriesVoirTout,
      handleSellPress,
    ]
  );

  const sortBar = useMemo(
    () => (
      <View style={styles.sortRow}>
        <View style={styles.sortContainerInline}>
          <Pressable
            style={[styles.sortOption, sortBy === 'recent' && styles.sortOptionActive]}
            onPress={() => setSortBy('recent')}
          >
            <Text style={[styles.sortOptionText, sortBy === 'recent' && styles.sortOptionTextActive]}>
              Plus récentes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortOption, sortBy === 'price_asc' && styles.sortOptionActive]}
            onPress={() => setSortBy('price_asc')}
          >
            <Text style={[styles.sortOptionText, sortBy === 'price_asc' && styles.sortOptionTextActive]}>
              Prix ↑
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortOption, sortBy === 'price_desc' && styles.sortOptionActive]}
            onPress={() => setSortBy('price_desc')}
          >
            <Text style={[styles.sortOptionText, sortBy === 'price_desc' && styles.sortOptionTextActive]}>
              Prix ↓
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.sortFiltersIconBtn,
            (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.sortFiltersIconBtnActive,
            pressed && styles.sortFiltersIconBtnPressed,
          ]}
          onPress={openFilters}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Filtres"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={
              hasAppliedPriceFilter || hasAppliedSearchFilter ? colors.primary : colors.textMuted
            }
          />
        </Pressable>
      </View>
    ),
    [
      sortBy,
      setSortBy,
      openFilters,
      hasAppliedPriceFilter,
      hasAppliedSearchFilter,
    ]
  );

  const savedSearchesSection = useMemo(() => {
    if (savedSearches.length === 0) return null;
    return (
      <View style={styles.savedSection}>
        <View style={styles.savedSectionHeader}>
            <Text style={styles.savedSectionTitle}>Recherches enregistrées</Text>
        </View>
        {savedSearches.slice(0, 5).map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.savedRow, pressed && styles.savedRowPressed]}
            onPress={() => handleSavedSearchPress(item)}
          >
            <View style={styles.savedRowBody}>
              <Text style={styles.savedRowTitle} numberOfLines={1}>
                {item.label || item.query}
              </Text>
              <Text style={styles.savedRowSubtitle} numberOfLines={1}>
                {item.query}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                handleRemoveSavedSearch(item.id);
              }}
              style={({ pressed }) => [styles.savedDeleteBtn, pressed && styles.savedDeleteBtnPressed]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        ))}
      </View>
    );
  }, [savedSearches, handleSavedSearchPress, handleRemoveSavedSearch]);

  const resultsHeader = useMemo(() => {
    const isExploreMode =
      !submittedQuery.trim() &&
      !appliedSearchFilters.category &&
      !appliedSearchFilters.city &&
      !hasAppliedPriceFilter;
    const isFromHome = params.from === 'home';

    return (
      <View style={styles.resultsHeaderWrap}>
        {isExploreMode ? (
          <View style={styles.exploreHeader}>
            <Text style={styles.exploreTitle}>
              {isFromHome ? 'Toutes les annonces' : 'Explorez les annonces disponibles'}
            </Text>
            <Text style={styles.exploreSubtitle}>Découvrez les dernières opportunités publiées</Text>
          </View>
        ) : (
          <View style={styles.exploreHeader}>
            <Text style={styles.exploreTitle}>Résultats de recherche</Text>
            <Text style={styles.exploreSubtitle}>
              {state.status === 'success' ? state.total : filteredListings.length}{' '}
              {(state.status === 'success' ? state.total : filteredListings.length) > 1
                ? 'annonces trouvées'
                : 'annonce trouvée'}
            </Text>
          </View>
        )}

        {sortBar}

        {resultsChipsDisplay.length > 0 ? (
          <View style={styles.activeChipsRow}>
            {resultsChipsDisplay.slice(0, 4).map((chip) => (
              <View key={chip} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{chip}</Text>
              </View>
            ))}
            {resultsChipsDisplay.length > 4 ? (
              <View style={styles.moreChip}>
                <Text style={styles.moreChipText}>+{resultsChipsDisplay.length - 4}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }, [
    sortBar,
    hasAppliedPriceFilter,
    appliedSearchFilters,
    submittedQuery,
    filteredListings.length,
    state,
    params.from,
    resultsChipsDisplay,
  ]);

  const filtersSheetContent = useMemo(
    () => (
      <View style={styles.sheetCard}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filtres</Text>
          <Pressable onPress={closeFilters} hitSlop={10} style={({ pressed }) => [styles.sheetCloseBtn, pressed && styles.sheetCloseBtnPressed]}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Catégorie</Text>
          <View style={styles.filterOptionWrap}>
            {CATEGORY_OPTIONS.map((option) => {
              const isSelected = category.trim() === option;
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.filterOptionChip,
                    isSelected && styles.filterOptionChipSelected,
                    pressed && styles.filterOptionChipPressed,
                  ]}
                  onPress={() => {
                    const newCat = category.trim() === option ? '' : option;
                    setCategory(newCat);
                    setCategoryId(getCategoryIdByLabel(newCat));
                  }}
                >
                  <Text
                    style={[
                      styles.filterOptionChipText,
                      isSelected && styles.filterOptionChipTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Ville</Text>
          <TextInput
            style={styles.filterInput}
            value={city}
            onChangeText={setCity}
            placeholder="Ex. Douala"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
          {availableCities.length > 0 ? (
            <View style={styles.filterOptionWrap}>
              {availableCities.slice(0, 6).map((option) => {
                const isSelected = normalizeMatchText(city) === normalizeMatchText(option);
                return (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.filterOptionChip,
                      isSelected && styles.filterOptionChipSelected,
                      pressed && styles.filterOptionChipPressed,
                    ]}
                    onPress={() => setCity((prev) => (normalizeMatchText(prev) === normalizeMatchText(option) ? '' : option))}
                  >
                    <Text
                      style={[
                        styles.filterOptionChipText,
                        isSelected && styles.filterOptionChipTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.filterDivider} />

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Prix</Text>
        </View>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterSubLabel}>Prix min</Text>
            <TextInput
              style={styles.filterInput}
              value={priceMin}
              onChangeText={(value) => {
                setPriceMin(value);
                if (priceFilterError) setPriceFilterError(null);
              }}
              placeholder="Ex. 50000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterSubLabel}>Prix max</Text>
            <TextInput
              style={styles.filterInput}
              value={priceMax}
              onChangeText={(value) => {
                setPriceMax(value);
                if (priceFilterError) setPriceFilterError(null);
              }}
              placeholder="Ex. 200000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
        </View>
        {priceFilterError ? <Text style={styles.filterError}>{priceFilterError}</Text> : null}

        {hasAppliedPriceFilter || hasAppliedSearchFilter ? (
          <View style={styles.filterSummary}>
            {activeFilterSummary.map((chip) => (
              <View key={chip} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.filterHelperText}>Aucun filtre actif.</Text>
        )}

        <View style={styles.filterActions}>
          <Pressable
            style={({ pressed }) => [
              styles.filterActionPrimary,
              !(hasDraftPriceChanges || hasDraftSearchChanges) && styles.filterActionDisabled,
              pressed && (hasDraftPriceChanges || hasDraftSearchChanges) && styles.filterActionPrimaryPressed,
            ]}
            onPress={() => {
              handleApplyAllFilters();
              closeFilters();
            }}
            disabled={!(hasDraftPriceChanges || hasDraftSearchChanges)}
          >
            <Text style={styles.filterActionPrimaryText}>Appliquer</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.filterActionSecondary,
              !(hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.filterActionDisabled,
              pressed && (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.filterActionSecondaryPressed,
            ]}
            onPress={handleResetAllFilters}
            disabled={!(hasAppliedPriceFilter || hasAppliedSearchFilter)}
          >
            <Text style={styles.filterActionSecondaryText}>Réinitialiser</Text>
          </Pressable>
        </View>

        <View style={styles.sheetDivider} />

        <Pressable
          style={({ pressed }) => [styles.saveSearchBtn, pressed && styles.saveSearchBtnPressed]}
          onPress={handleSaveSearch}
        >
          <Ionicons name="bookmark-outline" size={18} color={colors.primary} style={styles.saveSearchIcon} />
          <Text style={styles.saveSearchLabel}>
            {savedSearchFeedback ?? 'Sauvegarder cette recherche'}
          </Text>
        </Pressable>

        {savedSearches.length > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.savedOpenBtn, pressed && styles.savedOpenBtnPressed]}
            onPress={() => {
              closeFilters();
              openSaved();
            }}
          >
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <Text style={styles.savedOpenBtnText}>Recherches enregistrées</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [
      category,
      city,
      availableCities,
      priceMin,
      priceMax,
      priceFilterError,
      hasAppliedPriceFilter,
      hasAppliedSearchFilter,
      hasDraftPriceChanges,
      hasDraftSearchChanges,
      activeFilterSummary,
      handleApplyAllFilters,
      handleResetAllFilters,
      handleSaveSearch,
      savedSearchFeedback,
      savedSearches.length,
      closeFilters,
      openSaved,
    ]
  );

  return (
    <Screen noPadding safe={false}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <SafeAreaView style={styles.safeMarketplace} edges={['top', 'left', 'right']}>
          <View style={styles.marketplaceColumn}>
            <View style={styles.topStackMarketplace}>
              <HomeBrandHeader
                onNotificationsPress={handleNotificationsPress}
                unreadCount={0}
                searchTabLayout
              />
              <View
                style={[
                  styles.searchStripMarketplace,
                  {
                    paddingHorizontal: searchChrome.hPad,
                    paddingTop: searchChrome.stripPadTop,
                  },
                ]}
              >
                <View
                  style={[
                    styles.searchRow,
                    searchChrome.rowShadow,
                    {
                      minHeight: searchChrome.searchMinH,
                      paddingVertical: searchChrome.searchPadV,
                      paddingHorizontal: Math.min(searchChrome.hPad, 18),
                      backgroundColor: searchChrome.searchBg,
                      borderColor: searchChrome.borderColor,
                      borderWidth: 1,
                      borderRadius: searchChrome.searchRadius,
                    },
                  ]}
                >
                  <Ionicons
                    name="search"
                    size={searchChrome.searchIconSize}
                    color={colors.textMuted}
                    style={styles.searchIcon}
                  />
                  <Pressable
                    style={styles.searchFieldPressable}
                    onPress={openSearchOverlay}
                    accessibilityRole="button"
                    accessibilityLabel="Ouvrir la recherche"
                  >
                    <Text
                      style={[
                        styles.searchFieldText,
                        !(searchOverlayOpen ? overlayDraft : query).trim() && styles.searchFieldPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {(searchOverlayOpen ? overlayDraft : query).trim()
                        ? (searchOverlayOpen ? overlayDraft : query).trim()
                        : SEARCH_FIELD_PLACEHOLDER}
                    </Text>
                  </Pressable>
                  {query.trim().length > 0 ? (
                    <Pressable
                      onPress={() => {
                        clearPendingMainSearchDebounce();
                        lastDisplayedPage1KeyRef.current = null;
                        setQuery('');
                        setOverlayDraft('');
                        setState({ status: 'idle' });
                        setSubmittedQuery('');
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
                    >
                      <Ionicons
                        name="close-circle"
                        size={searchChrome.searchIconSize}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
                <HomeCategoryStrip
                  bucket={bucket}
                  onCategoryPress={handleQuickCategoryPress}
                  onAutresPress={handleCategoriesVoirTout}
                  parentContentPad={searchChrome.hPad}
                  selectedCategoryId={appliedSearchFilters.categoryId}
                />
                {savedSearches.length > 0 ? (
                  <View style={styles.savedQuickRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.savedQuickBtn,
                        pressed && styles.savedQuickBtnPressed,
                      ]}
                      onPress={openSaved}
                      accessibilityRole="button"
                      accessibilityLabel="Recherches enregistrées"
                    >
                      <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                      <Text style={styles.savedQuickBtnText}>Enregistrées</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.feedSlot}>
              {showMarketplaceHomeFeed ? (
                <ListingFeed
                  listHeaderComponent={marketplaceListHeader}
                  limit={HOME_FEED_PAGE_SIZE}
                  fetchPageSize={HOME_FEED_PAGE_SIZE}
                  skipNetworkRevalidateWithinMs={HOME_LISTING_FEED_NETWORK_COOLDOWN_MS}
                  disableInfiniteScroll
                  listInitialNumToRender={4}
                  footerAction={{
                    label: LABEL_VOIR_PLUS_ANNONCES,
                    onPress: () => {
                      clearPendingMainSearchDebounce();
                      lastDisplayedPage1KeyRef.current = null;
                      setQuery('');
                      setOverlayDraft('');
                      browseFromHomeFooterRef.current = true;
                      void runSearchRef.current('', {
                        categoryId: appliedSearchFilters.categoryId,
                        category: appliedSearchFilters.category,
                        city: appliedSearchFilters.city,
                        min: appliedPriceFilters.min,
                        max: appliedPriceFilters.max,
                      });
                    },
                  }}
                  contentPaddingHorizontal={0}
                  listingCardFeedPresentation="home"
                  contentBottomInset={scrollBottomReserve}
                  externalScrollRef={homeFeedListRef}
                />
              ) : (
                <>
                  {state.status === 'loading' && <Loader />}

                  {state.status === 'error' && (
                    <EmptyState
                      title="Erreur"
                      message={state.message}
                      style={styles.centerEdge}
                    />
                  )}

                  {state.status === 'empty' && (
                    <EmptyState
                      icon={<Ionicons name="search-outline" size={24} color={colors.primary} />}
                      title="Aucun résultat"
                      message={`Essayez un autre mot-clé ou modifiez vos filtres pour "${state.query}".`}
                      action={
                        <View style={styles.emptyAction}>
                          <Button variant="secondary" onPress={handleResetSearch}>
                            Réinitialiser la recherche
                          </Button>
                        </View>
                      }
                      style={styles.centerEdge}
                    />
                  )}

                  {state.status === 'success' && (
                    <FlatList
                      ref={resultsListRef}
                      data={filteredListings}
                      extraData={favoriteIds}
                      keyExtractor={keyExtractor}
                      renderItem={renderItem}
                      ItemSeparatorComponent={itemSeparator}
                      ListHeaderComponent={resultsHeader}
                      ListFooterComponent={
                        state.hasMore ? (
                          <View style={styles.searchLoadMoreFooter}>
                            <Button
                              variant="outline"
                              onPress={loadMoreSearchResults}
                              loading={loadingMoreSearch}
                            >
                              {LABEL_VOIR_PLUS_ANNONCES}
                            </Button>
                          </View>
                        ) : null
                      }
                      contentContainerStyle={[
                        styles.listContent,
                        { paddingBottom: spacing['3xl'] + scrollBottomReserve },
                      ]}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      onScroll={(e) => {
                        lastResultsScrollOffsetRef.current = e.nativeEvent.contentOffset.y ?? 0;
                      }}
                      scrollEventThrottle={16}
                      initialNumToRender={Platform.OS === 'ios' ? 6 : 8}
                      maxToRenderPerBatch={Platform.OS === 'ios' ? 4 : 6}
                      windowSize={Platform.OS === 'ios' ? 5 : 8}
                      removeClippedSubviews={Platform.OS === 'ios'}
                      ListEmptyComponent={
                        <EmptyState
                          icon={<Ionicons name="options-outline" size={24} color={colors.primary} />}
                          title="Aucun résultat avec ces filtres"
                          message="Essayez de réinitialiser ou d’assouplir vos filtres de catégorie, ville ou prix."
                          action={
                            <View style={styles.emptyAction}>
                              <Button variant="secondary" onPress={handleResetSearch}>
                                Réinitialiser la recherche
                              </Button>
                            </View>
                          }
                          style={styles.listEmpty}
                        />
                      }
                    />
                  )}
                </>
              )}
            </View>
          </View>
        </SafeAreaView>

        {/* Feuille recherche : champ + « Rechercher par catégorie » (pas d’icône filtres ici). */}
        <Modal
          visible={searchOverlayOpen}
          transparent
          animationType="slide"
          onRequestClose={closeSearchOverlay}
        >
          <Pressable style={styles.sheetOverlay} onPress={closeSearchOverlay}>
            <Pressable style={[styles.sheet, styles.searchOverlaySheet]} onPress={(e) => e.stopPropagation()}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.searchOverlayKeyboardInner}
              >
                <SafeAreaView edges={['top', 'bottom']} style={styles.searchOverlaySheetInner}>
                  <View style={styles.searchOverlayTopBar}>
                    <Pressable
                      onPress={closeSearchOverlay}
                      hitSlop={12}
                      style={({ pressed }) => [styles.searchOverlayBack, pressed && styles.searchOverlayBackPressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Retour"
                    >
                      <Ionicons name="arrow-back" size={22} color={colors.text} />
                    </Pressable>
                    <View style={styles.searchOverlayInlineInputShell}>
                      <Ionicons
                        name="search"
                        size={20}
                        color={colors.textMuted}
                        style={styles.searchOverlayInlineSearchIcon}
                      />
                      <TextInput
                        ref={overlayInputRef}
                        style={styles.searchOverlayInlineTextInput}
                        placeholder={SEARCH_FIELD_PLACEHOLDER}
                        placeholderTextColor={colors.textTertiary}
                        value={overlayDraft}
                        onChangeText={setOverlayDraft}
                        returnKeyType="search"
                        onSubmitEditing={() => submitKeywordSearch()}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {overlayDraft.trim().length > 0 ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => setOverlayDraft('')}
                          style={({ pressed }) => [styles.searchOverlayClear, pressed && { opacity: 0.7 }]}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.searchOverlayCategoryLink,
                      pressed && styles.searchOverlayCategoryLinkPressed,
                    ]}
                    onPress={() => {
                      closeSearchOverlay();
                      handleCategoriesVoirTout();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Rechercher par catégorie"
                  >
                    <Text style={styles.searchOverlayCategoryLinkText}>Rechercher par catégorie</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </Pressable>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.searchOverlayScrollContentBelow}
                  >
                    {overlaySuggestions.length > 0 ? (
                      <View style={styles.searchOverlaySuggestions}>
                        {overlaySuggestions.map((text) => (
                          <Pressable
                            key={text}
                            style={({ pressed }) => [
                              styles.suggestionRow,
                              pressed && styles.suggestionRowPressed,
                            ]}
                            onPress={() => handleOverlaySuggestionPress(text)}
                          >
                            <Ionicons
                              name="search"
                              size={18}
                              color={colors.textMuted}
                              style={styles.suggestionIcon}
                            />
                            <Text style={styles.suggestionText} numberOfLines={1}>
                              {text}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </ScrollView>
                </SafeAreaView>
              </KeyboardAvoidingView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Bottom sheet: filtres */}
        <Modal
          visible={filtersOpen}
          transparent
          animationType="slide"
          onRequestClose={closeFilters}
        >
          <Pressable style={styles.sheetOverlay} onPress={closeFilters}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              {filtersSheetContent}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Bottom sheet: recherches enregistrées */}
        <Modal
          visible={savedOpen}
          transparent
          animationType="slide"
          onRequestClose={closeSaved}
        >
          <Pressable style={styles.sheetOverlay} onPress={closeSaved}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetCard}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Recherches enregistrées</Text>
                  <Pressable onPress={closeSaved} hitSlop={10} style={({ pressed }) => [styles.sheetCloseBtn, pressed && styles.sheetCloseBtnPressed]}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
                {savedSearchesSection ?? (
                  <Text style={styles.savedEmptyText}>Aucune recherche enregistrée.</Text>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchLoadMoreFooter: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  keyboard: {
    flex: 1,
  },
  safeMarketplace: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  marketplaceColumn: {
    flex: 1,
  },
  topStackMarketplace: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchStripMarketplace: {
    paddingBottom: spacing.sm,
  },
  feedSlot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchFieldPressable: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  searchFieldText: {
    ...typography.base,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  searchFieldPlaceholder: {
    color: colors.textTertiary,
    fontWeight: fontWeights.normal,
  },
  savedQuickRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  savedQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  savedQuickBtnPressed: {
    opacity: 0.9,
  },
  savedQuickBtnText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  input: {
    flex: 1,
    ...typography.base,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  clearBtn: {
    padding: spacing.xs,
  },
  clearBtnPressed: {
    opacity: 0.7,
  },
  searchOverlaySheet: {
    maxHeight: '92%',
  },
  searchOverlayKeyboardInner: {
    maxHeight: '100%',
  },
  searchOverlaySheetInner: {
    maxHeight: '100%',
  },
  searchOverlayTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  searchOverlayBack: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  searchOverlayBackPressed: {
    opacity: 0.75,
  },
  searchOverlayInlineInputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchOverlayInlineSearchIcon: {
    marginRight: spacing.xs,
  },
  searchOverlayInlineTextInput: {
    flex: 1,
    minWidth: 0,
    ...typography.base,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  searchOverlayClear: {
    padding: spacing.xs,
  },
  searchOverlayCategoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  searchOverlayCategoryLinkPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  searchOverlayCategoryLinkText: {
    ...typography.base,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  searchOverlayScrollContentBelow: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  searchOverlaySuggestions: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  suggestionRowPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  suggestionIcon: {
    marginRight: spacing.sm,
  },
  suggestionText: {
    flex: 1,
    ...typography.base,
    color: colors.text,
  },
  placeholderWrap: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
  },
  placeholder: {
    ...typography.base,
    color: colors.textMuted,
  },
  savedSection: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  savedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedSectionTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  savedRowPressed: {
    opacity: 0.92,
  },
  savedRowBody: {
    flex: 1,
    minWidth: 0,
  },
  savedRowTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  savedRowSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  savedDeleteBtn: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  savedDeleteBtnPressed: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
  },
  centerEdge: {
    flex: 1,
    paddingHorizontal: spacing.base,
  },
  listEmpty: {
    marginHorizontal: 0,
    marginTop: spacing.base,
  },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.base,
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  sortFiltersIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  sortFiltersIconBtnActive: {
    borderColor: colors.primary + '44',
    backgroundColor: colors.primary + '10',
  },
  sortFiltersIconBtnPressed: {
    opacity: 0.88,
  },
  sortContainerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
  },
  sortOption: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '20',
  },
  sortOptionText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  filtersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  filtersBtnActive: {
    borderColor: colors.primary + '44',
    backgroundColor: colors.primary + '10',
  },
  filtersBtnPressed: {
    opacity: 0.9,
  },
  filtersBtnText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  filtersBtnTextActive: {
    color: colors.primary,
  },
  activeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  moreChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  moreChipText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingBottom: spacing.lg,
    maxHeight: '84%',
  },
  sheetCard: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  sheetCloseBtn: {
    padding: spacing.xs,
  },
  sheetCloseBtnPressed: {
    opacity: 0.75,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  savedOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignSelf: 'flex-start',
  },
  savedOpenBtnPressed: {
    opacity: 0.9,
  },
  savedOpenBtnText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  savedEmptyText: {
    ...typography.sm,
    color: colors.textMuted,
    paddingVertical: spacing.base,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  filterCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  filterTitle: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  filterHint: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  filterBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
  },
  filterBadgeText: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  filterField: {
    flex: 1,
    minWidth: 0,
  },
  filterSection: {
    gap: spacing.xs,
  },
  filterLabel: {
    ...typography.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterSubLabel: {
    ...typography.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  filterInput: {
    minWidth: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    ...typography.sm,
    color: colors.text,
  },
  filterOptionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterOptionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterOptionChipSelected: {
    backgroundColor: colors.primary + '16',
    borderColor: colors.primary + '36',
  },
  filterOptionChipPressed: {
    opacity: 0.9,
  },
  filterOptionChipText: {
    ...typography.xs,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  filterOptionChipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  filterDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  filterError: {
    ...typography.xs,
    color: colors.error,
  },
  filterSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterChipText: {
    ...typography.xs,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  filterHelperText: {
    ...typography.xs,
    color: colors.textMuted,
  },
  filterActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterActionPrimary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
  },
  filterActionPrimaryPressed: {
    opacity: 0.92,
  },
  filterActionPrimaryText: {
    ...typography.sm,
    color: colors.surface,
    fontWeight: fontWeights.semibold,
  },
  filterActionSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.base,
  },
  filterActionSecondaryPressed: {
    opacity: 0.85,
  },
  filterActionSecondaryText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  filterActionDisabled: {
    opacity: 0.5,
  },
  saveSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  saveSearchBtnPressed: {
    opacity: 0.8,
  },
  saveSearchIcon: {
    marginRight: spacing.xs,
  },
  saveSearchLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  emptyAction: {
    minWidth: 240,
  },
  resultsHeaderWrap: {
    paddingBottom: spacing.xs,
  },
  exploreHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  exploreTitle: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  exploreSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
});
