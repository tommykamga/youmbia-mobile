import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const MAX_JPEG_WIDTH = 1200;
const JPEG_COMPRESS = 0.65;

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

function buildDataUriForManipulator(rawBase64: string, mimeType: string | null | undefined): string {
  const raw = stripDataUrlBase64Prefix(rawBase64);
  const m = (mimeType ?? '').trim().toLowerCase();
  const mime = m.startsWith('image/') ? m : 'image/jpeg';
  return `data:${mime};base64,${raw}`;
}

/**
 * SVG (et variantes) : pas de re-encodage JPEG côté client — on garde le flux existant.
 */
export function shouldSkipListingPhotoRasterCompression(
  mimeType: string | null | undefined,
  uri: string | undefined
): boolean {
  const m = (mimeType ?? '').toLowerCase();
  if (m.includes('svg')) return true;
  const u = (uri ?? '').toLowerCase();
  if (u.endsWith('.svg') || u.includes('.svg?')) return true;
  return false;
}

/**
 * Redimensionnement max largeur + JPEG qualité fixe, ratio conservé par le manipulateur.
 * En cas d’échec, renvoie le base64 d’origine (sans casser l’upload).
 */
export async function compressListingPhotoForStorageUpload(input: {
  base64: string;
  uri?: string;
  mimeType?: string | null;
}): Promise<{ base64: string }> {
  const stripped = stripDataUrlBase64Prefix(input.base64);
  if (!stripped) {
    return { base64: stripped };
  }

  const beforeApprox = approxDecodedBytesFromRawBase64(stripped);

  if (shouldSkipListingPhotoRasterCompression(input.mimeType, input.uri)) {
    if (__DEV__) {
      console.log('[listingPhotoUpload]', {
        skip: 'svg-or-non-raster-policy',
        beforeBytes: beforeApprox,
      });
    }
    return { base64: stripped };
  }

  const sourceUri =
    typeof input.uri === 'string' &&
    input.uri.length > 0 &&
    !input.uri.toLowerCase().endsWith('.svg') &&
    !input.uri.toLowerCase().includes('.svg?')
      ? input.uri
      : buildDataUriForManipulator(stripped, input.mimeType);

  try {
    const result = await manipulateAsync(
      sourceUri,
      [{ resize: { width: MAX_JPEG_WIDTH } }],
      {
        compress: JPEG_COMPRESS,
        format: SaveFormat.JPEG,
        base64: true,
      }
    );

    const outRaw = result.base64 ? stripDataUrlBase64Prefix(result.base64) : '';
    if (!outRaw) {
      if (__DEV__) {
        console.warn('[listingPhotoUpload] compression empty result, using original');
      }
      return { base64: stripped };
    }

    if (__DEV__) {
      console.log('[listingPhotoUpload]', {
        beforeBytes: beforeApprox,
        afterBytes: approxDecodedBytesFromRawBase64(outRaw),
      });
    }

    return { base64: outRaw };
  } catch (e) {
    if (__DEV__) {
      console.warn('[listingPhotoUpload] compression failed, using original', e);
    }
    return { base64: stripped };
  }
}
