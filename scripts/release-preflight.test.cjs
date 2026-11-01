const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ignore = require('ignore');
const app = require('../app.json').expo;
const eas = require('../eas.json');
const excluded = ignore().add(fs.readFileSync('.easignore', 'utf8'));
function config(mode, platform) {
  const names = ['APP_ENV', 'EXPO_PUBLIC_APP_ENV', 'EAS_BUILD_PLATFORM', 'GOOGLE_SERVICES_JSON'];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
  try {
    for (const n of names) delete process.env[n];
    process.env.APP_ENV = mode; process.env.EXPO_PUBLIC_APP_ENV = mode;
    if (platform) process.env.EAS_BUILD_PLATFORM = platform;
    delete require.cache[require.resolve('../app.config.js')];
    return require('../app.config.js')({ config: {} });
  } finally { for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
}
test('RC version is 5.0.0 and configured app IDs are profile-specific', () => {
  assert.equal(app.version, '5.0.0');
  assert.equal(config('production').ios.bundleIdentifier, 'com.youmbia.mobile');
  assert.equal(config('production').android.package, 'com.youmbia.mobile');
  assert.equal(config('preview').ios.bundleIdentifier, 'com.youmbia.mobile');
  assert.equal(config('development').ios.bundleIdentifier, 'com.youmbia.mobile.dev');
  assert.equal(config('development').android.package, 'com.youmbia.mobile.dev');
});
test('local secrets, env backups and stale generated native folders are excluded from EAS source', () => {
  for (const p of ['.env', '.env.production', '.env.backup-before-v5', 'ios/YOUMBIADev/Info.plist', 'android/app/build.gradle', 'credentials.json', 'signing.p12', 'key.p8', 'key.pem', 'upload.jks', 'signing.keystore', 'account-firebase-adminsdk-qa.json']) assert.equal(excluded.ignores(p), true, p);
  for (const p of ['app.config.js', 'app.json', 'plugins/with-ios-scene-delegate.js', 'src/lib/canonicalCity.ts']) assert.equal(excluded.ignores(p), false, p);
});
test('Android build refuses absent EAS Google services file instead of bypassing the guard', () => {
  assert.throws(() => config('production', 'android'), /GOOGLE_SERVICES_JSON must be configured/);
});
test('explicit development URL targets QA; production uses its named EAS environment', () => {
  const developmentUrl = eas.build.development.env.EXPO_PUBLIC_SUPABASE_URL;
  if (developmentUrl) assert.equal(new URL(developmentUrl).hostname, 'wagvrytcguutgbjzhvak.supabase.co');
  if (eas.build.development.environment) assert.equal(eas.build.development.environment, 'development');
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.distribution, 'store');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
});
