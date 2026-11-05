import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const sync = resolve('scripts/sync-android-app-links.mjs');
const assert = resolve('scripts/assert-android-app-links.mjs');
const appJson = readFileSync('app.json');
const qa = {
 APP_ENV: 'preview', EXPO_PUBLIC_APP_ENV: 'preview',
 YOUMBIA_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
 EXPO_PUBLIC_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
 EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
 EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-only',
};
describe('native manifest and isolated QA build integration', () => {
 it.each(['production', 'preview'])('synchronizes only the allowed HTTPS claims for %s', variant => {
  const dir = mkdtempSync(join(tmpdir(), 'ymb-next-native-'));
  try {
   mkdirSync(join(dir, 'android/app/src/main'), { recursive: true });
   writeFileSync(join(dir, 'app.json'), appJson);
   const manifest = join(dir, 'android/app/src/main/AndroidManifest.xml');
   writeFileSync(manifest, '<manifest><application><activity android:name=".MainActivity"><intent-filter><data android:scheme="youmbiamobile-qa"/></intent-filter>\n<intent-filter android:autoVerify="true"><data android:scheme="https" android:host="www.youmbia.com"/></intent-filter></activity></application></manifest>');
   writeFileSync(join(dir, 'android/app/build.gradle'), 'android { defaultConfig { applicationId "com.youmbia.mobile.dev" } }');
   const env = { ...process.env, ...(variant === 'preview' ? qa : { APP_ENV: 'production', EXPO_PUBLIC_APP_ENV: 'production' }) };
   execFileSync(process.execPath, [sync], { cwd: dir, env });
   expect(spawnSync(process.execPath, [assert], { cwd: dir, env }).status).toBe(0);
   expect(readFileSync(manifest, 'utf8').includes('android:scheme="https"')).toBe(variant === 'production');
   if (variant === 'preview') {
    writeFileSync(join(dir, 'android/app/build.gradle'), 'applicationId "com.youmbia.mobile"');
    expect(spawnSync(process.execPath, [assert], { cwd: dir, env }).status).toBe(1);
   }
  } finally { rmSync(dir, { recursive: true, force: true }); }
 });
});
