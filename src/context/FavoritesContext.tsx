import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, InteractionManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getFavoriteIds, toggleFavorite as toggleFavoriteService } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { useRouter } from 'expo-router';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { lightCacheKeys, lightCacheRead, lightCacheRemove, lightCacheWrite } from '@/lib/lightCache';

/** Si le cache léger favoris est encore frais, éviter un `getFavoriteIds` réseau au montage du provider. */
const FAVORITES_PROVIDER_MOUNT_NETWORK_COOLDOWN_MS = 2 * 60 * 1000;

type FavoritesCachePayload = { userId: string; ids: string[] };

type FavoritesContextType = {
  favorites: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  /** Ref pour anti-spam toggle (évite des re-rendus provider inutiles vs useState). */
  const mutatingIdsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setFavorites(new Set());
        setLoading(false);
        await lightCacheRemove(lightCacheKeys.favorites);
        return;
      }
      const uid = session.user.id;
      const { data, error } = await getFavoriteIds();
      if (!error && data) {
        setFavorites(new Set(data));
        await lightCacheWrite<FavoritesCachePayload>(lightCacheKeys.favorites, { userId: uid, ids: data });
      }
    } catch (err) {
      console.error('[FavoritesContext] Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const session = await getSession();
        if (!session?.user) {
          setFavorites(new Set());
          setLoading(false);
          await lightCacheRemove(lightCacheKeys.favorites);
          return;
        }
        const uid = session.user.id;
        const cached = await lightCacheRead<FavoritesCachePayload>(lightCacheKeys.favorites);
        let hydratedFromFreshCache = false;
        if (cached?.payload?.userId === uid && Array.isArray(cached.payload.ids)) {
          setFavorites(new Set(cached.payload.ids));
          setLoading(false);
          hydratedFromFreshCache =
            cached.ageMs >= 0 && cached.ageMs < FAVORITES_PROVIDER_MOUNT_NETWORK_COOLDOWN_MS;
        }
        if (!hydratedFromFreshCache) {
          await refresh();
        }
      })();
    });
    return () => {
      task.cancel();
    };
  }, [refresh]);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const toggleFavorite = useCallback(async (id: string) => {
    // 0. Auth check
    const session = await getSession();
    if (!session?.user) {
      Alert.alert(
        'Connexion requise',
        'Vous devez être connecté pour ajouter des annonces à vos favoris.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Se connecter', onPress: () => router.push(buildAuthGateHref('favorites')) }
        ]
      );
      return;
    }

    // 1. Anti-spam check: ignore if already mutating this ID
    if (mutatingIdsRef.current.has(id)) return;

    // 1. Mark as mutating & Haptic Feedback
    mutatingIdsRef.current = new Set(mutatingIdsRef.current).add(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // 2. Optimistic Update (Functional for consistency)
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      // 3. Backend Sync
      const result = await toggleFavoriteService(id);
      
      if (result.error) {
        // Rollback on error
        setFavorites(prev => {
          const reverted = new Set(prev);
          if (reverted.has(id)) reverted.delete(id);
          else reverted.add(id);
          return reverted;
        });
        console.error('[FavoritesContext] Toggle error:', result.error.message);
      } else {
        setFavorites((prev) => {
          void lightCacheWrite<FavoritesCachePayload>(lightCacheKeys.favorites, {
            userId: session.user.id,
            ids: Array.from(prev),
          });
          return prev;
        });
      }
    } catch {
      // Rollback on crash/offline
      setFavorites(prev => {
        const reverted = new Set(prev);
        if (reverted.has(id)) reverted.delete(id);
        else reverted.add(id);
        return reverted;
      });
    } finally {
      // 4. Unlock mutation
      const next = new Set(mutatingIdsRef.current);
      next.delete(id);
      mutatingIdsRef.current = next;
    }
  }, [router]);

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite, loading, refresh }),
    [favorites, isFavorite, toggleFavorite, loading, refresh]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
