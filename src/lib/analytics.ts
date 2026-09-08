/**
 * Product analytics (Mixpanel) — named events from the YOUMBIA tracking plan.
 * `platform` is attached automatically by `trackEvent`.
 */

import type { User } from '@supabase/supabase-js';
import {
  consumeAnalyticsSessionDurationSeconds,
  identifyAnalyticsUser,
  resetAnalytics,
  trackEvent,
} from '@/lib/mixpanel';

export type ListingViewSource =
  | 'home'
  | 'search'
  | 'favorites'
  | 'messages'
  | 'shared'
  | 'link'
  | 'other';

export type AuthMethod = 'email' | 'google' | 'apple';
export type ShareChannel = 'whatsapp' | 'copy_link' | 'other';
export type SellerContactMethod = 'message' | 'whatsapp' | 'call' | 'sms';

let nextListingViewSource: ListingViewSource = 'other';

const FIRST_AUTH_WINDOW_MS = 60_000;
let lastAuthTrackKey: string | null = null;

export function setListingViewSource(source: ListingViewSource): void {
  nextListingViewSource = source;
}

export function getListingViewSource(): ListingViewSource {
  return nextListingViewSource;
}

function displayNameFromUser(user: User): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ['full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function isFirstAuthForUser(user: User): boolean {
  const created = Date.parse(user.created_at);
  const lastSignIn = Date.parse(user.last_sign_in_at ?? user.created_at);
  if (!Number.isFinite(created) || !Number.isFinite(lastSignIn)) return true;
  return Math.abs(lastSignIn - created) < FIRST_AUTH_WINDOW_MS;
}

function shouldEmitAuthEvent(key: string): boolean {
  if (lastAuthTrackKey === key) return false;
  lastAuthTrackKey = key;
  return true;
}

export async function identifyCurrentUser(user: User): Promise<void> {
  await identifyAnalyticsUser(user.id, {
    email: user.email ?? null,
    name: displayNameFromUser(user),
  });
}

export async function captureAuthSuccess(
  user: User,
  options: {
    method: AuthMethod;
    flow?: 'signup' | 'signin';
    userRole?: 'buyer' | 'seller';
    rememberMeEnabled?: boolean;
  }
): Promise<void> {
  try {
    await identifyCurrentUser(user);
    const firstAuth = isFirstAuthForUser(user);
    const treatAsSignup = options.flow === 'signup' || (options.flow == null && firstAuth);

    if (treatAsSignup) {
      const key = `sign_up_completed:${user.id}`;
      if (!shouldEmitAuthEvent(key)) return;
      trackSignUpCompleted({
        signup_method: options.method,
        user_role: options.userRole ?? 'buyer',
        is_first_time_signup: true,
      });
      return;
    }

    const key = `sign_in_completed:${user.id}`;
    if (!shouldEmitAuthEvent(key)) return;
    trackSignInCompleted({
      signin_method: options.method,
      is_first_time_signin: firstAuth,
      remember_me_enabled: options.rememberMeEnabled ?? true,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] captureAuthSuccess failed', error);
    }
  }
}

export function trackSignUpCompleted(properties: {
  signup_method: AuthMethod;
  user_role: string;
  is_first_time_signup: boolean;
}): void {
  trackEvent('sign_up_completed', properties);
}

export function trackSignInCompleted(properties: {
  signin_method: AuthMethod;
  is_first_time_signin: boolean;
  remember_me_enabled: boolean;
}): void {
  trackEvent('sign_in_completed', properties);
}

export async function trackSignOut(properties: {
  signed_out_reason: string;
}): Promise<void> {
  try {
    const sessionDurationSeconds = await consumeAnalyticsSessionDurationSeconds();
    trackEvent('sign_out', {
      session_duration_seconds: sessionDurationSeconds,
      signed_out_reason: properties.signed_out_reason,
    });
    await resetAnalytics();
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] trackSignOut failed', error);
    }
    await resetAnalytics();
  }
}

export function trackHomeFeedViewed(properties: {
  feed_context: 'default' | 'refresh' | 'filter_applied';
  favorites_only: boolean;
}): void {
  trackEvent('home_feed_viewed', properties);
}

