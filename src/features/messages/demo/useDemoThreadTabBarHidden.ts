import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Masque la tab bar pendant la prévisualisation fil démo (écran hors onglets en prod).
 * Dev / MessagesDemoScreen uniquement — n’affecte pas les routes conversation réelles.
 */
export function useDemoThreadTabBarHidden(hidden: boolean): void {
  const navigation = useNavigation();

  useEffect(() => {
    if (!__DEV__ || !hidden) return;
    const tabNav = navigation.getParent();
    if (!tabNav || typeof tabNav.setOptions !== 'function') return;

    tabNav.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      tabNav.setOptions({ tabBarStyle: undefined });
    };
  }, [hidden, navigation]);
}
