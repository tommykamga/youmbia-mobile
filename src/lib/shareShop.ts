/**
 * Partage natif d'une boutique vendeur pro.
 */

import { Share, Linking, Platform } from 'react-native';

const SHOP_URL_BASE = 'https://www.youmbia.com/shop';
const WHATSAPP_PREFIX = 'https://wa.me';

export type ShareShopPayload = {
  slug: string;
  name: string;
  city?: string | null;
  /** Slogan léger — description courte ou ville. */
  tagline?: string | null;
};

export function getPublicShopUrl(slug: string | null | undefined): string | null {
  const safe = String(slug ?? '').trim().toLowerCase();
  if (!safe) return null;
  return `${SHOP_URL_BASE}/${safe}`;
}

/** Extrait un slogan court depuis la description boutique. */
export function pickShopShareTagline(options: {
  description?: string | null;
  city?: string | null;
}): string | null {
  const desc = options.description?.trim();
  if (desc) {
    const oneLine = desc.replace(/\s+/g, ' ');
    if (oneLine.length <= 72) return oneLine;
    const cut = oneLine.slice(0, 69).trimEnd();
    return `${cut}…`;
  }
  const city = options.city?.trim();
  return city ? `À ${city}` : null;
}

export function buildShopShareMessage(payload: ShareShopPayload): string {
  const name = String(payload.name ?? '').trim() || 'Boutique YOUMBIA';
  const tagline =
    payload.tagline?.trim() ||
    pickShopShareTagline({ city: payload.city }) ||
    null;
  const url = getPublicShopUrl(payload.slug);
  const lines = [
    'Découvrez notre boutique sur YOUMBIA',
    '',
    name,
    ...(tagline ? [tagline] : []),
    '',
    'Parcourez nos annonces et contactez-nous sur l’app.',
    '',
    url ?? '',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function shareMessage(
  message: string,
  fallback?: () => Promise<boolean>
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await Share.share(
      Platform.OS === 'ios' ? { message, title: 'YOUMBIA' } : { message }
    );
    if (result.action === Share.sharedAction) {
      return { success: true };
    }
    if (result.action === Share.dismissedAction) {
      return { success: false };
    }
    return { success: true };
  } catch {
    if (fallback) {
      const fallbackOk = await fallback();
      return {
        success: fallbackOk,
        error: fallbackOk ? undefined : 'Partage indisponible',
      };
    }
    return { success: false, error: 'Partage indisponible' };
  }
}

export async function shareShop(payload: ShareShopPayload): Promise<{ success: boolean; error?: string }> {
  if (!payload.slug?.trim() || !payload.name?.trim()) {
    return { success: false, error: 'Impossible de partager cette boutique' };
  }
  const message = buildShopShareMessage(payload);
  return shareMessage(message, () => shareShopViaWhatsApp(payload));
}

export async function shareShopViaWhatsApp(payload: ShareShopPayload): Promise<boolean> {
  const message = buildShopShareMessage(payload);
  const url = `${WHATSAPP_PREFIX}/?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
