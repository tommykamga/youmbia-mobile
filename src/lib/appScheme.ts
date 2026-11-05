export type YoumbiaAppEnvironment = 'development' | 'preview' | 'production';

export function getYoumbiaMobileScheme(appEnvironment: string | undefined): string {
  if (appEnvironment === 'development') return 'youmbiamobile-dev';
  if (appEnvironment === 'preview') return 'youmbiamobile-qa';
  return 'youmbiamobile';
}

export const YOUMBIA_MOBILE_SCHEME = getYoumbiaMobileScheme(
  process.env.EXPO_PUBLIC_APP_ENV,
);
