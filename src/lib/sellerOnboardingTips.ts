/**
 * Persistance locale — micro-conseils vendeur (dismissible).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'youmbia.sellerAcquisitionTips.dismissed.v1';

export async function readSellerTipsDismissed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function dismissSellerTips(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // silencieux
  }
}
