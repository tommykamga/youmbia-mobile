/**
 * Upload / suppression avatar Supabase Storage.
 * Chemin : `{userId}/avatar_{timestamp}.jpg` — nom unique à chaque changement.
 */

import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { AVATARS_BUCKET, invalidateAvatarCache } from '@/lib/avatarImageUrl';

export type UploadAvatarStorageResult =
  | { ok: true; path: string; bucket: string }
  | { ok: false; error: string };

async function uploadOnce(bucket: string, path: string, base64Jpeg: string) {
  return supabase.storage.from(bucket).upload(path, decode(base64Jpeg), {
    contentType: 'image/jpeg',
    upsert: true,
  });
}

export async function uploadAvatarToStorage(
  userId: string,
  base64Jpeg: string,
  previousPath?: string | null
): Promise<UploadAvatarStorageResult> {
  const path = `${userId}/avatar_${Date.now()}.jpg`;

  let usedBucket = AVATARS_BUCKET;
  let upload = await uploadOnce(AVATARS_BUCKET, path, base64Jpeg);

  if (upload.error) {
    const msg = String(upload.error.message ?? '').toLowerCase();
    const bucketMissing =
      msg.includes('bucket') || msg.includes('not found') || msg.includes('does not exist');
    if (bucketMissing && AVATARS_BUCKET !== 'listing-images') {
      usedBucket = 'listing-images';
      upload = await uploadOnce('listing-images', path, base64Jpeg);
    }
  }

  if (upload.error) {
    return { ok: false, error: upload.error.message || "Impossible de mettre à jour la photo." };
  }

  const prev = String(previousPath ?? '').trim();
  const prevIsPath = prev !== '' && prev !== path && !/^https?:\/\//i.test(prev);
  if (prevIsPath) {
    try {
      await supabase.storage.from(usedBucket).remove([prev]);
    } catch {
      // best-effort
    }
    invalidateAvatarCache(prev);
  }

  return { ok: true, path, bucket: usedBucket };
}

export async function removeAvatarFromStorage(path: string): Promise<void> {
  const p = String(path ?? '').trim();
  if (!p || /^https?:\/\//i.test(p)) return;

  try {
    let rm = await supabase.storage.from(AVATARS_BUCKET).remove([p]);
    if (rm.error && AVATARS_BUCKET !== 'listing-images') {
      rm = await supabase.storage.from('listing-images').remove([p]);
    }
  } catch {
    // best-effort
  }
  invalidateAvatarCache(p);
}
