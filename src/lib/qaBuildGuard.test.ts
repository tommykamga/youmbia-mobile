import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveBuildEnvironment, validateGoogleServicesFile } = require(
  '../../scripts/qa-build-guard.cjs',
) as typeof import('../../scripts/qa-build-guard.cjs');

function qaEnvironment(appEnvironment: 'development' | 'preview' = 'development'): Record<string, string | undefined> {
  return {
    APP_ENV: appEnvironment,
    EXPO_PUBLIC_APP_ENV: appEnvironment,
    EXPO_PUBLIC_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key',
    QA_PUSH_CREDENTIALS_VERIFIED: 'true',
    YOUMBIA_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
    EAS_BUILD_PROFILE: appEnvironment,
  };
}

describe('EAS QA build guard', () => {
  it('uses non-production identifiers and separate URL schemes for development and preview', () => {
    expect(resolveBuildEnvironment(qaEnvironment('development'))).toMatchObject({
      androidPackage: 'com.youmbia.mobile.dev',
      iosBundleIdentifier: 'com.youmbia.mobile.dev',
      slug: 'youmbia-mobile-qa',
      scheme: 'youmbiamobile-dev',
      isQa: true,
    });
    expect(resolveBuildEnvironment(qaEnvironment('preview'))).toMatchObject({
      androidPackage: 'com.youmbia.mobile.dev',
      iosBundleIdentifier: 'com.youmbia.mobile.dev',
      slug: 'youmbia-mobile-qa',
      scheme: 'youmbiamobile-qa',
      isQa: true,
    });
  });

  it('keeps production identifiers unchanged', () => {
    expect(resolveBuildEnvironment({
      APP_ENV: 'production',
      EXPO_PUBLIC_APP_ENV: 'production',
      EAS_BUILD_PROFILE: 'production',
    })).toMatchObject({
      androidPackage: 'com.youmbia.mobile',
      iosBundleIdentifier: 'com.youmbia.mobile',
      slug: 'youmbia-mobile',
      scheme: 'youmbiamobile',
      isQa: false,
    });
  });

  it('binds each EAS profile to its matching environment without changing the store profile', () => {
    const eas = JSON.parse(
      readFileSync(path.resolve('eas.json'), 'utf8'),
    ) as { build: Record<string, { environment: string; env: Record<string, string> }> };
    expect(eas.build.development).toMatchObject({
      environment: 'development',
      env: { APP_ENV: 'development', EXPO_PUBLIC_APP_ENV: 'development' },
    });
    expect(eas.build.preview).toMatchObject({
      environment: 'preview',
      env: { APP_ENV: 'preview', EXPO_PUBLIC_APP_ENV: 'preview' },
    });
    expect(eas.build.production).toMatchObject({
      environment: 'production',
      env: { APP_ENV: 'production', EXPO_PUBLIC_APP_ENV: 'production' },
    });
  });

  it('rejects production Supabase and mismatched project URLs', () => {
    const production = qaEnvironment();
    production.EXPO_PUBLIC_SUPABASE_PROJECT_REF = 'ainzxommczlyjhymuwgu';
    production.EXPO_PUBLIC_SUPABASE_URL = 'https://ainzxommczlyjhymuwgu.supabase.co';
    expect(() => resolveBuildEnvironment(production)).toThrow(/production Supabase/);

    const sharedEasProject = qaEnvironment();
    sharedEasProject.YOUMBIA_EAS_PROJECT_ID = '2869afc2-e13f-48b5-8e78-acbe5186934c';
    expect(() => resolveBuildEnvironment(sharedEasProject)).toThrow(/separate from production/);

    const mismatch = qaEnvironment();
    mismatch.EXPO_PUBLIC_SUPABASE_URL = 'https://differentprojectref.supabase.co';
    expect(() => resolveBuildEnvironment(mismatch)).toThrow(/must match/);
  });

  it('fails closed for incomplete or inconsistent QA variables and profiles', () => {
    const missingAnonKey = qaEnvironment();
    delete missingAnonKey.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => resolveBuildEnvironment(missingAnonKey)).toThrow(/ANON_KEY is missing/);

    const unverifiedPush = qaEnvironment();
    unverifiedPush.QA_PUSH_CREDENTIALS_VERIFIED = 'false';
    expect(() => resolveBuildEnvironment(unverifiedPush)).toThrow(/credentials are verified/);

    const mismatchedModes = qaEnvironment();
    mismatchedModes.EXPO_PUBLIC_APP_ENV = 'production';
    expect(() => resolveBuildEnvironment(mismatchedModes)).toThrow(/must match/);

    const mismatchedProfile = qaEnvironment('preview');
    mismatchedProfile.EAS_BUILD_PROFILE = 'development';
    expect(() => resolveBuildEnvironment(mismatchedProfile)).toThrow(/same environment/);
  });

  it('allows local QA config resolution without claiming remote push credentials', () => {
    const local = qaEnvironment();
    delete local.EAS_BUILD_PROFILE;
    delete local.QA_PUSH_CREDENTIALS_VERIFIED;
    expect(resolveBuildEnvironment(local).isQa).toBe(true);

    local.YOUMBIA_EAS_BUILD_PROFILE = 'development';
    expect(() => resolveBuildEnvironment(local)).toThrow(/QA_PUSH_CREDENTIALS_VERIFIED/);
  });

  it('checks the Android Firebase file project and package without printing its contents', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'youmbia-qa-firebase-'));
    const source = path.join(directory, 'google-services.json');
    const env = {
      ...qaEnvironment('development'),
      EAS_BUILD_PLATFORM: 'android',
      GOOGLE_SERVICES_JSON: source,
      QA_FIREBASE_PROJECT_ID: 'youmbia-firebase-qa',
      YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID: 'youmbia-firebase-prod',
    };

    try {
      writeFileSync(source, JSON.stringify({
        project_info: { project_id: 'youmbia-firebase-qa' },
        client: [{ client_info: { android_client_info: { package_name: 'com.youmbia.mobile.dev' } } }],
      }));
      expect(validateGoogleServicesFile(source, env)).toEqual({
        projectId: 'youmbia-firebase-qa',
        packageName: 'com.youmbia.mobile.dev',
      });

      writeFileSync(source, JSON.stringify({
        project_info: { project_id: 'youmbia-firebase-qa' },
        client: [{ client_info: { android_client_info: { package_name: 'com.youmbia.mobile' } } }],
      }));
      expect(() => validateGoogleServicesFile(source, env)).toThrow(/no Android client/);

      writeFileSync(source, JSON.stringify({
        project_info: { project_id: 'youmbia-firebase-prod' },
        client: [{ client_info: { android_client_info: { package_name: 'com.youmbia.mobile.dev' } } }],
      }));
      expect(() => validateGoogleServicesFile(source, env)).toThrow(/does not match QA_FIREBASE/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects Android QA builds when production Firebase is configured as the QA project', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'youmbia-qa-firebase-'));
    const source = path.join(directory, 'google-services.json');
    const env = {
      ...qaEnvironment(),
      EAS_BUILD_PLATFORM: 'android',
      GOOGLE_SERVICES_JSON: source,
      QA_FIREBASE_PROJECT_ID: 'youmbia-firebase-prod',
      YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID: 'youmbia-firebase-prod',
    };

    try {
      writeFileSync(source, JSON.stringify({
        project_info: { project_id: 'youmbia-firebase-prod' },
        client: [{ client_info: { android_client_info: { package_name: 'com.youmbia.mobile.dev' } } }],
      }));
      expect(() => validateGoogleServicesFile(source, env)).toThrow(/must be different/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
