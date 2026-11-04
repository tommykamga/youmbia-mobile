import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '@/services/conversations/types';
import {
  listingIdsCacheKey,
  loadInboxListingThumbsForIds,
  thumbMapsEqual,
  uniqueListingIdsFromConversations,
} from './inboxListingThumbs';

/**
 * État de présentation : URL vignette par listing_id.
 * Indépendant du cache conversations et des patches Realtime.
 */
export function useInboxListingThumbs(
  conversations: Conversation[],
  sessionUserId: string | null
): { thumbByListingId: Record<string, string>; thumbsFetchSettled: boolean } {
  const [thumbByListingId, setThumbByListingId] = useState<Record<string, string>>({});
  const [thumbsFetchSettled, setThumbsFetchSettled] = useState(true);
  const fetchGenRef = useRef(0);
  const sessionRef = useRef<string | null>(null);

  const listingIds = useMemo(
    () => uniqueListingIdsFromConversations(conversations),
    [conversations]
  );
  const idsKey = useMemo(() => listingIdsCacheKey(listingIds), [listingIds]);

  useEffect(() => {
    if (sessionUserId !== sessionRef.current) {
      sessionRef.current = sessionUserId;
      fetchGenRef.current += 1;
      setThumbByListingId({});
    }
    if (!sessionUserId || listingIds.length === 0) {
      if (listingIds.length === 0) setThumbByListingId({});
      setThumbsFetchSettled(true);
      return;
    }

    const ids = idsKey ? idsKey.split('\u001f') : [];
    const gen = ++fetchGenRef.current;
    setThumbsFetchSettled(false);

    void (async () => {
      const next = await loadInboxListingThumbsForIds(ids);
      if (gen !== fetchGenRef.current) return;

      setThumbByListingId((prev) => {
        if (thumbMapsEqual(prev, next)) return prev;
        return next;
      });
      setThumbsFetchSettled(true);
    })();
  }, [sessionUserId, idsKey, listingIds.length]);

  return { thumbByListingId, thumbsFetchSettled };
}
