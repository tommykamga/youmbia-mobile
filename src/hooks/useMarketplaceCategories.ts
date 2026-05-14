import { useCallback, useEffect, useState } from 'react';
import {
  clearMarketplaceCategoriesCache,
  getMarketplaceCategories,
  type MarketplaceCategory,
} from '@/services/categories';

type UseMarketplaceCategoriesState = {
  categories: MarketplaceCategory[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useMarketplaceCategories(): UseMarketplaceCategoriesState {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    clearMarketplaceCategoriesCache();
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await getMarketplaceCategories();
      if (cancelled) {
        return;
      }
      if (result.error || !result.data) {
        setCategories([]);
        setError(result.error?.message ?? 'Impossible de charger les catégories');
        setLoading(false);
        return;
      }
      setCategories(result.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { categories, loading, error, reload };
}
