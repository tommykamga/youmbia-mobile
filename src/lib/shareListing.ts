/**
 * Share listing via native share sheet, with WhatsApp deep-link fallback.
 * Used on listing detail screen for "Partager" action.
 */

import { Share, Linking, Platform } from 'react-native';
import { formatPrice } from './format';

const LISTING_URL_BASE = 'https://www.youmbia.com/annonce';

export type ShareListingPayload = {
  id: string;
  title: string;
  price: number;
  city?: string | null;
};

export function getPublicListingUrl(id: string | null | undefined): string | null {
  const safeId = String(id ?? '').trim();
  if (!safeId) return null;
  return `${LISTING_URL_BASE}/${safeId}`;
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

const WHATSAPP_PREFIX = 'https://wa.me';

/**
 * Opens native share sheet when available; on failure falls back to WhatsApp deep link.
 * Returns success so the caller can show error feedback when both fail.
 */
export async function shareListing(payload: ShareListingPayload): Promise<{ success: boolean; error?: string }> {
  if (!payload.id || !String(payload.title ?? '').trim()) {
    return { success: false, error: 'Impossible de partager cette annonce' };
  }

  const message = buildShareMessage(payload);

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
    const fallbackOk = await shareListingViaWhatsApp(payload);
    return {
      success: fallbackOk,
      error: fallbackOk ? undefined : 'Partage indisponible',
    };
  }
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
