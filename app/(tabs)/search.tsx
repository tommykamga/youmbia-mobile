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
import { formatPrice } from '@/lib/format';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const SUGGESTIONS_DEBOUNCE_MS = 300;
const PRICE_INPUT_PATTERN = /^\d+$/;
const CATEGORY_OPTIONS = ['Véhicules', 'Mode', 'Maison', 'Électronique', 'Sport', 'Loisirs', 'Autre'] as const;

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; query: string }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[]; query: string };

type AppliedPriceFilters = {
  min: number | null;
  max: number | null;
};

type AppliedSearchFilters = {
  category: string | null;
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

function matchesListingCategory(listing: PublicListing, category: string | null): boolean {
  const normalizedCategory = normalizeMatchText(category);
  if (!normalizedCategory) return true;
  const haystack = normalizeMatchText(`${listing.title} ${listing.description ?? ''}`);
  return haystack.includes(normalizedCategory);
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
    return { min: null, max: null, error: 'La fourchette de prix est incoherente' };
  }
  return { min: minResult.value, max: maxResult.value, error: null };
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    priceMin?: string;
    priceMax?: string;
    category?: string;
    city?: string;
  }>();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [appliedPriceFilters, setAppliedPriceFilters] = useState<AppliedPriceFilters>({ min: null, max: null });
  const [appliedSearchFilters, setAppliedSearchFilters] = useState<AppliedSearchFilters>({
    category: null,
    city: null,
  });
  const [priceFilterError, setPriceFilterError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchFeedback, setSavedSearchFeedback] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsListRef = useRef<FlatList<PublicListing> | null>(null);
  const savedSearchFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFavorites = useCallback(async () => {
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

  /** When navigating with query params, pre-fill and run search once. */
  useEffect(() => {
    const initialQ = typeof params.q === 'string' ? params.q.trim() : '';
    if (!initialQ) return;
    setQuery(initialQ);
    runSearch(initialQ);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when navigation params change
  }, [params.q, params.priceMin, params.priceMax, params.category, params.city]);

  /** Pre-fill price filters from URL (e.g. from saved search). */
  useEffect(() => {
    const nextMin = typeof params.priceMin === 'string' ? params.priceMin.trim() : '';
    const nextMax = typeof params.priceMax === 'string' ? params.priceMax.trim() : '';
    const nextCategory = typeof params.category === 'string' ? params.category.trim() : '';
    const nextCity = typeof params.city === 'string' ? params.city.trim() : '';
    setPriceMin(nextMin);
    setPriceMax(nextMax);
    setCategory(nextCategory);
    setCity(nextCity);
    const validation = validatePriceFilters(nextMin, nextMax);
    if (validation.error) {
      setAppliedPriceFilters({ min: null, max: null });
      setAppliedSearchFilters({
        category: normalizeFilterText(nextCategory),
        city: normalizeFilterText(nextCity),
      });
      setPriceFilterError(validation.error);
      return;
    }
    setAppliedPriceFilters({ min: validation.min, max: validation.max });
    setAppliedSearchFilters({
      category: normalizeFilterText(nextCategory),
      city: normalizeFilterText(nextCity),
    });
    setPriceFilterError(null);
  }, [params.priceMin, params.priceMax, params.category, params.city]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setState({ status: 'idle' });
      setSubmittedQuery('');
      return;
    }
    setSubmittedQuery(trimmed);
    setState({ status: 'loading' });
    const result = await searchListings(trimmed);
    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    setState(
      list.length === 0
        ? { status: 'empty', query: trimmed }
        : { status: 'success', data: list, query: trimmed }
    );
  }, []);

  /** Scroll results list to top when a new search returns success (Sprint 3.2). */
  const scrollResetKey = state.status === 'success' ? state.query : '';
  useEffect(() => {
    if (state.status === 'success') {
      resultsListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [state.status, scrollResetKey]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    setSuggestions([]);
    runSearch(query);
  }, [query, runSearch]);

  const handleResetSearch = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setSuggestions([]);
    setPriceMin('');
    setPriceMax('');
    setCategory('');
    setCity('');
    setAppliedPriceFilters({ min: null, max: null });
    setAppliedSearchFilters({ category: null, city: null });
    setPriceFilterError(null);
    setState({ status: 'idle' });
  }, []);

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      setSuggestions([]);
      runSearch(suggestion);
    },
    [runSearch]
  );

  const handleSaveSearch = useCallback(() => {
    const result = saveSearch({
      query: submittedQuery,
      priceMin: appliedPriceFilters.min,
      priceMax: appliedPriceFilters.max,
      category: appliedSearchFilters.category,
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
      setSavedSearchFeedback('Cette recherche existe deja');
    } else {
      setSavedSearchFeedback('Recherche enregistree');
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
      setQuery(item.query);
      setSubmittedQuery(item.query);
      setPriceMin(item.priceMin != null ? String(item.priceMin) : '');
      setPriceMax(item.priceMax != null ? String(item.priceMax) : '');
      setCategory(item.category ?? '');
      setCity(item.city ?? '');
      setAppliedPriceFilters({ min: item.priceMin ?? null, max: item.priceMax ?? null });
      setAppliedSearchFilters({ category: item.category ?? null, city: item.city ?? null });
      setPriceFilterError(null);
      setSuggestions([]);
      runSearch(item.query);
    },
    [runSearch]
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
      city.trim() !== (appliedSearchFilters.city ?? '')
    );
  }, [category, city, appliedSearchFilters]);

  const activeFilterSummary = useMemo(() => {
    const chips: string[] = [];
    if (appliedSearchFilters.category) {
      chips.push(`Categorie ${appliedSearchFilters.category}`);
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

  const filteredListings = useMemo(() => {
    return sortedListings.filter((l) => {
      const p = l.price ?? 0;
      if (appliedPriceFilters.min != null && p < appliedPriceFilters.min) return false;
      if (appliedPriceFilters.max != null && p > appliedPriceFilters.max) return false;
      if (
        appliedSearchFilters.city != null &&
        normalizeMatchText(l.city) !== normalizeMatchText(appliedSearchFilters.city)
      ) {
        return false;
      }
      if (!matchesListingCategory(l, appliedSearchFilters.category)) return false;
      return true;
    });
  }, [sortedListings, appliedPriceFilters, appliedSearchFilters]);

  const handleApplyAllFilters = useCallback(() => {
    const validation = validatePriceFilters(priceMin, priceMax);
    if (validation.error) {
      setPriceFilterError(validation.error);
      return;
    }
    setAppliedPriceFilters({ min: validation.min, max: validation.max });
    setAppliedSearchFilters({
      category: normalizeFilterText(category),
      city: normalizeFilterText(city),
    });
    setPriceFilterError(null);
  }, [priceMin, priceMax, category, city]);

  const handleResetAllFilters = useCallback(() => {
    setPriceMin('');
    setPriceMax('');
    setCategory('');
    setCity('');
    setAppliedPriceFilters({ min: null, max: null });
    setAppliedSearchFilters({ category: null, city: null });
    setPriceFilterError(null);
  }, []);

  const sortBar = useMemo(
    () => (
      <View style={styles.sortContainer}>
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
    ),
    [sortBy]
  );

  const savedSearchesSection = useMemo(() => {
    if (savedSearches.length === 0) return null;
    return (
      <View style={styles.savedSection}>
        <View style={styles.savedSectionHeader}>
          <Text style={styles.savedSectionTitle}>Recherches enregistrees</Text>
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

  const resultsHeader = useMemo(
    () => (
      <>
        {sortBar}
        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <View>
              <Text style={styles.filterTitle}>Filtres de recherche</Text>
              <Text style={styles.filterHint}>Affinez par categorie, ville et prix sans perdre vos resultats.</Text>
            </View>
            {hasAppliedPriceFilter || hasAppliedSearchFilter ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>Actif</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Categorie</Text>
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
                    onPress={() => setCategory((prev) => (prev.trim() === option ? '' : option))}
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
              onPress={handleApplyAllFilters}
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
              <Text style={styles.filterActionSecondaryText}>Reinitialiser</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.saveSearchBtn, pressed && styles.saveSearchBtnPressed]}
          onPress={handleSaveSearch}
        >
          <Ionicons name="bookmark-outline" size={18} color={colors.primary} style={styles.saveSearchIcon} />
          <Text style={styles.saveSearchLabel}>
            {savedSearchFeedback ?? 'Sauvegarder cette recherche'}
          </Text>
        </Pressable>
        {savedSearchesSection}
      </>
    ),
    [
      sortBar,
      category,
      city,
      availableCities,
      priceMin,
      priceMax,
      hasAppliedPriceFilter,
      hasAppliedSearchFilter,
      hasDraftPriceChanges,
      hasDraftSearchChanges,
      priceFilterError,
      activeFilterSummary,
      handleApplyAllFilters,
      handleResetAllFilters,
      handleSaveSearch,
      savedSearchFeedback,
      savedSearchesSection,
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
              placeholder="Rechercher une annonce…"
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
          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitLabel}>Rechercher</Text>
          </Pressable>
        </View>

        {state.status === 'idle' && suggestions.length > 0 && (
          <>
            {savedSearchesSection}
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
          </>
        )}

        {state.status === 'idle' && suggestions.length === 0 && (
          <>
            {savedSearchesSection}
            <View style={styles.placeholderWrap}>
              <Text style={styles.placeholder}>
                Saisissez un mot-clé (titre, ville, description) puis validez la recherche.
              </Text>
            </View>
          </>
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
            {savedSearchesSection}
            <EmptyState
              icon={<Ionicons name="search-outline" size={24} color={colors.primary} />}
              title="Aucun résultat"
              message={`Essayez un autre mot-cle ou modifiez vos filtres pour "${state.query}".`}
              action={
                <View style={styles.emptyAction}>
                  <Button variant="secondary" onPress={handleResetSearch}>
                    Reinitialiser la recherche
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
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={Platform.OS === 'ios' ? 10 : 12}
            maxToRenderPerBatch={Platform.OS === 'ios' ? 6 : 8}
            windowSize={Platform.OS === 'ios' ? 6 : 10}
            removeClippedSubviews={Platform.OS === 'ios'}
            ListEmptyComponent={
              <EmptyState
                icon={<Ionicons name="options-outline" size={24} color={colors.primary} />}
                title="Aucun resultat avec ces filtres"
                message="Essayez de reinitialiser ou d'assouplir vos filtres de categorie, ville ou prix."
                action={
                  <View style={styles.emptyAction}>
                    <Button variant="secondary" onPress={handleResetSearch}>
                      Reinitialiser la recherche
                    </Button>
                  </View>
                }
                style={styles.listEmpty}
              />
            }
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
  suggestionsWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
});
