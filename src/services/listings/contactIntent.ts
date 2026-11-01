import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { marketplaceEventId } from '@/lib/marketplaceEventId';
import { getListingViewSource, type SellerContactMethod } from '@/lib/analytics';
import { trackEvent } from '@/lib/mixpanel';
import type { ListingDetail } from './getListingById';

type Receipt = { eventId: string | null; collected: boolean };
let sessionKey: string | null = null;
let epoch = 0;
const recent = new Map<string, { at: number; promise: Promise<Receipt> }>();
supabase.auth.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { epoch++; sessionKey = null; recent.clear(); }
});

/** Click intent only. Does not prove external opening, message delivery, conversation or sale. */
export function recordContactIntent(
  listing: Pick<ListingDetail, 'id' | 'city' | 'category_id'>,
  channel: SellerContactMethod,
  entryPoint: 'listing_detail' | 'auth_return' = 'listing_detail'
): Promise<Receipt> {
  const source = getListingViewSource();
  const key = `${listing.id}:${channel}:${source}:${entryPoint}`;
  const prior = recent.get(key);
  if (prior && Date.now() - prior.at < 1500) return prior.promise;
  let eventId: string;
  try { eventId = marketplaceEventId(); sessionKey ??= marketplaceEventId(); }
  catch { return Promise.resolve({ eventId: null, collected: false }); }
  const generation = epoch;
  const args = { p_event_id: eventId, p_listing_id: listing.id, p_channel: channel,
    p_platform: Platform.OS, p_source: source, p_entry_point: entryPoint, p_session_key: sessionKey };
  try {
    trackEvent('contact_cta_clicked', { event_id: eventId, listing_id: listing.id, channel,
      source, entry_point: entryPoint, city: listing.city, category_id: listing.category_id ?? null,
      event_version: 1, measurement: 'intent_only' });
  } catch { /* Analytics SDK failure cannot block contact or the server journal. */ }
  const promise = (async (): Promise<Receipt> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user || generation !== epoch) return { eventId, collected: false };
      for (let attempt = 0; attempt < 2; attempt++) {
        if (generation !== epoch) break;
        let result;
        try { result = await supabase.rpc('record_v5_contact_intent', args); }
        catch { if (attempt === 0) continue; break; }
        if (!result.error) return { eventId, collected: generation === epoch && result.data === eventId };
        if (result.error.code) break; // No retries for denied/missing backend/rate limits.
      }
    } catch { /* Missing backend or offline: metrics remain partial, contact stays usable. */ }
    return { eventId, collected: false };
  })();
  if (recent.size >= 100) recent.delete(recent.keys().next().value!);
  recent.set(key, { at: Date.now(), promise });
  return promise;
}
