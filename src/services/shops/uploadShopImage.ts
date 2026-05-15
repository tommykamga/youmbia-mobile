/**
 * Upload logo / bannière boutique (bucket listing-images, chemins dédiés).
 */

import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { compressListingPhotoForStorageUpload } from '@/lib/listingPhotoUploadCompression';

const BUCKET = 'listing-images';

export type ShopImageUploadInput = {
  base64: string;
  uri?: string;
  mimeType?: string | null;
};

export async function uploadShopImage(
  ownerId: string,
  shopId: string,
  kind: 'logo' | 'banner',
  image: ShopImageUploadInput
): Promise<{ path: string | null; error: string | null }> {
  try {
    const compressed = await compressListingPhotoForStorageUpload(image);
    const base64 = compressed.base64?.trim();
    if (!base64) {
      return { path: null, error: 'Image invalide' };
    }
    const path = `${ownerId}/shops/${shopId}/${kind}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, decode(base64), {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      return { path: null, error: error.message };
    }
    return { path, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    return { path: null, error: message };
  }
}
