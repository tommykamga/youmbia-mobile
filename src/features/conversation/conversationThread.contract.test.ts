import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatMessageDaySeparator,
  formatMessageTime,
  getThreadErrorMessage,
  isSameCalendarDay,
} from './conversationThreadDisplay';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('conversationThreadDisplay', () => {
  it('formatMessageTime returns time for today', () => {
    const now = new Date();
    const iso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30).toISOString();
    expect(formatMessageTime(iso)).toMatch(/\d{2}:\d{2}/);
  });

  it('isSameCalendarDay compares calendar dates', () => {
    expect(isSameCalendarDay('2026-11-04T10:00:00.000Z', '2026-11-04T22:00:00.000Z')).toBe(true);
    expect(isSameCalendarDay('2026-11-03T10:00:00.000Z', '2026-11-04T10:00:00.000Z')).toBe(false);
  });

  it('formatMessageDaySeparator labels today', () => {
    const now = new Date();
    expect(formatMessageDaySeparator(now.toISOString())).toBe("Aujourd'hui");
  });

  it('maps auth errors', () => {
    expect(getThreadErrorMessage('Non connecté', 'fallback')).toBe('Connexion requise');
  });
});

describe('conversation thread — contrats métier (route)', () => {
  it('conserve bus Realtime, read et envoi', () => {
    const src = read('app/conversation/[id].tsx');
    expect(src).toMatch(/subscribeMessagingEvents/);
    expect(src).toMatch(/appendMessageDeduped/);
    expect(src).toMatch(/emitConversationRead/);
    expect(src).toMatch(/markConversationRead/);
    expect(src).toMatch(/setOpenConversationId/);
    expect(src).toMatch(/sendMessage\(/);
    expect(src).not.toMatch(/MessagesDemoScreen/);
  });

  it('utilise les composants premium Phase B', () => {
    const src = read('app/conversation/[id].tsx');
    expect(src).toMatch(/ConversationHeader/);
    expect(src).toMatch(/ConversationListingBanner/);
    expect(src).toMatch(/ConversationMessageBubble/);
    expect(src).toMatch(/ConversationComposer/);
    expect(src).toMatch(/useConversationListingPresentation/);
    expect(src).not.toMatch(/getListingsByIds/);
  });

  it('paddingle bas du composer Android quand clavier ouvert (insets + marge, sans androidInsetPadding)', () => {
    const screen = read('app/conversation/[id].tsx');
    expect(screen).toMatch(/Platform\.OS === 'android' && keyboardInset > 0/);
    expect(screen).toMatch(/Math\.max\(insets\.bottom,\s*spacing\.sm\)/);
    expect(screen).not.toMatch(/KeyboardSafeView[\s\S]*androidInsetPadding/);
    const ksv = read('src/components/KeyboardSafeView.tsx');
    expect(ksv).toMatch(/androidInsetPadding\s*=\s*false/);
  });

  it('charge présentation annonce via hook dédié (pas service conversations)', () => {
    const hook = read('src/features/conversation/useConversationListingPresentation.ts');
    expect(hook).toMatch(/getListingsByIds/);
    expect(hook).not.toMatch(/markConversationRead/);
  });
});
