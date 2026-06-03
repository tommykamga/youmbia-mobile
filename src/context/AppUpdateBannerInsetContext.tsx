import { createContext, useContext } from 'react';

/**
 * Hauteur occupée par la bannière MAJ optionnelle (inclut la safe area top).
 * Permet aux headers / SafeAreaView d’éviter un double inset et un chevauchement.
 */
export const AppUpdateBannerInsetContext = createContext(0);

export function useAppUpdateBannerInset(): number {
  return useContext(AppUpdateBannerInsetContext);
}
