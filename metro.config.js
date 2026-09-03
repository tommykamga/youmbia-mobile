const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.assetExts = config.resolver.assetExts ?? [];

// Needed for expo-sqlite Web (wa-sqlite.wasm) when bundling with Metro.
// SVG en asset pour `expo-image` + `require()` (logo header brandé).
for (const ext of ['wasm', 'svg']) {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
}

module.exports = config;

