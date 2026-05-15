/**
 * Partage natif d'une boutique vendeur pro.
 */

import { Share, Platform } from 'react-native';

const SHOP_URL_BASE = 'https://www.youmbia.com/shop';

export type ShareShopPayload = {
  slug: string;
  name: string;
  city?: string | null;
};

export function getPublicShopUrl(slug: string | null | undefined): string | null {
  const safe = String(slug ?? '').trim().toLowerCase();
  if (!safe) return null;
  return `${SHOP_URL_BASE}/${safe}`;
}

function buildShopShareMessage(payload: ShareShopPayload): string {
  const name = String(payload.name ?? '').trim() || 'Boutique YOUMBIA';
  const city = payload.city?.trim() || null;
  const url = getPublicShopUrl(payload.slug);
  const summary = [name, city].filter(Boolean).join(' — ');
  return [
    `Découvrez cette boutique sur YOUMBIA : ${summary || name}`,
    '',
    url ?? '',
  ].join('\n');
}

export async function shareShop(payload: ShareShopPayload): Promise<{ success: boolean; error?: string }> {
  if (!payload.slug?.trim() || !payload.name?.trim()) {
    return { success: false, error: 'Impossible de partager cette boutique' };
  }
  try {
    const message = buildShopShareMessage(payload);
    const result = await Share.share(
      Platform.OS === 'ios' ? { message, title: 'YOUMBIA' } : { message }
    );
    if (result.action === Share.dismissedAction) {
      return { success: false };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Partage indisponible' };
  }
}
