import { describe, expect, it, vi } from 'vitest';
import { createLifecycleResendClient } from './resendClient';

describe('lifecycle resend client', () => {
  it('dryRun n’appelle jamais fetch', async () => {
    const fetchImpl = vi.fn();
    const client = createLifecycleResendClient({
      apiKey: 're_live_should_not_matter',
      dryRun: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.sendEmail({
      from: 'YOUMBIA <no-reply@mail.youmbia.com>',
      to: 'test@example.com',
      subject: 'x',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.kind).toBe('ok');
  });

  it('bloque les clés mock sans dryRun (pas d’appel réel)', async () => {
    const fetchImpl = vi.fn();
    const client = createLifecycleResendClient({
      apiKey: 'mock_test_key',
      dryRun: false,
      transport: 'mock',
      isolation: 'test',
      baseUrl: 'http://youmbia_resend_mock_04d:9000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.sendEmail({
      from: 'YOUMBIA <no-reply@mail.youmbia.com>',
      to: 'test@example.com',
      subject: 'x',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'rejected', retryable: false });
  });

  it('ALLOW_LIVE sans transport → aucun fetch (fail-closed)', async () => {
    const fetchImpl = vi.fn();
    const client = createLifecycleResendClient({
      apiKey: 're_should_not_matter',
      dryRun: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.sendEmail({
      from: 'YOUMBIA <no-reply@mail.youmbia.com>',
      to: 'test@example.com',
      subject: 'x',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: 'rejected',
      error: 'transport_mode_required_when_allow_live',
    });
  });

  it('mock vers api.resend.com → aucun fetch', async () => {
    const fetchImpl = vi.fn();
    const client = createLifecycleResendClient({
      apiKey: 're_test_isolated_not_live',
      dryRun: false,
      transport: 'mock',
      isolation: 'test',
      baseUrl: 'https://api.resend.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.sendEmail({
      from: 'YOUMBIA <no-reply@mail.youmbia.com>',
      to: 'test@example.com',
      subject: 'x',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.kind).toBe('rejected');
  });
});
