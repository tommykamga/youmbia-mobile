import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Limite avant compression (exigence produit). */
export const MAX_AVATAR_UPLOAD_BYTES = 5_000_000;

/** Taille cible après compression (~1 Mo max, 512 px). */
const MAX_STORED_BYTES = 1_000_000;
const MAX_AVATAR_WIDTH = 512;
const INITIAL_JPEG_QUALITY = 0.82;
const MIN_JPEG_QUALITY = 0.4;

export const AVATAR_SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

function stripDataUrlBase64Prefix(s: string): string {
  return String(s ?? '').replace(/^data:image\/\w+;base64,/i, '');
}

function approxDecodedBytesFromRawBase64(rawBase64: string): number {
  const clean = rawBase64.replace(/\s/g, '');
  if (!clean) return 0;
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** Valide le type MIME (jpg, jpeg, png, webp). */
export function isSupportedAvatarMime(mimeType: string | null | undefined): boolean {
  const m = String(mimeType ?? '').trim().toLowerCase();
  if (!m) return true;
  return AVATAR_SUPPORTED_MIME_TYPES.has(m);
}

/** Valide la taille fichier avant compression. */
export function validateAvatarUploadSize(fileSizeBytes: number | null | undefined): string | null {
  if (fileSizeBytes == null || !Number.isFinite(fileSizeBytes)) return null;
  if (fileSizeBytes > MAX_AVATAR_UPLOAD_BYTES) {
    return 'Image trop volumineuse (max 5 Mo). Choisissez une photo plus légère.';
  }
  return null;
}

export type CompressAvatarResult =
  | { ok: true; base64: string }
  | { ok: false; error: string };

/**
 * Redimensionne (512 px max) + compresse en JPEG jusqu'à ~1 Mo.
 * Entrée : URI locale (post-recadrage).
 */
export async function compressAvatarForStorageUpload(uri: string): Promise<CompressAvatarResult> {
  const source = String(uri ?? '').trim();
  if (!source) {
    return { ok: false, error: "Impossible de préparer l'image. Réessayez." };
  }

  try {
    let compress = INITIAL_JPEG_QUALITY;
    let manipulated = await manipulateAsync(
      source,
      [{ resize: { width: MAX_AVATAR_WIDTH } }],
      { compress, format: SaveFormat.JPEG, base64: true }
    );
    let preparedBase64 = stripDataUrlBase64Prefix(manipulated.base64 ?? '');

    while (preparedBase64 && approxDecodedBytesFromRawBase64(preparedBase64) > MAX_STORED_BYTES && compress > MIN_JPEG_QUALITY) {
      compress = Math.max(MIN_JPEG_QUALITY, compress - 0.2);
      manipulated = await manipulateAsync(
        source,
        [{ resize: { width: MAX_AVATAR_WIDTH } }],
        { compress, format: SaveFormat.JPEG, base64: true }
      );
      preparedBase64 = stripDataUrlBase64Prefix(manipulated.base64 ?? '');
    }

    if (!preparedBase64) {
      return { ok: false, error: "Impossible de préparer l'image. Réessayez." };
    }

    return { ok: true, base64: preparedBase64 };
  } catch {
    return { ok: false, error: "Impossible de préparer l'image. Réessayez." };
  }
}
