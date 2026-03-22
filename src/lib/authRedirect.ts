/**
 * Construction des routes post-authentification (mobile).
 * Préserve redirect + action contact vendeur (query `contact` sur /listing/[id]).
 */

import type { Href } from 'expo-router';
import { isSellerContactAction, type SellerContactAction } from '@/lib/sellerContact';

export function getSafeRedirect(redirect: string | undefined): string | null {
  if (!redirect || typeof redirect !== 'string') return null;
  const t = redirect.trim();
  if (t.startsWith('/') || t.startsWith('(')) return t;
  return null;
}

/**
 * Après login / signup réussi : destination dans l’app (jamais URL web).
 * Pour appliquer la navigation : préférer `replaceAfterSuccessfulAuth` dans `@/lib/authPostNavigation`.
 */
export function buildPostAuthHref(
  redirectParam: string | undefined,
  contactParam: string | undefined
): Href {
  const path = getSafeRedirect(redirectParam) ?? '/(tabs)/home';
  if (!contactParam || !isSellerContactAction(contactParam)) {
    return path as Href;
  }
  if (path.startsWith('/listing/')) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}contact=${encodeURIComponent(contactParam)}` as Href;
  }
  return path as Href;
}

/** Connexion depuis la fiche annonce avec intention de contact (reste dans l’app). */
export function buildLoginHrefForListingContact(
  listingId: string,
  contact: SellerContactAction
): Href {
  return `/(auth)/login?redirect=${encodeURIComponent(`/listing/${listingId}`)}&contact=${encodeURIComponent(contact)}` as Href;
}

export function buildLoginHref(redirect?: string, contact?: string): string {
  const qs: string[] = [];
  if (redirect) qs.push(`redirect=${encodeURIComponent(redirect)}`);
  if (contact) qs.push(`contact=${encodeURIComponent(contact)}`);
  if (qs.length === 0) return '/(auth)/login';
  return `/(auth)/login?${qs.join('&')}`;
}

export function buildSignupHref(redirect?: string, contact?: string): string {
  const qs: string[] = [];
  if (redirect) qs.push(`redirect=${encodeURIComponent(redirect)}`);
  if (contact) qs.push(`contact=${encodeURIComponent(contact)}`);
  if (qs.length === 0) return '/(auth)/signup';
  return `/(auth)/signup?${qs.join('&')}`;
}

export type BuildResetHrefParams = {
  redirect?: string;
  contact?: string;
  email?: string;
};

/**
 * Écran reset mot de passe — préserve redirect / contact comme login & signup.
 */
export function buildResetHref(params: BuildResetHrefParams = {}): string {
  const qs: string[] = [];
  if (params.redirect) qs.push(`redirect=${encodeURIComponent(params.redirect)}`);
  if (params.contact) qs.push(`contact=${encodeURIComponent(params.contact)}`);
  if (params.email) qs.push(`email=${encodeURIComponent(params.email)}`);
  if (qs.length === 0) return '/(auth)/reset';
  return `/(auth)/reset?${qs.join('&')}`;
}
