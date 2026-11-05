import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('messages inbox — contrats UI non régression', () => {
  it('conserve swipe, masquage et navigation fil', () => {
    const src = read('src/features/messages/MessagesInboxScreen.tsx');
    expect(src).toMatch(/SwipeToDeleteRow/);
    expect(src).toMatch(/hideConversationForMe/);
    expect(src).toMatch(/router\.push\(`\/conversation\/\$\{item\.id\}`\)/);
    expect(src).toMatch(/emitConversationRead\(item\.id\)/);
    expect(src).toMatch(/subscribeMessagingEvents/);
    expect(src).toMatch(/lightCacheRead/);
    expect(src).toMatch(/lightCacheWrite/);
  });

  it('n’importe pas getListingsByIds dans messages.tsx (enrichissement via hook)', () => {
    const src = read('src/features/messages/MessagesInboxScreen.tsx');
    expect(src).toMatch(/from '@\/services\/conversations'/);
    expect(src).not.toMatch(/getListingsByIds/);
    expect(src).toMatch(/useInboxListingThumbs/);
  });

  it('charge les vignettes via getListingsByIds dans le module dédié', () => {
    const mod = read('src/features/messages/inboxListingThumbs.ts');
    expect(mod).toMatch(/getListingsByIds/);
    expect(mod).toMatch(/loadInboxListingThumbsForIds/);
  });

  it('aligne les séparateurs inbox sur INBOX_ROW_SEPARATOR_MARGIN_LEFT', () => {
    const inbox = read('src/features/messages/MessagesInboxScreen.tsx');
    const demo = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    expect(inbox).toMatch(/INBOX_ROW_SEPARATOR_MARGIN_LEFT/);
    expect(demo).toMatch(/INBOX_ROW_SEPARATOR_MARGIN_LEFT/);
  });
});
