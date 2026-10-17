import { describe, expect, it } from 'vitest';
import {
  classifyProviderSendResult,
  resultFromTransportFailure,
} from './uncertainSend';

describe('uncertain send', () => {
  it('timeout après requête envoyée → uncertain sans retry', () => {
    const raw = resultFromTransportFailure({
      requestLikelySent: true,
      errorMessage: 'AbortError',
    });
    expect(raw.kind).toBe('uncertain');
    const classified = classifyProviderSendResult(raw);
    expect(classified.outcome).toBe('uncertain');
    expect(classified.retryable).toBe(false);
  });

  it('échec avant envoi → rejected retryable', () => {
    const raw = resultFromTransportFailure({
      requestLikelySent: false,
      errorMessage: 'ENOTFOUND',
    });
    expect(raw.kind).toBe('rejected');
    if (raw.kind === 'rejected') expect(raw.retryable).toBe(true);
  });

  it('ok avec message id → sent', () => {
    expect(classifyProviderSendResult({ kind: 'ok', messageId: 're_1' })).toEqual({
      outcome: 'sent',
      retryable: false,
      messageId: 're_1',
    });
  });
});
