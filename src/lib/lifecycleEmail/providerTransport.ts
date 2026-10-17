/**
 * Résolution fail-closed du transport fournisseur lifecycle email.
 * dry_run (défaut) | mock (lab isolé) | live (api.resend.com uniquement).
 * En isolation test, api.resend.com est toujours refusé.
 */

export type LifecycleTransportMode = 'dry_run' | 'mock' | 'live';

export type LifecycleProviderTransport =
  | { mode: 'dry_run' }
  | { mode: 'mock'; baseUrl: string }
  | { mode: 'live'; baseUrl: string }
  | { mode: 'blocked'; error: string };

export type LifecycleProviderTransportEnv = {
  allowLive?: string;
  dryRun?: string;
  dryRunAlias?: string;
  transport?: string;
  isolation?: string;
  baseUrl?: string;
  liveProvider?: string;
};

const LIVE_RESEND_BASE = 'https://api.resend.com';

export function isRealResendHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'api.resend.com' || h === 'resend.com' || h.endsWith('.resend.com');
}

export function isAllowedMockBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (url.pathname !== '/' && url.pathname !== '') return false;
  if (url.search || url.hash) return false;

  const host = url.hostname.toLowerCase();
  if (isRealResendHostname(host)) return false;
  if (host.includes('supabase')) return false;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // Noms Docker internes (ex. youmbia_resend_mock_04d)
  if (/^[a-z0-9][a-z0-9_-]{0,62}$/.test(host)) return true;
  return false;
}

export function resolveLifecycleProviderTransport(
  env: LifecycleProviderTransportEnv = {}
): LifecycleProviderTransport {
  const allowLive = String(env.allowLive ?? '').toLowerCase() === 'true';
  const dryRunFlag =
    String(env.dryRun ?? '').toLowerCase() === 'true' ||
    String(env.dryRunAlias ?? '').toLowerCase() === 'true';
  const transport = String(env.transport ?? '').toLowerCase().trim();
  const isolation = String(env.isolation ?? '').toLowerCase().trim();
  const isolated = isolation === 'test' || isolation === 'lab' || isolation === 'e2e';
  const baseRaw = String(env.baseUrl ?? '').trim().replace(/\/$/, '');
  const liveProvider = String(env.liveProvider ?? '').toLowerCase() === 'true';

  // Défaut fail-closed : pas d’envoi fournisseur.
  if (!allowLive || dryRunFlag || transport === 'dry_run') {
    return { mode: 'dry_run' };
  }

  // ALLOW_LIVE sans mode explicite → bloqué (pas de fallback api.resend.com).
  if (transport !== 'mock' && transport !== 'live') {
    return { mode: 'blocked', error: 'transport_mode_required_when_allow_live' };
  }

  if (transport === 'mock' || isolated) {
    if (transport === 'live' && isolated) {
      return { mode: 'blocked', error: 'live_blocked_in_test_isolation' };
    }
    if (!baseRaw) {
      return { mode: 'blocked', error: 'mock_base_url_required' };
    }
    if (!isAllowedMockBaseUrl(baseRaw)) {
      return { mode: 'blocked', error: 'mock_base_url_not_allowed' };
    }
    try {
      if (isRealResendHostname(new URL(baseRaw).hostname)) {
        return { mode: 'blocked', error: 'real_resend_blocked_in_mock_or_test' };
      }
    } catch {
      return { mode: 'blocked', error: 'mock_base_url_not_allowed' };
    }
    return { mode: 'mock', baseUrl: baseRaw };
  }

  // live
  if (isolated) {
    return { mode: 'blocked', error: 'live_blocked_in_test_isolation' };
  }
  if (!liveProvider) {
    return { mode: 'blocked', error: 'live_provider_flag_required' };
  }
  const liveBase = baseRaw || LIVE_RESEND_BASE;
  if (liveBase !== LIVE_RESEND_BASE) {
    return { mode: 'blocked', error: 'live_base_url_must_be_api_resend_com' };
  }
  return { mode: 'live', baseUrl: liveBase };
}
