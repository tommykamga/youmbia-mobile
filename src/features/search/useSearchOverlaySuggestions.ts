/**
 * Overlay keyword suggestions — debounce only, no auto-search of listings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSearchSuggestions } from '@/services/searchSuggestions';
import { SUGGESTIONS_DEBOUNCE_MS } from '@/features/search/searchSession';

export function useSearchOverlaySuggestions(overlayOpen: boolean, draft: string) {
  const [overlaySuggestions, setOverlaySuggestions] = useState<string[]>([]);
  const overlaySuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!overlayOpen) {
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
    const trimmed = draft.trim();
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
  }, [draft, overlayOpen]);

  const clearOverlaySuggestions = useCallback(() => {
    setOverlaySuggestions([]);
  }, []);

  return { overlaySuggestions, setOverlaySuggestions, clearOverlaySuggestions };
}
