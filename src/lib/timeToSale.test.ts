import { describe, expect, it } from 'vitest';
import { computeTimeToSale, timeToSaleSeconds } from './timeToSale';

const CREATED = '2026-01-01T00:00:00.000Z';
const FIRST_SOLD = '2026-01-03T00:00:00.000Z';
const REACTIVATED = '2026-01-10T00:00:00.000Z';
const SECOND_SOLD = '2026-01-11T00:00:00.000Z';

describe('computeTimeToSale', () => {
  it('retourne null tant que sold_at est absent', () => {
    expect(computeTimeToSale(CREATED, null)).toBeNull();
    expect(computeTimeToSale(CREATED, undefined, CREATED)).toBeNull();
    expect(computeTimeToSale(CREATED, '')).toBeNull();
    expect(timeToSaleSeconds(CREATED, null)).toBeNull();
  });

  it('premier cycle created → sold utilise created_at si sale_cycle_started_at est null', () => {
    expect(computeTimeToSale(CREATED, FIRST_SOLD, null)).toEqual({
      seconds: 172_800,
      minutes: 2_880,
      hours: 48,
      days: 2,
    });
    expect(timeToSaleSeconds(CREATED, FIRST_SOLD, null)).toBe(172_800);
  });

  it('legacy sale_cycle_started_at NULL utilise created_at', () => {
    expect(timeToSaleSeconds(CREATED, FIRST_SOLD, null)).toBe(172_800);
    expect(timeToSaleSeconds(CREATED, FIRST_SOLD, undefined)).toBe(172_800);
    expect(timeToSaleSeconds(CREATED, FIRST_SOLD, '')).toBe(172_800);
  });

  it('seconde vente mesure uniquement le second cycle, pas created_at', () => {
    expect(computeTimeToSale(CREATED, SECOND_SOLD, REACTIVATED)).toEqual({
      seconds: 86_400,
      minutes: 1_440,
      hours: 24,
      days: 1,
    });
    expect(timeToSaleSeconds(CREATED, SECOND_SOLD, REACTIVATED)).toBe(86_400);
    expect(timeToSaleSeconds(CREATED, SECOND_SOLD, null)).toBe(864_000);
  });

  it('calcule un délai exact de 90 minutes sur le cycle courant', () => {
    expect(computeTimeToSale(CREATED, '2026-01-01T01:30:00.000Z', CREATED)).toEqual({
      seconds: 5_400,
      minutes: 90,
      hours: 1.5,
      days: 5_400 / 86_400,
    });
  });

  it('accepte un délai nul (même instant)', () => {
    expect(computeTimeToSale(CREATED, CREATED, CREATED)).toEqual({
      seconds: 0,
      minutes: 0,
      hours: 0,
      days: 0,
    });
  });

  it('retourne null pour des timestamps invalides', () => {
    expect(computeTimeToSale('not-a-date', FIRST_SOLD)).toBeNull();
    expect(computeTimeToSale(CREATED, 'hier')).toBeNull();
    expect(computeTimeToSale(CREATED, FIRST_SOLD, 'pas-une-date')).toBeNull();
  });

  it('ne retourne jamais de délai négatif', () => {
    expect(computeTimeToSale(FIRST_SOLD, CREATED)).toBeNull();
    expect(computeTimeToSale(CREATED, REACTIVATED, SECOND_SOLD)).toBeNull();
    expect(timeToSaleSeconds(CREATED, CREATED, SECOND_SOLD)).toBeNull();
  });

  it('retourne null si created_at est absent et le cycle aussi', () => {
    expect(computeTimeToSale(null, FIRST_SOLD, null)).toBeNull();
    expect(computeTimeToSale(undefined, FIRST_SOLD)).toBeNull();
  });
});
