/**
 * Native sharing helpers for listing and seller profile.
 * Used on listing detail screen and seller public profile.
 */

import { Share, Linking, Platform } from 'react-native';
import { formatPrice } from './format';
import {
  trackListingShareInitiated,
  trackListingShared,
  type ShareChannel,
} from '@/lib/analytics';

const LISTING_URL_BASE = 'https://www.youmbia.com/annonce';
const SELLER_URL_BASE = 'https://www.youmbia.com/vendeur';
const WHATSAPP_PREFIX = 'https://wa.me';

export type ShareListingPayload = {
  id: string;
  title: string;
  price: number;
  city?: string | null;
};

export type ShareSellerPayload = {
  id: string;
  name?: string | null;
  city?: string | null;
};

export function getPublicListingUrl(id: string | null | undefined): string | null {
  const safeId = String(id ?? '').trim();
  if (!safeId) return null;
  return `${LISTING_URL_BASE}/${safeId}`;
}

export function getPublicSellerUrl(id: string | null | undefined): string | null {
  const safeId = String(id ?? '').trim();
  if (!safeId) return null;
  return `${SELLER_URL_BASE}/${safeId}`;
}

export function buildListingShareMessage(payload: ShareListingPayload): string {
  const title = String(payload.title ?? '').trim() || 'Annonce YOUMBIA';
  const priceFormatted =
    typeof payload.price === 'number' && Number.isFinite(payload.price)
      ? formatPrice(payload.price)
      : null;
  const city = payload.city?.trim() || null;
  const url = getPublicListingUrl(payload.id);
  const lines = [title, priceFormatted, city].filter(Boolean) as string[];
  if (url) {
    lines.push(`Voir l'annonce sur YOUMBIA : ${url}`);
  }
  return lines.join('\n');
}

export function buildWhatsAppShareUrl(message: string): string {
  return `${WHATSAPP_PREFIX}/?text=${encodeURIComponent(message)}`;
}

function buildSellerShareMessage(payload: ShareSellerPayload): string {
  const name = String(payload.name ?? '').trim() || 'Vendeur YOUMBIA';
  const city = payload.city?.trim() || null;
  const url = getPublicSellerUrl(payload.id);
  const summary = [name, city].filter(Boolean).join(' — ');
  return [
    `Découvre ce vendeur sur YOUMBIA : ${summary || name}`,
    '',
    url ?? '',
  ].join('\n');
}

function inferShareChannel(
  activityType: string | null | undefined,
  usedWhatsAppFallback: boolean
): ShareChannel {
  if (usedWhatsAppFallback) return 'whatsapp';
  const type = String(activityType ?? '').toLowerCase();
  if (type.includes('whatsapp')) return 'whatsapp';
  if (type.includes('copy') || type.includes('pasteboard')) return 'copy_link';
  return 'other';
}

async function shareMessage(
  message: string,
  fallback: () => Promise<boolean>
): Promise<{ success: boolean; error?: string; channel?: ShareChannel }> {
  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message, title: 'YOUMBIA' }
        : { message }
    );

    if (result.action === Share.sharedAction) {
      return {
        success: true,
        channel: inferShareChannel(result.activityType, false),
      };
    }
    if (result.action === Share.dismissedAction) {
      return { success: false };
    }
    return { success: true, channel: 'other' };
  } catch {
    const fallbackOk = await fallback();
    return {
      success: fallbackOk,
      channel: fallbackOk ? 'whatsapp' : undefined,
      error: fallbackOk ? undefined : 'Partage indisponible',
    };
  }
}

async function openWhatsAppWithMessage(message: string): Promise<boolean> {
  try {
    await Linking.openURL(buildWhatsAppShareUrl(message));
    return true;
  } catch {
    return false;
  }
}

export type ShareListingOptions = {
  /** Caller already emitted `listing_share_initiated`. */
  skipShareInitiated?: boolean;
};

/**
 * Opens native share sheet when available; on failure falls back to WhatsApp deep link.
 * Returns success so the caller can show error feedback when both fail.
 */
export async function shareListing(
  payload: ShareListingPayload,
  options?: ShareListingOptions
): Promise<{ success: boolean; error?: string }> {
  if (!payload.id || !String(payload.title ?? '').trim()) {
    return { success: false, error: 'Impossible de partager cette annonce' };
  }

  if (!options?.skipShareInitiated) {
    trackListingShareInitiated({
      listing_id: payload.id,
      share_channel: 'other',
    });
  }

  const message = buildListingShareMessage(payload);
  const result = await shareMessage(message, () => openWhatsAppWithMessage(message));
  if (result.success) {
    trackListingShared({
      listing_id: payload.id,
      share_channel: result.channel ?? 'other',
    });
  }
  return result;
}

/**
 * Opens WhatsApp with pre-filled share message (fallback when native share fails).
 * Returns true if the URL was opened, false otherwise.
 */
export async function shareListingViaWhatsApp(payload: ShareListingPayload): Promise<boolean> {
  const message = buildListingShareMessage(payload);
  return openWhatsAppWithMessage(message);
}

/**
 * Post-publish WhatsApp CTA: WhatsApp first, native share sheet if WhatsApp cannot open.
 */
export async function shareListingPreferWhatsApp(
  payload: ShareListingPayload
): Promise<{ success: boolean; error?: string }> {
  if (!payload.id || !String(payload.title ?? '').trim()) {
    return { success: false, error: 'Impossible de partager cette annonce' };
  }

  trackListingShareInitiated({
    listing_id: payload.id,
    share_channel: 'whatsapp',
  });

  const waOk = await shareListingViaWhatsApp(payload);
  if (waOk) {
    trackListingShared({
      listing_id: payload.id,
      share_channel: 'whatsapp',
    });
    return { success: true };
  }

  return shareListing(payload, { skipShareInitiated: true });
}

export async function shareSellerProfile(
  payload: ShareSellerPayload
): Promise<{ success: boolean; error?: string }> {
  if (!payload.id) {
    return { success: false, error: 'Impossible de partager ce profil vendeur' };
  }

  const message = buildSellerShareMessage(payload);
  return shareMessage(message, () => shareSellerProfileViaWhatsApp(payload));
}

export async function shareSellerProfileViaWhatsApp(payload: ShareSellerPayload): Promise<boolean> {
  const message = buildSellerShareMessage(payload);
  const url = `${WHATSAPP_PREFIX}/?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
