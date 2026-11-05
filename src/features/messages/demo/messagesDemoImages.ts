import { Image } from 'react-native';
import { DEMO_IMAGES } from '@/features/home/demo/demoImages';

export type MessagesDemoImageKey = keyof typeof DEMO_IMAGES;

/** URI locale (bundle) pour InboxListingThumb — pas de réseau. */
export function messagesDemoImageUri(key: MessagesDemoImageKey): string {
  return Image.resolveAssetSource(DEMO_IMAGES[key]).uri;
}
