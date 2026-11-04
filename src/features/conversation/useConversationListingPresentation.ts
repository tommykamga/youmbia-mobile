import { useEffect, useState } from 'react';
import { getListingsByIds } from '@/services/listings/getListingsByIds';

/**
 * Présentation annonce fil — getListingsByIds (même service que l'inbox / favoris),
 * sans modifier les services conversations.
 */
export function useConversationListingPresentation(listingId: string | null, enabled: boolean) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled || !listingId) {
      setThumbUrl(null);
      setPrice(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void getListingsByIds([listingId]).then((result) => {
      if (cancelled) return;
      const listing = result.data?.[0];
      setPrice(typeof listing?.price === 'number' ? listing.price : null);
      setThumbUrl(listing?.images?.[0]?.trim() ?? null);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, enabled]);

  return { thumbUrl, price, thumbPending: pending };
}
