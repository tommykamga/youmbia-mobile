#!/usr/bin/env node
/**
 * Garde-fou TOM-104 : échoue si le Manifest android/ effectif (uploadé EAS)
 * ne respecte pas le contrat App Links de app.json.
 *
 * Contrat : autoVerify=true + chaque couple host×pathPrefix
 * (/annonce, /shop, /auth/confirm, /auth/callback) × (www|apex).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_PREFIXES = ['/annonce', '/shop', '/auth/confirm', '/auth/callback'];
const REQUIRED_HOSTS = ['www.youmbia.com', 'youmbia.com'];

const root = resolve(process.cwd());
const appJson = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
const filter = appJson?.expo?.android?.intentFilters?.[0];
const required = (filter?.data ?? [])
  .filter((d) => d.scheme === 'https' && d.host && d.pathPrefix)
  .map((d) => ({ host: d.host, pathPrefix: d.pathPrefix }));

for (const prefix of REQUIRED_PREFIXES) {
  for (const host of REQUIRED_HOSTS) {
    if (!required.some((d) => d.host === host && d.pathPrefix === prefix)) {
      console.error(`[assert-android-app-links] app.json incomplet: ${host}${prefix}`);
      process.exit(1);
    }
  }
}

if (filter?.autoVerify !== true) {
  console.error('[assert-android-app-links] app.json intentFilters[0].autoVerify !== true');
  process.exit(1);
}

const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
if (!existsSync(manifestPath)) {
  console.log(
    '[assert-android-app-links] pas de android/ local — EAS CNG régénérera depuis app.json (OK).'
  );
  process.exit(0);
}

const xml = readFileSync(manifestPath, 'utf8');
const missing = [];

if (!/android:autoVerify\s*=\s*"true"/.test(xml)) {
  missing.push('autoVerify=true');
}

for (const { host, pathPrefix } of required) {
  // Exige une balise <data> portant host ET pathPrefix ensemble.
  const pairRe = new RegExp(
    `<data\\b[^>]*android:host="${escapeRegExp(host)}"[^>]*android:pathPrefix="${escapeRegExp(pathPrefix)}"[^>]*/>|<data\\b[^>]*android:pathPrefix="${escapeRegExp(pathPrefix)}"[^>]*android:host="${escapeRegExp(host)}"[^>]*/>`
  );
  if (!pairRe.test(xml)) {
    missing.push(`${host}${pathPrefix}`);
  }
}

if (missing.length) {
  console.error('[assert-android-app-links] FAIL — Manifest natif hors contrat:');
  for (const m of missing) console.error(`  - ${m}`);
  console.error('Lancer: npm run sync:android-app-links');
  process.exit(1);
}

console.log(
  `[assert-android-app-links] PASS — ${required.length} couples host/path + autoVerify.`
);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
