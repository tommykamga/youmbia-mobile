import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { getAppVariant } = require('../../config/app-variant.js');
const expo = require('../../app.json').expo;
const qaEnv = {
  YOUMBIA_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
  EXPO_PUBLIC_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-only',
  QA_PUSH_CREDENTIALS_VERIFIED: 'true',
  QA_FIREBASE_PROJECT_ID: 'synthetic-only',
  YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID: 'synthetic-production',
};
const script = resolve('scripts/prepare-google-services.js');

describe('Firebase matches the effective Expo variant without disabling validation', () => {
  for (const variant of ['development', 'preview', 'production']) {
    for (const client of ['com.youmbia.mobile.dev', 'com.youmbia.mobile']) {
      it(`${variant} ${client === (variant !== 'production' ? 'com.youmbia.mobile.dev' : 'com.youmbia.mobile') ? 'accepts' : 'rejects'} ${client}`, () => {
        const dir = mkdtempSync(join(tmpdir(), 'link01-firebase-'));
        try {
          const file = join(dir, 'google-services.json');
          writeFileSync(file, JSON.stringify({ project_info: { project_id: 'synthetic-only' }, client: [{ client_info: { android_client_info: { package_name: client } } }] }));
          const env = { ...process.env, ...qaEnv, APP_ENV: variant, EXPO_PUBLIC_APP_ENV: variant, EAS_BUILD_PLATFORM: 'android', GOOGLE_SERVICES_JSON: file };
          const result = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' });
          expect(result.status).toBe(client === getAppVariant(expo, env).androidPackage ? 0 : 1);
          if (result.status) expect(result.stderr).toContain('has no Android client');
        } finally { rmSync(dir, { recursive: true, force: true }); }
      });
    }
  }
  it('fails closed on missing or malformed credentials', () => {
    const env = { ...process.env, ...qaEnv, APP_ENV: 'development', EXPO_PUBLIC_APP_ENV: 'development', EAS_BUILD_PLATFORM: 'android', GOOGLE_SERVICES_JSON: '' };
    expect(spawnSync(process.execPath, [script], { env }).status).toBe(1);
    const dir = mkdtempSync(join(tmpdir(), 'link01-firebase-'));
    try {
      const file = join(dir, 'invalid.json'); writeFileSync(file, '{');
      expect(spawnSync(process.execPath, [script], { env: { ...env, GOOGLE_SERVICES_JSON: file } }).status).toBe(1);
      expect(execFileSync(process.execPath, ['-e', "const c=require('./app.config')({config:{}}); console.log(c.android.package)"], { env: { ...env, EAS_BUILD_PLATFORM: '', GOOGLE_SERVICES_JSON: '' }, encoding: 'utf8' }).trim()).toBe('com.youmbia.mobile.dev');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

it.each(['development', 'preview', 'production'])('keeps %s Expo identities and native links consistent', (variant) => {
  const env = { ...process.env, ...qaEnv, APP_ENV: variant, EXPO_PUBLIC_APP_ENV: variant };
  const config = JSON.parse(execFileSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./app.config')({config:{}})))"], { env, encoding: 'utf8' }));
  expect(config.scheme).toBe(variant === 'development' ? 'youmbiamobile-dev' : variant === 'preview' ? 'youmbiamobile-qa' : 'youmbiamobile');
  expect(config.ios.bundleIdentifier).toBe(config.android.package);
  if (variant === 'production') {
    expect(config.android.intentFilters).toEqual(expo.android.intentFilters);
    expect(config.ios.associatedDomains).toEqual(expo.ios.associatedDomains);
  } else {
    expect(config.android.intentFilters).toEqual([]);
    expect(config.ios.associatedDomains).toEqual([]);
    expect(config.extra.eas.projectId).toBe(qaEnv.YOUMBIA_EAS_PROJECT_ID);
  }
});
