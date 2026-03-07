import { useColorScheme as useColorSchemeCore } from 'react-native';

export const useColorScheme = () => {
  const coreScheme = useColorSchemeCore();
  // React Native's ColorSchemeName is 'light' | 'dark' | null; some runtimes use 'unspecified'
  const s = coreScheme as 'light' | 'dark' | 'unspecified' | null;
  return s === 'unspecified' || s === null ? 'light' : s;
};
