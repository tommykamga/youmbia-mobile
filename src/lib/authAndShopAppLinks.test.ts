import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import appConfig from '../../app.json';

const REQUIRED_PREFIXES = ['/annonce', '/shop', '/auth/confirm', '/auth/callback'] as const;

describe('TOM-104 Auth / Shop App Links', () => {
  it('déclare les hôtes iOS apex et www', () => {
    expect(appConfig.expo.ios.associatedDomains).toContain('applinks:www.youmbia.com');
    expect(appConfig.expo.ios.associatedDomains).toContain('applinks:youmbia.com');
  });

  it('préserve annonce, boutique, auth/confirm et auth/callback sur chaque hôte Android', () => {
    const paths = appConfig.expo.android.intentFilters[0].data;
    expect(appConfig.expo.android.intentFilters[0].autoVerify).toBe(true);
    for (const host of ['www.youmbia.com', 'youmbia.com']) {
      for (const prefix of REQUIRED_PREFIXES) {
        expect(
          paths.some((x) => x.host === host && x.scheme === 'https' && x.pathPrefix === prefix)
        ).toBe(true);
      }
    }
  });

  it('si android/ local existe (upload EAS), Manifest natif suit app.json', () => {
    const manifestPath = resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
    if (!existsSync(manifestPath)) {
      // CI sans dossier natif : EAS CNG régénère depuis app.json.
      return;
    }
    const xml = readFileSync(manifestPath, 'utf8');
    expect(xml).toMatch(/android:autoVerify\s*=\s*"true"/);
    for (const host of ['www.youmbia.com', 'youmbia.com']) {
      for (const prefix of REQUIRED_PREFIXES) {
        const pairOk =
          xml.includes(`android:host="${host}"`) &&
          xml.includes(`android:pathPrefix="${prefix}"`) &&
          new RegExp(
            `<data\\b[^>]*android:host="${host}"[^>]*android:pathPrefix="${prefix}"[^>]*/>|<data\\b[^>]*android:pathPrefix="${prefix}"[^>]*android:host="${host}"[^>]*/>`
          ).test(xml);
        expect(pairOk).toBe(true);
      }
    }
  });
});
