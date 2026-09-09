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
 * Prépare un JPEG base64 uploadable.
 * - Prefer `uri` (file:// / ph:// / content://) via ImageManipulator — fiable sur iOS physique
 *   quand `ImagePicker.base64` est null ou trop lourd.
 * - Sinon utilise le base64 fourni.
 * - En cas d’échec manipulateur avec base64 d’origine : fallback base64.
 */
export async function compressListingPhotoForStorageUpload(input: {
  base64?: string | null;
  uri?: string | null;
  mimeType?: string | null;
}): Promise<{ base64: string }> {
  const stripped = stripDataUrlBase64Prefix(input.base64 ?? '');
  const uri =
    typeof input.uri === 'string' && input.uri.trim().length > 0 ? input.uri.trim() : '';

  if (shouldSkipListingPhotoRasterCompression(input.mimeType, uri || undefined)) {
    return { base64: stripped };
  }

  const sourceUri =
    uri && !uri.toLowerCase().endsWith('.svg') && !uri.toLowerCase().includes('.svg?')
      ? uri
      : stripped
        ? buildDataUriForManipulator(stripped, input.mimeType)
        : '';

  if (!sourceUri) {
    return { base64: stripped };
  }

  const beforeApprox = stripped ? approxDecodedBytesFromRawBase64(stripped) : 0;

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
        console.warn('[listingPhotoUpload] compression empty result, using original base64');
      }
      return { base64: stripped };
    }

    if (__DEV__) {
      console.log('[listingPhotoUpload]', {
        beforeBytes: beforeApprox,
        afterBytes: approxDecodedBytesFromRawBase64(outRaw),
        source: uri ? 'uri' : 'base64',
      });
    }

    return { base64: outRaw };
  } catch (e) {
    if (__DEV__) {
      console.warn('[listingPhotoUpload] compression failed, using original base64', e);
    }
    return { base64: stripped };
  }
}
