/**
 * Classification des résultats fournisseur — pas de retry aveugle après timeout.
 */

export type ProviderSendResult =
  | { kind: 'ok'; messageId: string }
  | { kind: 'rejected'; status: number; error: string; retryable: boolean }
  | { kind: 'uncertain'; error: string };

export type LifecycleSendOutcome = 'sent' | 'failed' | 'uncertain' | 'released';

/**
 * Timeout / network après que la requête a pu atteindre Resend → uncertain.
 * Erreurs HTTP claires avant acceptation → failed (retryable selon status).
 */
export function classifyProviderSendResult(
  result: ProviderSendResult
): { outcome: LifecycleSendOutcome; retryable: boolean; messageId?: string; error?: string } {
  if (result.kind === 'ok') {
    return { outcome: 'sent', retryable: false, messageId: result.messageId };
  }
  if (result.kind === 'uncertain') {
    return { outcome: 'uncertain', retryable: false, error: result.error };
  }
  return {
    outcome: result.retryable ? 'failed' : 'failed',
    retryable: result.retryable,
    error: result.error,
  };
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Si le client a déjà envoyé la requête HTTP et que l’attente expire,
 * on ne peut pas savoir si Resend a accepté le message → uncertain.
 */
export function resultFromTransportFailure(args: {
  requestLikelySent: boolean;
  errorMessage: string;
}): ProviderSendResult {
  if (args.requestLikelySent) {
    return { kind: 'uncertain', error: args.errorMessage };
  }
  return {
    kind: 'rejected',
    status: 0,
    error: args.errorMessage,
    retryable: true,
  };
}
