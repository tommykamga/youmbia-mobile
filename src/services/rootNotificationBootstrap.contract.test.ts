import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

describe('root notification bootstrap contract', () => {
  it('mounts the root navigator independently from the splash overlay', () => {
    expect(layout).toMatch(/<Stack/);
    expect(layout).toMatch(/!isSplashAnimationComplete\s*\?/);
    expect(layout).not.toMatch(
      /if\s*\(!isSplashAnimationComplete\)[\s\S]*?return\s*\(\s*<SplashScreenCustom/,
    );
    expect(layout).toMatch(/isAppReady=\{isNavigationReady\}/);
  });

  it('does not await analytics before releasing bootstrap', () => {
    expect(layout).toMatch(/void initMixpanel\(\)/);
    expect(layout).toMatch(/void identifyCurrentUser\(session\.user\)/);
    expect(layout).not.toMatch(/await initMixpanel\(\)/);
    expect(layout).not.toMatch(/await identifyCurrentUser\(session\.user\)/);
  });

  it('gates notification consumption on navigation and session readiness', () => {
    expect(layout).toMatch(/setNavigationReady\(isNavigationReady\)/);
    expect(layout).toMatch(/setSessionReady\(isSessionReady\)/);
    expect(layout).toMatch(/readColdStartOnce/);
    expect(layout).toMatch(/clearLastNotificationResponseAsyncSafe/);
  });
});
