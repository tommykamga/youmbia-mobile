import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Régression TOM-104 : sans ces fichiers, Expo Router affiche `+not-found`
 * (« Cette page n'existe pas. ») pendant le Magic Link HTTPS.
 */
describe('Magic Link entry routes (anti-404 Expo)', () => {
  const confirmPath = resolve(process.cwd(), 'app/auth/confirm.tsx');
  const callbackPath = resolve(process.cwd(), 'app/auth/callback.tsx');
  const entryPath = resolve(process.cwd(), 'src/features/auth/MagicLinkEntryScreen.tsx');
  const notFoundPath = resolve(process.cwd(), 'app/+not-found.tsx');

  it('expose /auth/confirm et /auth/callback côté Expo Router', () => {
    expect(existsSync(confirmPath)).toBe(true);
    expect(existsSync(callbackPath)).toBe(true);
    expect(existsSync(entryPath)).toBe(true);
  });

  it('affiche un pending brandé sans second verifyOtp', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const confirm = readFileSync(confirmPath, 'utf8');
    const callback = readFileSync(callbackPath, 'utf8');
    expect(entry).toMatch(/Connexion en cours/);
    expect(entry).toMatch(/YOUMBIA/);
    for (const src of [entry, confirm, callback]) {
      expect(src).not.toMatch(/verifyOtp/);
      expect(src).not.toMatch(/handleSupabaseAuthDeepLink/);
    }
  });

  it('prouve que le libellé 404 observé vient de +not-found (Expo), pas du Web', () => {
    const notFound = readFileSync(notFoundPath, 'utf8');
    expect(notFound).toContain("Cette page n'existe pas.");
  });
});
