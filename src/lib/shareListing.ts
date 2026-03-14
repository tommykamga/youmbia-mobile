/**
 * Native sharing helpers for listing and seller profile.
 * Used on listing detail screen and seller public profile.
 */

import { Share, Linking, Platform } from 'react-native';
import { formatPrice } from './format';

const LISTING_URL_BASE = 'https://www.youmbia.com/annonce';
const SELLER_URL_BASE = 'https://www.youmbia.com/vendeur';

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

function buildShareMessage(payload: ShareListingPayload): string {
  const title = String(payload.title ?? '').trim() || 'Annonce YOUMBIA';
  const priceFormatted =
    typeof payload.price === 'number' && Number.isFinite(payload.price)
      ? formatPrice(payload.price)
      : null;
  const city = payload.city?.trim() || null;
  const url = getPublicListingUrl(payload.id);
  const summary = [title, priceFormatted, city].filter(Boolean).join(' — ');
  return [
    `Découvrez cette annonce sur YOUMBIA : ${summary || title}`,
    '',
    url ?? '',
  ].join('\n');
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

const WHATSAPP_PREFIX = 'https://wa.me';

async function shareMessage(
  message: string,
  fallback: () => Promise<boolean>
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message, title: 'YOUMBIA' }
        : { message }
    );

    if (result.action === Share.sharedAction) {
      return { success: true };
    }
    if (result.action === Share.dismissedAction) {
      return { success: false };
    }
    return { success: true };
  } catch {
    const fallbackOk = await fallback();
    return {
      success: fallbackOk,
      error: fallbackOk ? undefined : 'Partage indisponible',
    };
  }
}

/**
 * Opens native share sheet when available; on failure falls back to WhatsApp deep link.
 * Returns success so the caller can show error feedback when both fail.
 */
export async function shareListing(payload: ShareListingPayload): Promise<{ success: boolean; error?: string }> {
  if (!payload.id || !String(payload.title ?? '').trim()) {
    return { success: false, error: 'Impossible de partager cette annonce' };
  }

  const message = buildShareMessage(payload);
  return shareMessage(message, () => shareListingViaWhatsApp(payload));
}

/**
 * Opens WhatsApp with pre-filled share message (fallback when native share fails).
 * Returns true if the URL was opened, false otherwise.
 */
export async function shareListingViaWhatsApp(payload: ShareListingPayload): Promise<boolean> {
  const message = buildShareMessage(payload);
  const url = `${WHATSAPP_PREFIX}/?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
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
