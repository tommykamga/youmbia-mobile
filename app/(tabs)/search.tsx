/**
 * Search tab – Sprint 2.2.
 * Complete search: query input, loading/error/empty/results, ListingCard, tap → listing detail.
 * Data: searchListings(query) → title/city/description ilike; instant suggestions (debounced).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState } from '@/components';
import { ListingCard } from '@/features/listings';
import { searchListings } from '@/services/listings';
import { getSearchSuggestions } from '@/services/searchSuggestions';
import { getFavoriteIds as getFavIds, toggleFavorite as toggleFav } from '@/services/favorites';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const SUGGESTIONS_DEBOUNCE_MS = 300;

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; query: string }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[]; query: string };

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsListRef = useRef<FlatList<PublicListing> | null>(null);

  const loadFavorites = useCallback(async () => {
    const res = await getFavIds();
    if (res.data) setFavoriteIds(new Set(res.data));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
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

  /** When navigating from home with ?q=Category, pre-fill and run search once. */
  useEffect(() => {
    const initialQ = typeof params.q === 'string' ? params.q.trim() : '';
    if (!initialQ) return;
    setQuery(initialQ);
    runSearch(initialQ);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when q param is set from navigation
  }, [params.q]);

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
  useEffect(() => {
    if (state.status === 'success') {
      resultsListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [state.status, state.status === 'success' ? state.query : '']);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    setSuggestions([]);
    runSearch(query);
  }, [query, runSearch]);

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      setSuggestions([]);
      runSearch(suggestion);
    },
    [runSearch]
  );

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      const nextFavorite = !favoriteIds.has(listingId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (nextFavorite) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
      const result = await toggleFav(listingId);
      if (result.error) {
        setFavoriteIds((prev) => {
          const reverted = new Set(prev);
          if (nextFavorite) reverted.delete(listingId);
          else reverted.add(listingId);
          return reverted;
        });
        if (result.error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/search')}`);
        }
      }
    },
    [favoriteIds, router]
  );

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard
        listing={item}
        isFavorite={favoriteIds.has(item.id)}
        onFavoritePress={() => handleFavoritePress(item.id)}
      />
    ),
    [favoriteIds, handleFavoritePress]
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

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

        {state.status === 'idle' && suggestions.length === 0 && (
          <View style={styles.placeholderWrap}>
            <Text style={styles.placeholder}>
              Saisissez un mot-clé (titre, ville, description) puis validez la recherche.
            </Text>
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
          <EmptyState
            title="Aucun résultat"
            message={`Aucune annonce pour « ${state.query} ». Essayez d'autres termes.`}
            style={styles.centerEdge}
          />
        )}

        {state.status === 'success' && (
          <FlatList
            ref={resultsListRef}
            data={state.data}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={itemSeparator}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
  center: {
    flex: 1,
  },
  centerEdge: {
    flex: 1,
    paddingHorizontal: spacing.base,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
});
