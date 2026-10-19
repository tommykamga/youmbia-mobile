/**
 * Finalisation session Supabase depuis une URL de retour (Magic Link HTTPS, OAuth, recovery).
 * Le client RN utilise detectSessionInUrl: false et GoTrueClient._getSessionFromURL exige un
 * navigateur — on reproduit donc le parsing (hash + query) et on appelle les API publiques
 * verifyOtp / setSession / exchangeCodeForSession.
 *
 * @see https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 */

import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';
import { captureAuthSuccess } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { buildLoginHref, buildPostAuthHref } from '@/lib/authRedirect';
import { isSellerContactAction } from '@/lib/sellerContact';

const YOUMBIA_AUTH_HOSTS = new Set(['www.youmbia.com', 'youmbia.com']);
/** Entrée e-mail Supabase (templates) — App Links Android + AASA iOS (PR Web #11). */
const MAGIC_LINK_CONFIRM_PATH = '/auth/confirm';
/**
 * Callback Web unique (OTP / session). Les e-mails Web et le 307 depuis /auth/confirm
 * aboutissent ici ; le mobile doit pouvoir finaliser sans passer par le navigateur.
 */
const MAGIC_LINK_CALLBACK_PATH = '/auth/callback';
const MAGIC_LINK_OTP_TYPES = new Set(['magiclink', 'email']);

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

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function isYoumbiaHttpsAuthHost(parsed: URL): boolean {
  return (
    parsed.protocol === 'https:' && YOUMBIA_AUTH_HOSTS.has(parsed.hostname.toLowerCase())
  );
}

/**
 * URL HTTPS YOUMBIA Magic Link : `/auth/confirm` (entrée e-mail) ou `/auth/callback`
 * avec `token_hash` (callback Web / 307). Rejette tout hôte externe.
 */
export function isYoumbiaMagicLinkConfirmUrl(url: string | null | undefined): boolean {
  const raw = String(url ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!isYoumbiaHttpsAuthHost(parsed)) return false;
    const path = normalizePathname(parsed.pathname).toLowerCase();
    if (path === MAGIC_LINK_CONFIRM_PATH) return true;
    if (path !== MAGIC_LINK_CALLBACK_PATH) return false;
    // Callback : uniquement les OTP e-mail (pas OAuth `code` seul).
    const params = parseParametersFromURL(raw);
    return Boolean((params.token_hash ?? '').trim());
  } catch {
    return false;
  }
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

/** Après échec OAuth ou échec de finalisation session : login avec redirect/contact conservés. */
function buildAuthRecoveryHref(redirect?: string, contact?: string): Href {
  return buildLoginHref(redirect, contact) as Href;
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
 * True si l’URL ressemble à un callback Supabase custom-scheme (tokens, code PKCE, ou erreur OAuth).
 * Les URL HTTPS ne passent pas ici — Magic Link HTTPS a son propre chemin.
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

function safeAuthErrorMessage(error: { message?: string } | null | undefined, fallback: string): string {
  const msg = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!msg) return fallback;
  // Ne jamais renvoyer un message qui pourrait contenir un secret d’URL.
  if (/token_hash|access_token|refresh_token/i.test(msg)) {
    return fallback;
  }
  return msg;
}

function warnAuthDeepLink(message: string, code?: string): void {
  if (__DEV__) {
    console.warn('[auth/deep-link]', message, code ?? '');
  }
}

let lastConsumedAuthKey: string | null = null;
const inFlightByKey = new Map<string, Promise<HandleSupabaseAuthDeepLinkResult>>();

/**
 * Clé anti-doublon : Magic Link = token_hash (hôte www/apex équivalents) ;
 * OAuth/PKCE = URL brute.
 */
export function authDeepLinkDedupKey(raw: string): string {
  if (isYoumbiaMagicLinkConfirmUrl(raw)) {
    const params = parseParametersFromURL(raw);
    const tokenHash = (params.token_hash ?? '').trim();
    if (tokenHash) {
      return `magiclink:${tokenHash}`;
    }
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      return `confirm:${host}${normalizePathname(u.pathname).toLowerCase()}?${u.searchParams.toString()}`;
    } catch {
      return raw;
    }
  }
  return raw;
}

function markConsumed(key: string): void {
  lastConsumedAuthKey = key;
}

/** Reset interne pour tests unitaires (doublons / concurrence). */
export function resetSupabaseAuthDeepLinkStateForTests(): void {
  lastConsumedAuthKey = null;
  inFlightByKey.clear();
}

export type HandleSupabaseAuthDeepLinkResult =
  | { consumed: false }
  | { consumed: true; navigateTo: Href | null; errorMessage?: string };

function isExpiredOrUsedOtpError(error: { message?: string; code?: string }): boolean {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (/otp_expired|token_expired/i.test(code)) return true;
  return /expired|already.?used/i.test(message);
}