export function trackListingSearched(properties: {
  search_query: string;
  category?: string | null;
  city?: string | null;
}): void {
  trackEvent('listing_searched', {
    search_query: properties.search_query,
    category: properties.category ?? undefined,
    city: properties.city ?? undefined,
  });
}

export function trackListingViewed(properties: {
  listing_id: string;
  listing_category?: string | null;
  listing_city?: string | null;
  source?: ListingViewSource;
}): void {
  trackEvent('listing_viewed', {
    listing_id: properties.listing_id,
    listing_category: properties.listing_category ?? undefined,
    listing_city: properties.listing_city ?? undefined,
    source: properties.source ?? getListingViewSource(),
  });
}

export function trackListingGallerySwiped(properties: {
  listing_id: string;
  gallery_image_index: number;
  gallery_direction: 'next' | 'previous';
}): void {
  trackEvent('listing_gallery_swiped', properties);
}

export function trackListingFavorited(properties: {
  listing_id: string;
  favorite_source: string;
}): void {
  trackEvent('listing_favorited', properties);
}

export function trackListingUnfavorited(properties: {
  listing_id: string;
  favorite_source: string;
}): void {
  trackEvent('listing_unfavorited', properties);
}

export function trackSellerContactInitiated(properties: {
  listing_id: string;
  contact_method: SellerContactMethod;
}): void {
  trackEvent('seller_contact_initiated', properties);
}

export function trackConversationViewed(properties: {
  conversation_id: string;
  unread_messages_count: number;
}): void {
  trackEvent('conversation_viewed', properties);
}

export function trackMessageSent(properties: {
  conversation_id: string;
  message_count: number;
  message_type: string;
}): void {
  trackEvent('message_sent', properties);
}

export function trackMessageSendFailed(properties: {
  conversation_id: string;
  error: string;
}): void {
  trackEvent('message_send_failed', properties);
}

export function trackListingCreationStarted(properties: {
  creation_origin: string;
  category_selected?: string | null;
  city_selected?: string | null;
}): void {
  trackEvent('listing_creation_started', {
    creation_origin: properties.creation_origin,
    category_selected: properties.category_selected ?? undefined,
    city_selected: properties.city_selected ?? undefined,
  });
}

export function trackListingCreationCompleted(properties: {
  listing_id: string;
  has_photos: boolean;
  category?: string | null;
  city?: string | null;
}): void {
  trackEvent('listing_creation_completed', {
    listing_id: properties.listing_id,
    has_photos: properties.has_photos,
    category: properties.category ?? undefined,
    city: properties.city ?? undefined,
  });
}

export function trackListingImagesUploaded(properties: {
  listing_id: string;
  image_count: number;
}): void {
  trackEvent('listing_images_uploaded', properties);
}

export function trackListingShared(properties: {
  listing_id: string;
  share_channel: ShareChannel;
}): void {
  trackEvent('listing_shared', properties);
}

export function trackPostPublishViewed(properties: { listing_id: string }): void {
  trackEvent('post_publish_viewed', properties);
}

export function trackListingShareInitiated(properties: {
  listing_id: string;
  share_channel: ShareChannel;
}): void {
  trackEvent('listing_share_initiated', properties);
}

export function trackRecentSearchSelected(properties: { search_query: string }): void {
  trackEvent('recent_search_selected', {
    search_query: properties.search_query,
  });
}

export function trackListingReported(properties: {
  listing_id: string;
  report_reason: string;
}): void {
  trackEvent('listing_reported', properties);
}

export function trackBumpActivated(properties: {
  listing_id: string;
  bump_duration_days: number;
  bump_price_cfa: number;
}): void {
  trackEvent('bump_activated', properties);
}

export function trackListingMarkedSold(properties: {
  listing_id: string;
  time_to_sale_seconds?: number;
}): void {
  trackEvent('listing_marked_sold', properties);
}

export function trackTransactionCompleted(properties: {
  listing_id: string;
  transaction_value_cfa: number;
  completion_source: string;
}): void {
  trackEvent('transaction_completed', properties);
}

export { initMixpanel, identifyAnalyticsUser, resetAnalytics } from '@/lib/mixpanel';
