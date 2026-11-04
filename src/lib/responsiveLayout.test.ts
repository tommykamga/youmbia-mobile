import { describe, expect, it } from 'vitest';
import { getHomeFeedColumnCount, HOME_FEED_GRID_MAX_FONT_SCALE } from './responsiveLayout';

describe('getHomeFeedColumnCount', () => {
  it('returns 1 on compact logical width', () => {
    expect(getHomeFeedColumnCount(375, 1)).toBe(1);
  });

  it('returns 2 on regular width with default font scale', () => {
    expect(getHomeFeedColumnCount(390, 1)).toBe(2);
    expect(getHomeFeedColumnCount(430, 1)).toBe(2);
  });

  it('returns 1 when system font scale exceeds threshold', () => {
    expect(getHomeFeedColumnCount(430, HOME_FEED_GRID_MAX_FONT_SCALE + 0.01)).toBe(1);
  });
});
