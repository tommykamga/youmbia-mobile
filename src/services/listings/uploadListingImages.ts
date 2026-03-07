/**
 * Upload listing images to storage and insert listing_images rows.
 * Uses bucket listing-images; paths stored in listing_images.url for signed URL resolution.
 */

import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

const BUCKET = 'listing-images';

export type UploadListingImagesResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

/**
 * Each item: base64 string (from image picker with base64: true).
 * Uploads to listingId/0.jpg, listingId/1.jpg, ... then inserts listing_images.
 */
export async function uploadListingImages(
  listingId: string,
  images: Array<{ base64: string }>
): Promise<UploadListingImagesResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  if (!images.length) return { data: null, error: null };

  for (let i = 0; i < images.length; i++) {
    const base64 = images[i].base64?.replace(/^data:image\/\w+;base64,/, '') ?? '';
    if (!base64) continue;

    const path = `${listingId}/${i}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      return { data: null, error: { message: uploadError.message } };
    }

    const { error: insertError } = await supabase.from('listing_images').insert({
      listing_id: listingId,
      url: path,
      sort_order: i,
    } as never);

    if (insertError) {
      return { data: null, error: { message: insertError.message } };
    }
  }

  return { data: null, error: null };
}
