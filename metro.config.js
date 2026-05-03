const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Needed for expo-sqlite Web (wa-sqlite.wasm) when bundling with Metro.
// SVG en asset pour `expo-image` + `require()` (logo header brandé).
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm', 'svg'];

module.exports = config;

