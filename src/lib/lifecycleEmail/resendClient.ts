/**
 * Client Resend lifecycle — mode test = aucun appel réseau.
 * Ne partage pas les flux Auth web (auth-email-links).
 */

import {
  isAllowedMockBaseUrl,
  isRealResendHostname,
  resolveLifecycleProviderTransport,
} from './providerTransport';
import {
  isRetryableHttpStatus,
  resultFromTransportFailure,
  type ProviderSendResult,
} from './uncertainSend';

export type LifecycleResendSendInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

export type LifecycleResendClientOptions = {
  apiKey: string;
  /** true = aucun fetch ; succès simulé avec id mock */
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** mock | live — requis si dryRun=false */
  transport?: 'mock' | 'live';
  isolation?: string;
  liveProvider?: boolean;
};

export function createLifecycleResendClient(options: LifecycleResendClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolved = resolveLifecycleProviderTransport({
    allowLive: options.dryRun ? 'false' : 'true',
    dryRun: options.dryRun ? 'true' : 'false',
    transport: options.dryRun ? 'dry_run' : (options.transport ?? ''),
    isolation: options.isolation ?? '',
    baseUrl: options.baseUrl ?? '',
    liveProvider: options.liveProvider ? 'true' : '',
  });

  return {
    async sendEmail(input: LifecycleResendSendInput): Promise<ProviderSendResult> {
      if (resolved.mode === 'dry_run') {
        return {
          kind: 'ok',
          messageId: `dry_run_${Date.now()}`,
        };
      }

      if (resolved.mode === 'blocked') {
        return {
          kind: 'rejected',
          status: 403,
          error: resolved.error,
          retryable: false,
        };
      }

      const baseUrl = resolved.baseUrl;
      if (resolved.mode === 'mock' && !isAllowedMockBaseUrl(baseUrl)) {
        return {
          kind: 'rejected',
          status: 403,
          error: 'mock_base_url_not_allowed',
          retryable: false,
        };
      }
      if (resolved.mode === 'mock' && isRealResendHostname(new URL(baseUrl).hostname)) {
        return {
          kind: 'rejected',
          status: 403,
          error: 'real_resend_blocked_in_mock_or_test',
          retryable: false,
        };
      }

      if (!options.apiKey || options.apiKey === 'test' || options.apiKey.startsWith('mock_')) {
        // Garde-fou : pas d’appel réel sans clé prod explicite hors dryRun.
        return {
          kind: 'rejected',
          status: 401,
          error: 'resend_api_key_blocked_in_safe_mode',
          retryable: false,
        };
      }

      let requestLikelySent = false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        requestLikelySent = true;
        const resp = await fetchImpl(`${baseUrl}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
            headers: input.headers,
            tags: input.tags,
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => 'resend_http_error');
          return {
            kind: 'rejected',
            status: resp.status,
            error: errText.slice(0, 500),
            retryable: isRetryableHttpStatus(resp.status),
          };
        }

        const json = (await resp.json()) as { id?: string };
        if (!json.id) {
          return {
            kind: 'uncertain',
            error: 'resend_ok_without_id',
          };
        }
        return { kind: 'ok', messageId: json.id };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'resend_transport_error';
        return resultFromTransportFailure({
          requestLikelySent,
          errorMessage: message,
        });
      }
    },
  };
}

export type LifecycleResendClient = ReturnType<typeof createLifecycleResendClient>;
