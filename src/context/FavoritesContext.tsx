import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { getFavoriteIds, toggleFavorite as toggleFavoriteService } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { buildAuthGateHref } from '@/lib/authGateNavigation';

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
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setFavorites(new Set());
        setLoading(false);
        return;
      }
      const { data, error } = await getFavoriteIds();
      if (!error && data) {
        setFavorites(new Set(data));
      }
    } catch (err) {
      console.error('[FavoritesContext] Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
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
    if (mutatingIds.has(id)) return;

    // 1. Mark as mutating & Haptic Feedback
    setMutatingIds(prev => new Set(prev).add(id));
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
      setMutatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [mutatingIds, router]);

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite, loading, refresh }}>
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