async function finalizeMagicLinkConfirm(
  raw: string,
  params: Record<string, string>,
  dedupKey: string
): Promise<HandleSupabaseAuthDeepLinkResult> {
  const ctx = extractRedirectContextFromCallbackUrl(raw);
  const dest = buildPostAuthHref(ctx.redirect, ctx.contact);
  const recovery = buildAuthRecoveryHref(ctx.redirect, ctx.contact);

  const type = (params.type ?? '').trim().toLowerCase();
  if (!MAGIC_LINK_OTP_TYPES.has(type)) {
    markConsumed(dedupKey);
    warnAuthDeepLink('Magic Link: type non supporté pour ce flux');
    return {
      consumed: true,
      navigateTo: recovery,
      errorMessage: 'Lien de connexion invalide. Demandez un nouveau lien magique.',
    };
  }

  const tokenHash = (params.token_hash ?? '').trim();
  if (!tokenHash) {
    markConsumed(dedupKey);
    warnAuthDeepLink('Magic Link: token_hash absent');
    return {
      consumed: true,
      navigateTo: recovery,
      errorMessage: 'Lien de connexion incomplet. Demandez un nouveau lien magique.',
    };
  }

  // Aligner verifyOtp sur le `type` URL (magiclink | email), comme le callback Web.
  const otpType = type === 'email' ? 'email' : 'magiclink';

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) {
      markConsumed(dedupKey);
      const expired = isExpiredOrUsedOtpError(error);
      warnAuthDeepLink(
        expired ? 'Magic Link: token expiré ou déjà utilisé' : 'Magic Link: verifyOtp échoué',
        error.code
      );
      return {
        consumed: true,
        navigateTo: recovery,
        errorMessage: expired
          ? 'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien magique.'
          : safeAuthErrorMessage(error, 'Connexion impossible. Réessayez.'),
      };
    }

    if (!data.session?.user) {
      markConsumed(dedupKey);
      warnAuthDeepLink('Magic Link: session absente après verifyOtp');
      return {
        consumed: true,
        navigateTo: recovery,
        errorMessage: 'Connexion incomplète. Réessayez.',
      };
    }

    markConsumed(dedupKey);
    void captureAuthSuccess(data.session.user, { method: 'email' });
    return { consumed: true, navigateTo: dest };
  } catch (e) {
    markConsumed(dedupKey);
    const msg = e instanceof Error ? e.message : 'Session invalide';
    warnAuthDeepLink('Magic Link: exception');
    return {
      consumed: true,
      navigateTo: recovery,
      errorMessage: /token_hash|access_token|refresh_token/i.test(msg)
        ? 'Connexion impossible. Réessayez.'
        : msg,
    };
  }
}

async function finalizeOAuthOrPkceCallback(
  raw: string,
  params: Record<string, string>,
  dedupKey: string
): Promise<HandleSupabaseAuthDeepLinkResult> {
  const ctx = extractRedirectContextFromCallbackUrl(raw);
  const dest = buildPostAuthHref(ctx.redirect, ctx.contact);

  if (params.error || params.error_description) {
    markConsumed(dedupKey);
    const msg = params.error_description || params.error || 'Erreur de connexion';
    warnAuthDeepLink(msg, params.error_code);
    return {
      consumed: true,
      navigateTo: buildAuthRecoveryHref(ctx.redirect, ctx.contact),
      errorMessage: msg,
    };
  }

  try {
    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) {
        markConsumed(dedupKey);
        return {
          consumed: true,
          navigateTo: buildAuthRecoveryHref(ctx.redirect, ctx.contact),
          errorMessage: safeAuthErrorMessage(error, 'Connexion impossible. Réessayez.'),
        };
      }
      if (!data.session) {
        markConsumed(dedupKey);
        return {
          consumed: true,
          navigateTo: buildAuthRecoveryHref(ctx.redirect, ctx.contact),
          errorMessage: 'Connexion incomplète. Réessayez.',
        };
      }
      markConsumed(dedupKey);
      if (data.session.user) {
        void captureAuthSuccess(data.session.user, { method: 'email' });
      }
      return { consumed: true, navigateTo: dest };
    }

    if (params.access_token && params.refresh_token) {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user) {
        markConsumed(dedupKey);
        return { consumed: true, navigateTo: dest };
      }
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) {
        markConsumed(dedupKey);
        return {
          consumed: true,
          navigateTo: buildAuthRecoveryHref(ctx.redirect, ctx.contact),
          errorMessage: safeAuthErrorMessage(error, 'Connexion impossible. Réessayez.'),
        };
      }
      markConsumed(dedupKey);
      return { consumed: true, navigateTo: dest };
    }

    return { consumed: false };
  } catch (e) {
    markConsumed(dedupKey);
    const msg = e instanceof Error ? e.message : 'Session invalide';
    return {
      consumed: true,
      navigateTo: buildAuthRecoveryHref(ctx.redirect, ctx.contact),
      errorMessage: /token_hash|access_token|refresh_token/i.test(msg)
        ? 'Connexion impossible. Réessayez.'
        : msg,
    };
  }
}

async function processSupabaseAuthDeepLink(
  raw: string,
  dedupKey: string
): Promise<HandleSupabaseAuthDeepLinkResult> {
  if (isYoumbiaMagicLinkConfirmUrl(raw)) {
    const params = parseParametersFromURL(raw);
    return finalizeMagicLinkConfirm(raw, params, dedupKey);
  }

  if (!isLikelySupabaseAuthCallbackUrl(raw)) {
    return { consumed: false };
  }

  const params = parseParametersFromURL(raw);
  if (!hasSupabaseAuthSignals(params)) {
    return { consumed: false };
  }

  return finalizeOAuthOrPkceCallback(raw, params, dedupKey);
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

  const dedupKey = authDeepLinkDedupKey(raw);

  if (lastConsumedAuthKey === dedupKey) {
    return { consumed: true, navigateTo: null };
  }

  const existing = inFlightByKey.get(dedupKey);
  if (existing) {
    return existing;
  }

  const promise = processSupabaseAuthDeepLink(raw, dedupKey).finally(() => {
    inFlightByKey.delete(dedupKey);
  });
  inFlightByKey.set(dedupKey, promise);
  return promise;
}
