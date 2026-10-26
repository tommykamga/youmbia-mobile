#!/usr/bin/env node
/**
 * Vérifie le Manifest *embarqué* dans un APK (preuve post-EAS).
 * Usage: node scripts/assert-apk-app-links.mjs /path/to/app.apk
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const REQUIRED_PREFIXES = ['/annonce', '/shop', '/auth/confirm', '/auth/callback'];
const REQUIRED_HOSTS = ['www.youmbia.com', 'youmbia.com'];

const apkPath = resolve(process.argv[2] || '');
if (!apkPath || !existsSync(apkPath)) {
  console.error('Usage: node scripts/assert-apk-app-links.mjs <app.apk>');
  process.exit(1);
}

function findAapt2() {
  const root = join(homedir(), 'Library/Android/sdk/build-tools');
  if (!existsSync(root)) return null;
  const versions = readdirSync(root).sort();
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const candidate = join(root, versions[i], 'aapt2');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const aapt2 = findAapt2();
if (!aapt2) {
  console.error('[assert-apk-app-links] aapt2 introuvable');
  process.exit(1);
}

const dumped = spawnSync(aapt2, ['dump', 'xmltree', apkPath, '--file', 'AndroidManifest.xml'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (dumped.status !== 0) {
  console.error(dumped.stderr || dumped.stdout);
  process.exit(1);
}
const tree = dumped.stdout;

const missing = [];
if (!/autoVerify/.test(tree) && !/android:autoVerify/.test(tree)) {
  // aapt2 may print as attribute name= value=
  if (!/autoVerify.*"true"/s.test(tree) && !/name\(.*\)="android:autoVerify"[\s\S]{0,80}"true"/.test(tree)) {
    // softer: look for Raw autoVerify
    if (!tree.includes('autoVerify')) {
      missing.push('autoVerify');
    }
  }
}

for (const prefix of REQUIRED_PREFIXES) {
  if (!tree.includes(`"${prefix}"`)) {
    missing.push(`pathPrefix ${prefix}`);
  }
}
for (const host of REQUIRED_HOSTS) {
  if (!tree.includes(`"${host}"`)) {
    missing.push(`host ${host}`);
  }
}

if (missing.length) {
  console.error('[assert-apk-app-links] FAIL — APK hors contrat:');
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log('[assert-apk-app-links] PASS — pathPrefix + hosts présents dans l’APK.');
