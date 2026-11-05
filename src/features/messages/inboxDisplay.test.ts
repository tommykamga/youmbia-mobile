import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  countUnreadConversations,
  formatInboxDate,
  INBOX_LISTING_THUMB_SIZE,
  INBOX_ROW_SEPARATOR_MARGIN_LEFT,
} from './inboxDisplay';
import { spacing } from '@/theme';

describe('formatInboxDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T15:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty for missing iso', () => {
    expect(formatInboxDate(null)).toBe('');
    expect(formatInboxDate(undefined)).toBe('');
  });

  it('formats same-day as time', () => {
    const iso = '2026-11-04T14:00:00.000Z';
    const out = formatInboxDate(iso);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it('returns Hier for previous calendar day', () => {
    expect(formatInboxDate('2026-11-03T10:00:00.000Z')).toBe('Hier');
  });
});

describe('countUnreadConversations', () => {
  it('counts rows with unread_count > 0 only', () => {
    expect(
      countUnreadConversations([
        { unread_count: 0 },
        { unread_count: 2 },
        {},
        { unread_count: 1 },
      ])
    ).toBe(2);
  });
});

describe('INBOX_ROW_SEPARATOR_MARGIN_LEFT', () => {
  it('aligne le séparateur avec le début de la colonne texte', () => {
    expect(INBOX_ROW_SEPARATOR_MARGIN_LEFT).toBe(
      spacing.base + INBOX_LISTING_THUMB_SIZE + spacing.md
    );
  });
});
