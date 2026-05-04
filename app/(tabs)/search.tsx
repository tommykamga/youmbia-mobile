/**
 * Search tab – Sprint 2.2.
 * Complete search: query input, loading/error/empty/results, ListingCard, tap → listing detail.
 * Data: searchListings(query) → title/city/description ilike; instant suggestions (debounced).
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
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState, Button } from '@/components';
import { ListingCard } from '@/features/listings';
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

const SUGGESTIONS_DEBOUNCE_MS = 300;
/** Debounce saisie → lancement recherche principale (egress). */
const SEARCH_QUERY_DEBOUNCE_MS = 600;
/** Ne pas relancer `runSearch` si les params de navigation sont identiques sous ce délai (anti double effet / focus). */
const SEARCH_NAV_PARAMS_RUN_COOLDOWN_MS = 2 * 60 * 1000;
/** Première page recherche — le reste au bouton « Voir plus » (egress). */
const SEARCH_INITIAL_PAGE_SIZE = 6;

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDisplayedPage1KeyRef = useRef<string | null>(null);
  const searchSeqRef = useRef(0);
  const runSearchRef = useRef<(q: string, filters?: Partial<AppliedSearchFilters & AppliedPriceFilters>) => Promise<void>>(
    async () => {}
  );
  const resultsListRef = useRef<FlatList<PublicListing> | null>(null);
  const savedSearchFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavParamsSearchEffectKeyRef = useRef<string>('');
  const lastNavParamsSearchEffectAtRef = useRef(0);

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

  /** Debounced suggestions: trigger after 300ms when query length >= 2. */
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      getSearchSuggestions(trimmed).then((result) => {
        if (result.error) {
          setSuggestions([]);
          return;
        }
        setSuggestions(result.data ?? []);
      });
    }, SUGGESTIONS_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  const runSearch = useCallback(async (q: string, filters?: Partial<AppliedSearchFilters & AppliedPriceFilters>) => {
    const trimmed = q.trim();

    const searchCategoryId = filters?.categoryId !== undefined ? filters.categoryId : appliedSearchFilters.categoryId;
    const searchCity = filters?.city !== undefined ? filters.city : appliedSearchFilters.city;
    const searchMinPrice = filters?.min !== undefined ? filters.min : appliedPriceFilters.min;
    const searchMaxPrice = filters?.max !== undefined ? filters.max : appliedPriceFilters.max;

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

  /** Recherche principale debouncée : ≥ 2 caractères uniquement (pas d’exploration auto sur champ vide). */
  useEffect(() => {
    const trimmed = query.trim();
    if (mainSearchDebounceRef.current) {
      clearTimeout(mainSearchDebounceRef.current);
      mainSearchDebounceRef.current = null;
    }
    if (trimmed.length < 2) {
      return;
    }
    mainSearchDebounceRef.current = setTimeout(() => {
      mainSearchDebounceRef.current = null;
      void runSearchRef.current(trimmed);
    }, SEARCH_QUERY_DEBOUNCE_MS);
    return () => {
      if (mainSearchDebounceRef.current) {
        clearTimeout(mainSearchDebounceRef.current);
        mainSearchDebounceRef.current = null;
      }
    };
  }, [query]);

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

  const handleSubmit = useCallback(() => {
    clearPendingMainSearchDebounce();
    Keyboard.dismiss();
    setSuggestions([]);
    runSearch(query);
  }, [query, runSearch, clearPendingMainSearchDebounce]);

  const handleResetSearch = useCallback(() => {
    clearPendingMainSearchDebounce();
    lastDisplayedPage1KeyRef.current = null;
    setQuery('');
    setSubmittedQuery('');
    setSuggestions([]);
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

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      clearPendingMainSearchDebounce();
      setQuery(suggestion);
      setSuggestions([]);
      runSearch(suggestion);
    },
    [runSearch, clearPendingMainSearchDebounce]
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
      setSuggestions([]);
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

  const activeFiltersCount = activeFilterSummary.length;

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

  const sortBar = useMemo(
    () => (
      <View style={styles.sortRow}>
        <View style={styles.sortContainerInline}>
          <Pressable
            style={[styles.sortOption, sortBy === 'recent' && styles.sortOptionActive]}
            onPress={() => setSortBy('recent')}
          >
            <Text style={[styles.sortOptionText, sortBy === 'recent' && styles.sortOptionTextActive]}>
              Récent
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
            styles.filtersBtn,
            (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.filtersBtnActive,
            pressed && styles.filtersBtnPressed,
          ]}
          onPress={openFilters}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={(hasAppliedPriceFilter || hasAppliedSearchFilter) ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.filtersBtnText,
              (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.filtersBtnTextActive,
            ]}
          >
            Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
          </Text>
        </Pressable>
      </View>
    ),
    [sortBy, openFilters, hasAppliedPriceFilter, hasAppliedSearchFilter, activeFiltersCount, setSortBy]
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
    const isExploreMode = !submittedQuery && !appliedSearchFilters.category && !appliedSearchFilters.city;
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
              {state.status === 'success' ? state.total : filteredListings.length} { (state.status === 'success' ? state.total : filteredListings.length) > 1 ? 'annonces trouvées' : 'annonce trouvée'}
            </Text>
          </View>
        )}

        {sortBar}

        {(hasAppliedPriceFilter || hasAppliedSearchFilter) && (
          <View style={styles.activeChipsRow}>
            {activeFilterSummary.slice(0, 3).map((chip) => (
              <View key={chip} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{chip}</Text>
              </View>
            ))}
            {activeFilterSummary.length > 3 ? (
              <View style={styles.moreChip}>
                <Text style={styles.moreChipText}>+{activeFilterSummary.length - 3}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  }, [
    sortBar,
    hasAppliedPriceFilter,
    hasAppliedSearchFilter,
    activeFilterSummary,
    appliedSearchFilters,
    submittedQuery,
    filteredListings.length,
    state,
    params.from,
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
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.input}
              placeholder="Que recherchez-vous ?"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSubmit}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => {
                  clearPendingMainSearchDebounce();
                  lastDisplayedPage1KeyRef.current = null;
                  setQuery('');
                  setState({ status: 'idle' });
                  setSubmittedQuery('');
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.headerActionsRow}>
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitLabel}>Rechercher</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerSecondaryBtn,
                (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.headerSecondaryBtnActive,
                pressed && styles.headerSecondaryBtnPressed,
              ]}
              onPress={openFilters}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={(hasAppliedPriceFilter || hasAppliedSearchFilter) ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.headerSecondaryBtnText,
                  (hasAppliedPriceFilter || hasAppliedSearchFilter) && styles.headerSecondaryBtnTextActive,
                ]}
              >
                Filtres
              </Text>
            </Pressable>
            {savedSearches.length > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.headerSecondaryBtn, pressed && styles.headerSecondaryBtnPressed]}
                onPress={openSaved}
              >
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                <Text style={styles.headerSecondaryBtnText}>Enregistrées</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsWrap}>
            {suggestions.map((text) => (
              <Pressable
                key={text}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed && styles.suggestionRowPressed,
                ]}
                onPress={() => handleSuggestionPress(text)}
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
        )}

        {state.status === 'loading' && (
          <Loader />
        )}

        {state.status === 'error' && (
          <EmptyState
            title="Erreur"
            message={state.message}
            style={styles.centerEdge}
          />
        )}

        {state.status === 'empty' && (
          <>
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
          </>
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
                    Voir plus d&apos;annonces
                  </Button>
                </View>
              ) : null
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
  header: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius['2xl'],
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
    minHeight: 52,
  },
  searchIcon: {
    marginRight: spacing.sm,
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
  submitBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.surface,
  },
  headerSecondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  headerSecondaryBtnActive: {
    borderColor: colors.primary + '44',
    backgroundColor: colors.primary + '12',
  },
  headerSecondaryBtnPressed: {
    opacity: 0.9,
  },
  headerSecondaryBtnText: {
    ...typography.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  headerSecondaryBtnTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  suggestionsWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    position: 'absolute',
    top: 110, // Approx height of header
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    zIndex: 50,
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
    paddingBottom: spacing['3xl'],
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
