/**
 * Finalisation session Supabase depuis une URL de retour (Magic Link, OAuth, recovery).
 * Le client RN utilise detectSessionInUrl: false et GoTrueClient._getSessionFromURL exige un
 * navigateur — on reproduit donc le parsing (hash + query) et on appelle les API publiques
 * setSession / exchangeCodeForSession.
 *
 * @see https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 */

import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { buildPostAuthHref, getSafeRedirect } from '@/lib/authRedirect';
import { isSellerContactAction } from '@/lib/sellerContact';

/** Aligné sur @supabase/auth-js parseParametersFromURL (fragment + query). */
export function parseParametersFromURL(href: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const url = new URL(href);
    if (url.hash && url.hash[0] === '#') {
      try {
        const hashSearchParams = new URLSearchParams(url.hash.substring(1));
        hashSearchParams.forEach((value, key) => {
          result[key] = value;
        });
      } catch {
        /* ignore */
      }
    }
    url.searchParams.forEach((value, key) => {
      result[key] = value;
    });
  } catch {
    return parseAuthParamsFallback(href);
  }
  return result;
}

/** Si new URL() échoue (schèmes exotiques), extraction basique du fragment type OAuth. */
function parseAuthParamsFallback(href: string): Record<string, string> {
  const result: Record<string, string> = {};
  const hashIdx = href.indexOf('#');
  if (hashIdx === -1) return result;
  const fragment = href.slice(hashIdx + 1);
  try {
    const sp = new URLSearchParams(fragment);
    sp.forEach((value, key) => {
      result[key] = value;
    });
  } catch {
    /* ignore */
  }
  return result;
}

function stripFragment(href: string): string {
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(0, i) : href;
}

/**
 * Récupère redirect / contact depuis l’URL de callback Expo (path ou query),
 * comme généré par makeRedirectUri({ path: 'redirect=...&contact=...' }).
 */
export function extractRedirectContextFromCallbackUrl(fullUrl: string): {
  redirect?: string;
  contact?: string;
} {
  const base = stripFragment(fullUrl);
  try {
    const parsed = Linking.parse(base);
    const q = parsed.queryParams ?? {};
    const r = q.redirect ?? q.Redirect;
    const c = q.contact ?? q.Contact;
    if (typeof r === 'string' && r.trim()) {
      return {
        redirect: r.trim(),
        contact: typeof c === 'string' && c.trim() ? c.trim() : undefined,
      };
    }
    const rawPath = typeof parsed.path === 'string' ? parsed.path : '';
    if (rawPath) {
      const tryDecode = (s: string) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      };
      const decoded = tryDecode(rawPath);
      for (const segment of [decoded, rawPath]) {
        if (!segment.includes('redirect=')) continue;
        const sp = new URLSearchParams(
          segment.includes('?') ? (segment.split('?').pop() ?? segment) : segment
        );
        const redirect = sp.get('redirect');
        if (redirect) {
          const cont = sp.get('contact') ?? undefined;
          return {
            redirect: redirect.trim(),
            ...(cont && isSellerContactAction(cont) ? { contact: cont } : {}),
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function hasSupabaseAuthSignals(params: Record<string, string>): boolean {
  return Boolean(
    params.access_token ||
      params.refresh_token ||
      params.code ||
      params.error ||
      params.error_description ||
      params.error_code
  );
}

/**
 * True si l’URL ressemble à un callback Supabase (tokens, code PKCE, ou erreur OAuth).
 */
export function isLikelySupabaseAuthCallbackUrl(url: string | null | undefined): boolean {
  const raw = String(url ?? '').trim();
  if (!raw) return false;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return false;
  }
  const params = parseParametersFromURL(raw);
  return hasSupabaseAuthSignals(params);
}

let lastConsumedAuthUrl: string | null = null;

export type HandleSupabaseAuthDeepLinkResult =
  | { consumed: false }
  | { consumed: true; navigateTo: Href | null; errorMessage?: string };

function postAuthDestination(
  redirectRaw: string | undefined,
  contactRaw: string | undefined
): Href {
  const safe = getSafeRedirect(redirectRaw);
  const contact =
    contactRaw && isSellerContactAction(contactRaw) ? contactRaw : undefined;
  return buildPostAuthHref(safe ?? undefined, contact);
}

/**
 * Parse l’URL, hydrate la session si besoin, retourne la destination Expo Router.
 * `navigateTo === null` : URL déjà traitée (doublon) — ne pas naviguer.
 */
export async function handleSupabaseAuthDeepLink(
  url: string | null | undefined
): Promise<HandleSupabaseAuthDeepLinkResult> {
  const raw = String(url ?? '').trim();
  if (!raw) return { consumed: false };

  if (lastConsumedAuthUrl === raw) {
    return { consumed: true, navigateTo: null };
  }

  if (!isLikelySupabaseAuthCallbackUrl(raw)) {
    return { consumed: false };
  }

  const params = parseParametersFromURL(raw);
  if (!hasSupabaseAuthSignals(params)) {
    return { consumed: false };
  }

  const ctx = extractRedirectContextFromCallbackUrl(raw);
  const dest = postAuthDestination(ctx.redirect, ctx.contact);

  if (params.error || params.error_description) {
    lastConsumedAuthUrl = raw;
    const msg = params.error_description || params.error || 'Erreur de connexion';
    if (__DEV__) {
      console.warn('[auth/deep-link]', msg, params.error_code);
    }
    return { consumed: true, navigateTo: dest, errorMessage: msg };
  }

  try {
    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) {
        lastConsumedAuthUrl = raw;
        return { consumed: true, navigateTo: dest, errorMessage: error.message };
      }
      if (!data.session) {
        lastConsumedAuthUrl = raw;
        return { consumed: true, navigateTo: dest };
      }
    } else if (params.access_token && params.refresh_token) {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user) {
        lastConsumedAuthUrl = raw;
        return { consumed: true, navigateTo: dest };
      }
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) {
        lastConsumedAuthUrl = raw;
        return { consumed: true, navigateTo: dest, errorMessage: error.message };
      }
    } else {
      return { consumed: false };
    }

    lastConsumedAuthUrl = raw;
    return { consumed: true, navigateTo: dest };
  } catch (e) {
    lastConsumedAuthUrl = raw;
    const msg = e instanceof Error ? e.message : 'Session invalide';
    return { consumed: true, navigateTo: dest, errorMessage: msg };
  }
}
