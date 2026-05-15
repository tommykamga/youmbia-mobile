/**
 * Création boutique vendeur pro + activation profil (transactionnel côté client).
 */

import { supabase } from '@/lib/supabase';
import { buildShopSlugCandidate, slugifyShopName } from '@/lib/shopSlug';
import { resolveShopMediaUrls } from '@/lib/shopMediaUrl';
import { normalizePhoneForProfile } from '@/services/profile';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';
import { uploadShopImage, type ShopImageUploadInput } from './uploadShopImage';

export type CreateProShopPayload = {
  name: string;
  city?: string | null;
  whatsapp_phone?: string | null;
  phone?: string | null;
  description?: string | null;
  logo?: ShopImageUploadInput | null;
  banner?: ShopImageUploadInput | null;
};

export type CreateProShopResult =
  | { data: PublicShop; error: null }
  | { data: null; error: { message: string } };

const SLUG_MAX_ATTEMPTS = 8;

async function findAvailableSlug(name: string): Promise<string | null> {
  const base = slugifyShopName(name);
  for (let i = 0; i < SLUG_MAX_ATTEMPTS; i++) {
    const candidate = buildShopSlugCandidate(name, i === 0 ? undefined : i + 1);
    const { data, error } = await supabase
      .from('shops')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) return null;
    if (!data) return candidate;
  }
  const fallback = `${base}-${Date.now().toString(36).slice(-4)}`;
  return fallback.slice(0, 60);
}

export async function createProShop(payload: CreateProShopPayload): Promise<CreateProShopResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const name = payload.name?.trim();
  if (!name || name.length < 2) {
    return { data: null, error: { message: 'Nom de boutique requis (2 caractères minimum)' } };
  }

  const { data: existingProfile, error: profileReadError } = await supabase
    .from('profiles')
    .select('shop_id, seller_type')
    .eq('id', user.id)
    .maybeSingle();

  if (profileReadError) {
    return { data: null, error: { message: profileReadError.message } };
  }

  if ((existingProfile as { shop_id?: string | null } | null)?.shop_id) {
    return { data: null, error: { message: 'Vous avez déjà une boutique professionnelle.' } };
  }

  const slug = await findAvailableSlug(name);
  if (!slug) {
    return { data: null, error: { message: 'Impossible de générer une adresse boutique. Réessayez.' } };
  }

  const phoneNorm = payload.phone?.trim()
    ? normalizePhoneForProfile(payload.phone)
    : { value: null as string | null };
  if (phoneNorm.error) {
    return { data: null, error: { message: phoneNorm.error } };
  }
  const waNorm = payload.whatsapp_phone?.trim()
    ? normalizePhoneForProfile(payload.whatsapp_phone)
    : { value: null as string | null };
  if (waNorm.error) {
    return { data: null, error: { message: waNorm.error } };
  }

  const description = payload.description?.trim() || null;
  const city = payload.city?.trim() || null;

  const { data: inserted, error: insertError } = await supabase
    .from('shops')
    .insert({
      owner_id: user.id,
      name,
      slug,
      description,
      city,
      phone: phoneNorm.value,
      whatsapp_phone: waNorm.value ?? phoneNorm.value,
      logo_url: null,
      banner_url: null,
      is_verified: false,
      is_featured: false,
    })
    .select(SHOP_PUBLIC_SELECT)
    .single();

  if (insertError || !inserted) {
    const msg = insertError?.message?.includes('duplicate')
      ? 'Ce nom de boutique est déjà pris. Choisissez un autre nom.'
      : insertError?.message ?? 'Impossible de créer la boutique';
    return { data: null, error: { message: msg } };
  }

  const shopId = String((inserted as { id: string }).id);
  let logoUrl: string | null = null;
  let bannerUrl: string | null = null;

  if (payload.logo?.base64) {
    const up = await uploadShopImage(user.id, shopId, 'logo', payload.logo);
    if (up.path) logoUrl = up.path;
  }
  if (payload.banner?.base64) {
    const up = await uploadShopImage(user.id, shopId, 'banner', payload.banner);
    if (up.path) bannerUrl = up.path;
  }

  if (logoUrl || bannerUrl) {
    const { data: updatedShop, error: mediaError } = await supabase
      .from('shops')
      .update({
        ...(logoUrl ? { logo_url: logoUrl } : {}),
        ...(bannerUrl ? { banner_url: bannerUrl } : {}),
      })
      .eq('id', shopId)
      .eq('owner_id', user.id)
      .select(SHOP_PUBLIC_SELECT)
      .single();

    if (!mediaError && updatedShop) {
      Object.assign(inserted, updatedShop);
    }
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      seller_type: 'pro',
      shop_id: shopId,
    } as never)
    .eq('id', user.id);

  if (profileUpdateError) {
    return {
      data: null,
      error: {
        message:
          'Boutique créée mais activation incomplète. Réessayez depuis votre compte ou contactez le support.',
      },
    };
  }

  const resolved = await resolveShopMediaUrls(inserted as PublicShop);
  return { data: resolved, error: null };
}
