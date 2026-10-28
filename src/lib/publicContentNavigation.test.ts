import { describe, expect, it } from 'vitest';
import { createPublicContentNavigationGuard } from './publicContentNavigation';
describe('LINK-01 content navigation coordination', () => {
  it('suppresses the system rewrite followed by the URL listener on the same resource', () => {
    const guard = createPublicContentNavigationGuard();
    guard.observeRoute('/user/abc');
    expect(guard.reserve('/user/abc?utm_source=whatsapp#details')).toBe(false);
  });
  it('reserves once before React commits navigation and allows reopening after leaving', () => {
    const guard = createPublicContentNavigationGuard();
    guard.observeRoute('/home');
    expect(guard.reserve('/shop/w-electronik?utm_source=whatsapp')).toBe(true);
    expect(guard.reserve('/shop/w-electronik?utm_source=email')).toBe(false);
    guard.observeRoute('/shop/w-electronik');
    expect(guard.reserve('/shop/w-electronik')).toBe(false);
    guard.observeRoute('/home');
    expect(guard.reserve('/shop/w-electronik')).toBe(true);
  });
  it('preserves distinct contact intents and permits retry after a navigation did not settle', () => {
    let now = 10;
    const guard = createPublicContentNavigationGuard(() => now);
    guard.observeRoute('/listing/abc');
    expect(guard.reserve('/listing/abc?contact=message')).toBe(true);
    guard.observeRoute('/listing/abc', {contact:'message'});
    expect(guard.reserve('/listing/abc?contact=message&utm_source=wa')).toBe(false);
    expect(guard.reserve('/listing/abc?contact=call')).toBe(true);
    now += 1501;
    expect(guard.reserve('/listing/abc?contact=call')).toBe(true);
  });
});
