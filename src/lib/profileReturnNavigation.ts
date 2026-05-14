import type { Href } from 'expo-router';
import { getSafeRedirect } from '@/lib/authRedirect';

const PROFILE_ROUTE = '/account/profile';

export function buildAccountProfileHref(next?: string): Href {
  const safeNext = getSafeRedirect(next);
  if (!safeNext || safeNext === PROFILE_ROUTE) {
    return PROFILE_ROUTE as Href;
  }
  return `${PROFILE_ROUTE}?next=${encodeURIComponent(safeNext)}` as Href;
}

export function getProfileReturnNext(nextParam: string | string[] | undefined): string | null {
  const raw = Array.isArray(nextParam) ? nextParam[0] : nextParam;
  const safe = getSafeRedirect(raw);
  if (!safe || safe === PROFILE_ROUTE) return null;
  return safe;
}

type ProfileReturnRouter = {
  replace: (href: Href) => void;
  back: () => void;
};

export function replaceAfterProfileSave(router: ProfileReturnRouter, next: string | null): void {
  if (next) {
    router.replace(next as Href);
    return;
  }
  router.back();
}
