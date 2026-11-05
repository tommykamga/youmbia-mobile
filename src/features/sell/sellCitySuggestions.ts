import { CANONICAL_CITIES, canonicalCityLabel, type CityCode } from '@/lib/canonicalCity';

const ALL_CODES = Object.keys(CANONICAL_CITIES) as CityCode[];

const PRIORITY_CODES: CityCode[] = ['douala', 'yaounde'];

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Suggestions contextuelles (max 4) — saisie libre inchangée côté parent. */
export function getSellCitySuggestions(cityInput: string, maxSuggestions = 4): string[] {
  const max = Math.max(1, Math.min(8, maxSuggestions));
  const trimmed = cityInput.trim();
  const allLabels = ALL_CODES.map((code) => canonicalCityLabel(code));

  if (!trimmed) {
    const priority = PRIORITY_CODES.map((code) => canonicalCityLabel(code));
    const rest = allLabels.filter((label) => !priority.includes(label));
    return [...priority, ...rest].slice(0, max);
  }

  const needle = normalizeForMatch(trimmed);
  const currentNorm = needle;

  return allLabels
    .filter((label) => {
      const labelNorm = normalizeForMatch(label);
      if (labelNorm === currentNorm) return false;
      return labelNorm.startsWith(needle) || labelNorm.includes(needle);
    })
    .slice(0, max);
}
