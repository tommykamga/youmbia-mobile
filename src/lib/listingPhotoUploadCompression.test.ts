import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compressListingPhotoForStorageUpload } from './listingPhotoUploadCompression';

const manipulateAsync = vi.fn();

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => manipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

beforeEach(() => {
  manipulateAsync.mockReset();
});

describe('compressListingPhotoForStorageUpload', () => {
  it('préfère l’uri locale quand base64 est absent (iOS)', async () => {
    manipulateAsync.mockResolvedValue({ base64: 'compressed-from-uri' });
    const result = await compressListingPhotoForStorageUpload({
      base64: null,
      uri: 'file:///var/mobile/Containers/Data/photo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result.base64).toBe('compressed-from-uri');
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file:///var/mobile/Containers/Data/photo.jpg',
      expect.any(Array),
      expect.objectContaining({ base64: true })
    );
  });
});
