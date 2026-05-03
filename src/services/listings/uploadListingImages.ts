/**
 * Upload listing images to storage and insert listing_images rows.
 * Uses bucket listing-images; paths stored in listing_images.url for signed URL resolution.
 */

import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { compressListingPhotoForStorageUpload } from '@/lib/listingPhotoUploadCompression';

const BUCKET = 'listing-images';
const MAX_IMAGES_PER_LISTING = 4;

/** Source photo : `uri` / `mimeType` optionnels (meilleure compression depuis fichier local). */
export type ListingImageUploadInput = {
  base64: string;
  uri?: string;
  mimeType?: string | null;
};

export type UploadListingImagesResult =
  | {
    status: 'ok';
    data: { uploadedCount: number; failedCount: 0; totalCount: number };
    error: null;
  }
  | {
    status: 'partial' | 'failed';
    data: { uploadedCount: number; failedCount: number; totalCount: number };
    error: { message: string };
  };

function getUploadErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible';
  }
  if (msg.includes('jwt') || msg.includes('auth')) {
    return 'Connexion requise';
  }
  return fallback;
}

/**
 * Chaque entrée : base64 (picker `base64: true`) + optionnellement `uri` / `mimeType` pour compression client (JPEG max 1200px) avant envoi Storage.
 * Chemins : userId/listingId/0.jpg, … puis lignes `listing_images`.
 */
export async function uploadListingImages(
  listingId: string,
  images: ListingImageUploadInput[],
  options?: { sortOrders?: number[] }
): Promise<UploadListingImagesResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 'failed',
        data: { uploadedCount: 0, failedCount: images.length, totalCount: images.length },
        error: { message: 'Non connecté' },
      };
    }

    if (images.length > MAX_IMAGES_PER_LISTING) {
      return {
        status: 'failed',
        data: { uploadedCount: 0, failedCount: images.length, totalCount: images.length },
        error: { message: 'Une annonce ne peut pas contenir plus de 4 photos.' },
      };
    }

    const sortOrders =
      Array.isArray(options?.sortOrders) && options?.sortOrders.length === images.length
        ? options!.sortOrders
        : images.map((_, i) => i);

    const sortOrderSet = new Set(sortOrders);
    const invalidSortOrders =
      sortOrders.length !== images.length ||
      sortOrderSet.size !== sortOrders.length ||
      sortOrders.some((n) => !Number.isInteger(n) || n < 0 || n >= MAX_IMAGES_PER_LISTING);

    if (invalidSortOrders) {
      return {
        status: 'failed',
        data: { uploadedCount: 0, failedCount: images.length, totalCount: images.length },
        error: { message: "Ordre des photos invalide. Réessayez." },
      };
    }

    if (!images.length) {
      return {
        status: 'ok',
        data: { uploadedCount: 0, failedCount: 0, totalCount: 0 },
        error: null,
      };
    }

    let uploadedCount = 0;
    let failedCount = 0;
    let lastErrorMessage: string | null = null;

    for (let i = 0; i < images.length; i++) {
      const sortOrder = sortOrders[i]!;
      const raw = images[i].base64?.replace(/^data:image\/\w+;base64,/, '') ?? '';
      if (!raw) {
        failedCount += 1;
        lastErrorMessage = "Certaines photos n'ont pas pu être préparées.";
        continue;
      }
      const { base64: prepared } = await compressListingPhotoForStorageUpload({
        base64: raw,
        uri: images[i].uri,
        mimeType: images[i].mimeType,
      });
      const base64 = prepared?.replace(/^data:image\/\w+;base64,/, '') ?? '';
      if (!base64) {
        failedCount += 1;
        lastErrorMessage = "Certaines photos n'ont pas pu être préparées.";
        continue;
      }

      const path = `${user.id}/${listingId}/${sortOrder}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, decode(base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        failedCount += 1;
        lastErrorMessage = getUploadErrorMessage(
          uploadError.message,
          "Impossible d'envoyer certaines photos."
        );
        continue;
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('listing_images')
        .select('id')
        .eq('listing_id', listingId)
        .eq('sort_order', sortOrder)
        .limit(1);

      if (existingError) {
        failedCount += 1;
        lastErrorMessage = getUploadErrorMessage(
          existingError.message,
          "Impossible d'enregistrer certaines photos."
        );
        continue;
      }

      const existingId = (existingRows?.[0] as { id: string } | undefined)?.id;

      if (existingId) {
        const { error: updateError } = await supabase
          .from('listing_images')
          .update({ url: path } as never)
          .eq('id', existingId);

        if (updateError) {
          failedCount += 1;
          lastErrorMessage = getUploadErrorMessage(
            updateError.message,
            "Impossible d'enregistrer certaines photos."
          );
          continue;
        }
      } else {
        const { error: insertError } = await supabase.from('listing_images').insert({
          listing_id: listingId,
          url: path,
          sort_order: sortOrder,
        } as never);

        if (insertError) {
          failedCount += 1;
          lastErrorMessage = getUploadErrorMessage(
            insertError.message,
            "Impossible d'enregistrer certaines photos."
          );
          continue;
        }
      }

      uploadedCount += 1;
    }

    const totalCount = images.length;
    if (failedCount === 0) {
      return {
        status: 'ok',
        data: { uploadedCount, failedCount: 0, totalCount },
        error: null,
      };
    }

    return {
      status: uploadedCount > 0 ? 'partial' : 'failed',
      data: { uploadedCount, failedCount, totalCount },
      error: {
        message:
          lastErrorMessage ??
          (uploadedCount > 0
            ? "Certaines photos n'ont pas pu être ajoutées."
            : "Impossible d'ajouter les photos."),
      },
    };
  } catch {
    return {
      status: 'failed',
      data: { uploadedCount: 0, failedCount: images.length, totalCount: images.length },
      error: { message: "Impossible d'ajouter les photos." },
    };
  }
}
