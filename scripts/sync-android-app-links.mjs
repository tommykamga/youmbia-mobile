#!/usr/bin/env node
/**
 * TOM-104 — Synchronise les App Links Android depuis app.json vers
 * android/app/src/main/AndroidManifest.xml.
 *
 * Pourquoi : `/android` est gitignored mais .easignore ne l'exclut PAS.
 * EAS uploade donc le dossier natif local et l'utilise tel quel (pas de CNG).
 * Les intentFilters de app.json ne sont alors PAS réappliqués → Manifest périmé.
 *
 * Stratégie : conserver android/ (personnalisations gradle/kotlin) et
 * réécrire uniquement le bloc App Links HTTPS avant chaque build EAS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const appJsonPath = resolve(root, 'app.json');
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');

const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const filter = appJson?.expo?.android?.intentFilters?.[0];
if (!filter || filter.autoVerify !== true) {
  console.error('[sync-android-app-links] app.json intentFilters[0].autoVerify doit être true');
  process.exit(1);
}

const httpsData = (filter.data ?? []).filter(
  (d) => d.scheme === 'https' && d.host && d.pathPrefix
);
if (httpsData.length === 0) {
  console.error('[sync-android-app-links] aucun pathPrefix https dans app.json');
  process.exit(1);
}

const requiredPrefixes = ['/annonce', '/shop', '/auth/confirm', '/auth/callback'];
for (const prefix of requiredPrefixes) {
  for (const host of ['www.youmbia.com', 'youmbia.com']) {
    const ok = httpsData.some((d) => d.host === host && d.pathPrefix === prefix);
    if (!ok) {
      console.error(`[sync-android-app-links] app.json manque ${host}${prefix}`);
      process.exit(1);
    }
  }
}

if (!existsSync(manifestPath)) {
  console.log(
    '[sync-android-app-links] pas de android/ — rien à patcher (EAS CNG utilisera app.json).'
  );
  process.exit(0);
}

const dataLines = httpsData
  .map(
    (d) =>
      `        <data android:scheme="https" android:host="${d.host}" android:pathPrefix="${d.pathPrefix}"/>`
  )
  .join('\n');

const appLinksBlock = `      <intent-filter android:autoVerify="true" data-generated="true">
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
${dataLines}
      </intent-filter>`;

let xml = readFileSync(manifestPath, 'utf8');

// Remplace tout intent-filter App Links HTTPS existant (autoVerify ou data-generated).
const appLinksRe =
  /\n[ \t]*<intent-filter[^>]*(?:android:autoVerify\s*=\s*"true"|data-generated\s*=\s*"true")[^>]*>[\s\S]*?<\/intent-filter>/g;

const withoutOld = xml.replace(appLinksRe, '');

if (!withoutOld.includes('android:name=".MainActivity"')) {
  console.error('[sync-android-app-links] MainActivity introuvable dans le Manifest');
  process.exit(1);
}

// Insère avant la fermeture de </activity> de MainActivity (premier </activity> après MainActivity).
const mainIdx = withoutOld.indexOf('android:name=".MainActivity"');
const closeActivity = withoutOld.indexOf('</activity>', mainIdx);
if (closeActivity < 0) {
  console.error('[sync-android-app-links] </activity> introuvable après MainActivity');
  process.exit(1);
}

const nextXml =
  withoutOld.slice(0, closeActivity) + `\n${appLinksBlock}\n    ` + withoutOld.slice(closeActivity);

writeFileSync(manifestPath, nextXml, 'utf8');
console.log(
  `[sync-android-app-links] PASS — ${httpsData.length} data https synchronisées (autoVerify=true).`
);
