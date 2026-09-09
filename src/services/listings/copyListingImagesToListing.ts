/**
 * Copie Storage des photos d’une annonce source vers un NOUVEL id.
 * Jamais de réutilisation d’id `listing_images`, ni du path `userId/sourceId/...`.
 * Échec → rollback des objets / lignes DEST uniquement (source intacte).
 */

import { supabase } from '@/lib/supabase';
import { resolveCopiedListingImageDest } from '@/lib/listingDuplicateImages';

const BUCKET = 'listing-images';
const MAX_IMAGES_PER_LISTING = 4;

export const LISTING_IMAGE_COPY_FAILED_MESSAGE =
  "Impossible de copier les photos vers la nouvelle annonce. Réessayez.";

export type ListingImageCopySource = {
  path: string;
  sort_order: number | null;
};

export type CopyListingImagesResult =
  | {
      status: 'ok';
      data: { copiedCount: number; failedCount: 0; destPaths: string[] };
      error: null;
    }
  | {
      status: 'failed';
      data: { copiedCount: number; failedCount: number; destPaths: string[] };
      error: { message: string };
    };

async function rollbackCopiedDestImages(args: {
  targetListingId: string;
  destPaths: string[];
}): Promise<void> {
  const targetListingId = String(args.targetListingId ?? '').trim();
  const destPaths = [...new Set(args.destPaths.filter((p) => p.includes(targetListingId)))];
  if (!targetListingId || destPaths.length === 0) return;

  await supabase
    .from('listing_images')
    .delete()
    .eq('listing_id', targetListingId)
    .in('url', destPaths);

  await supabase.storage.from(BUCKET).remove(destPaths);
}

async function copyObjectOrReupload(
  fromPath: string,
  toPath: string
): Promise<{ ok: boolean; message?: string }> {
  const storage = supabase.storage.from(BUCKET);
  const copied = await storage.copy(fromPath, toPath);
  if (!copied.error) return { ok: true };

  const downloaded = await storage.download(fromPath);
  if (downloaded.error || !downloaded.data) {
    return { ok: false, message: copied.error.message };
  }

  const uploaded = await storage.upload(toPath, downloaded.data, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploaded.error) {
    return { ok: false, message: uploaded.error.message };
  }
  return { ok: true };
}

/**
 * Copie les fichiers source vers `userId/targetListingId/n.jpg` puis insert
 * de nouvelles lignes `listing_images`. All-or-nothing avec nettoyage dest.
 */
export async function copyListingImagesToListing(
  targetListingId: string,
  sources: ListingImageCopySource[]
): Promise<CopyListingImagesResult> {
  const destPaths: string[] = [];
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 'failed',
        data: { copiedCount: 0, failedCount: sources.length, destPaths: [] },
        error: { message: 'Non connecté' },
      };
    }

    const listingId = String(targetListingId ?? '').trim();
    if (!listingId) {
      return {
        status: 'failed',
        data: { copiedCount: 0, failedCount: sources.length, destPaths: [] },
        error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
      };
    }

    const limited = sources.slice(0, MAX_IMAGES_PER_LISTING);
    if (limited.length === 0) {
      return {
        status: 'ok',
        data: { copiedCount: 0, failedCount: 0, destPaths: [] },
        error: null,
      };
    }

    for (let i = 0; i < limited.length; i++) {
      const sourcePath = String(limited[i]?.path ?? '').trim();
      const resolved = resolveCopiedListingImageDest({
        sourcePath,
        targetListingId: listingId,
        userId: user.id,
        sortOrder: i,
      });

      if (!resolved.ok) {
        await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
        return {
          status: 'failed',
          data: { copiedCount: 0, failedCount: limited.length, destPaths: [] },
          error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
        };
      }

      const destPath = resolved.destPath;
      const copied = await copyObjectOrReupload(sourcePath, destPath);
      if (!copied.ok) {
        destPaths.push(destPath);
        await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
        return {
          status: 'failed',
          data: { copiedCount: 0, failedCount: limited.length, destPaths: [] },
          error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
        };
      }

      destPaths.push(destPath);

      const { data: existingRows, error: existingError } = await supabase
        .from('listing_images')
        .select('id, url')
        .eq('listing_id', listingId)
        .eq('sort_order', i)
        .limit(1);

      if (existingError) {
        await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
        return {
          status: 'failed',
          data: { copiedCount: 0, failedCount: limited.length, destPaths: [] },
          error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
        };
      }

      const existing = existingRows?.[0] as { id?: string; url?: string } | undefined;
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('listing_images')
          .update({ url: destPath } as never)
          .eq('id', existing.id)
          .eq('listing_id', listingId);

        if (updateError) {
          await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
          return {
            status: 'failed',
            data: { copiedCount: 0, failedCount: limited.length, destPaths: [] },
            error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
          };
        }
      } else {
        const { error: insertError } = await supabase.from('listing_images').insert({
          listing_id: listingId,
          url: destPath,
          sort_order: i,
        } as never);

        if (insertError) {
          await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
          return {
            status: 'failed',
            data: { copiedCount: 0, failedCount: limited.length, destPaths: [] },
            error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
          };
        }
      }
    }

    return {
      status: 'ok',
      data: { copiedCount: destPaths.length, failedCount: 0, destPaths: [...destPaths] },
      error: null,
    };
  } catch {
    const listingId = String(targetListingId ?? '').trim();
    if (listingId && destPaths.length > 0) {
      await rollbackCopiedDestImages({ targetListingId: listingId, destPaths });
    }
    return {
      status: 'failed',
      data: { copiedCount: 0, failedCount: sources.length, destPaths: [] },
      error: { message: LISTING_IMAGE_COPY_FAILED_MESSAGE },
    };
  }
}
