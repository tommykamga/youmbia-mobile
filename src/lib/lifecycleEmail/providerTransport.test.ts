import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isAllowedMockBaseUrl,
  resolveLifecycleProviderTransport,
} from './providerTransport';

describe('lifecycle providerTransport (fail-closed)', () => {
  it('défaut / sans ALLOW_LIVE → dry_run', () => {
    expect(resolveLifecycleProviderTransport({})).toEqual({ mode: 'dry_run' });
    expect(
      resolveLifecycleProviderTransport({ allowLive: 'false', transport: 'live' })
    ).toEqual({ mode: 'dry_run' });
  });

  it('ALLOW_LIVE hérité sans TRANSPORT → blocked (pas de fallback Resend)', () => {
    const r = resolveLifecycleProviderTransport({ allowLive: 'true' });
    expect(r).toEqual({
      mode: 'blocked',
      error: 'transport_mode_required_when_allow_live',
    });
  });

  it('mock refuse api.resend.com même si ALLOW_LIVE', () => {
    const r = resolveLifecycleProviderTransport({
      allowLive: 'true',
      transport: 'mock',
      isolation: 'test',
      baseUrl: 'https://api.resend.com',
    });
    expect(r.mode).toBe('blocked');
  });

  it('mock accepte URL Docker http interne', () => {
    const r = resolveLifecycleProviderTransport({
      allowLive: 'true',
      transport: 'mock',
      isolation: 'test',
      baseUrl: 'http://youmbia_resend_mock_04d:9000',
    });
    expect(r).toEqual({
      mode: 'mock',
      baseUrl: 'http://youmbia_resend_mock_04d:9000',
    });
  });

  it('live exige LIVE_PROVIDER et URL canonique', () => {
    expect(
      resolveLifecycleProviderTransport({
        allowLive: 'true',
        transport: 'live',
      })
    ).toEqual({ mode: 'blocked', error: 'live_provider_flag_required' });

    expect(
      resolveLifecycleProviderTransport({
        allowLive: 'true',
        transport: 'live',
        liveProvider: 'true',
        baseUrl: 'https://evil.example',
      })
    ).toEqual({ mode: 'blocked', error: 'live_base_url_must_be_api_resend_com' });

    expect(
      resolveLifecycleProviderTransport({
        allowLive: 'true',
        transport: 'live',
        liveProvider: 'true',
      })
    ).toEqual({ mode: 'live', baseUrl: 'https://api.resend.com' });
  });

  it('isolation test bloque live', () => {
    expect(
      resolveLifecycleProviderTransport({
        allowLive: 'true',
        transport: 'live',
        liveProvider: 'true',
        isolation: 'test',
      })
    ).toEqual({ mode: 'blocked', error: 'live_blocked_in_test_isolation' });
  });

  it('isAllowedMockBaseUrl refuse HTTPS / hosts cloud', () => {
    expect(isAllowedMockBaseUrl('http://youmbia_resend_mock_04d:9000')).toBe(true);
    expect(isAllowedMockBaseUrl('https://api.resend.com')).toBe(false);
    expect(isAllowedMockBaseUrl('http://api.resend.com')).toBe(false);
    expect(isAllowedMockBaseUrl('http://xyz.supabase.co')).toBe(false);
  });

  it('miroir Edge _shared identique (pas de dérive)', () => {
    const src = readFileSync(
      resolve(__dirname, './providerTransport.ts'),
      'utf8'
    );
    const edge = readFileSync(
      resolve(
        __dirname,
        '../../../supabase/functions/_shared/providerTransport.ts'
      ),
      'utf8'
    );
    expect(edge).toBe(src);
  });
});
