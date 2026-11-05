import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { countMyActiveListings } from '@/services/listings/countMyActiveListings';

export type ActiveListingsCountState = {
  loading: boolean;
  count: number | null;
  error: boolean;
  reload: () => Promise<void>;
};

export { formatActiveListingsCountLabel } from './activeListingsCountLabel';

export function useSellerActiveListingsCount(): ActiveListingsCountState {
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const lastGood = useRef<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await countMyActiveListings();
      if (result.error || !result.data) {
        setError(true);
        if (lastGood.current != null) {
          setCount(lastGood.current);
        }
        return;
      }
      setError(false);
      lastGood.current = result.data.count;
      setCount(result.data.count);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return { loading, count, error, reload };
}
