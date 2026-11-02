import { getPublicContentHref } from '../src/lib/publicContentDeepLink';

/** Rewrite public paths before Expo Router resolves them, on cold and warm entry. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const absolute = path.startsWith('/') && !path.startsWith('//')
    ? `https://www.youmbia.com${path}` : path;
  return getPublicContentHref(absolute) ?? path;
}
