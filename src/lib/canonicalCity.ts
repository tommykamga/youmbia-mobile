/** V5-01 pure, conservative city resolver. No writes, no geocoding. */
export type CityCode = 'douala' | 'yaounde' | 'bafoussam' | 'buea' | 'limbe' | 'ngaoundere' | 'dibombari' | 'melong';
export type CityResolution =
  | { kind: 'canonical'; code: CityCode; original: string; confidence: 'exact' | 'qualified' }
  | { kind: 'review'; original: string; reason: 'empty' | 'multiple' | 'unknown' | 'ambiguous' };

const CANONICAL: Record<CityCode, string> = {
  douala: 'Douala', yaounde: 'Yaoundé', bafoussam: 'Bafoussam',
  buea: 'Buea', limbe: 'Limbe', ngaoundere: 'Ngaoundéré', dibombari: 'Dibombari', melong: 'Melong',
};
const normalize = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const codes = Object.keys(CANONICAL) as CityCode[];
const names = new Map<CityCode, string>(codes.map(k => [k, normalize(CANONICAL[k])]));
const qualified = /^(?:cameroun |cameroon )?(douala|yaounde|bafoussam|buea|limbe|ngaoundere|dibombari|melong)(?: cameroun| cameroon)?$/;

/** Never guess a primary city from an address, multiple cities or free text. */
export function resolveCanonicalCity(value: string | null | undefined): CityResolution {
  const original = value ?? '';
  const text = normalize(original);
  if (!text) return {kind:'review', original, reason:'empty'};
  for (const code of codes) if (text === names.get(code)) return {kind:'canonical', code, original, confidence:'exact'};
  const matched = text.match(qualified);
  if (matched) return {kind:'canonical', code:matched[1] as CityCode, original, confidence:'qualified'};
  const mentioned = codes.filter(code => new RegExp(`(?:^| )${names.get(code)}(?: |$)`).test(text));
  if (mentioned.length > 1) return {kind:'review', original, reason:'multiple'};
  if (mentioned.length === 1) return {kind:'review', original, reason:'ambiguous'};
  return {kind:'review', original, reason:'unknown'};
}

export function canonicalCityLabel(code: CityCode): string { return CANONICAL[code]; }

/** Canonicalise uniquement les valeurs de ville non ambiguës, sans modifier les anciennes annonces. */
export function canonicalCityInputValue(value: string): string {
  const r = resolveCanonicalCity(value);
  return r.kind === 'canonical' ? canonicalCityLabel(r.code) : value.trim();
}

/** Filtre PostgREST compatible avec les variantes contrôlées et les résultats historiques. */
export function buildCanonicalCityOrClause(value: string): string | null {
  const result = resolveCanonicalCity(value);
  if (result.kind !== 'canonical') return null;
  const variants: Record<CityCode, readonly string[]> = {
    douala: ['Douala'], yaounde: ['Yaoundé','Yaounde'], bafoussam: ['Bafoussam'],
    buea: ['Buea'], limbe: ['Limbe'], ngaoundere: ['Ngaoundéré','Ngaoundere'],
    dibombari: ['Dibombari'], melong: ['Melong'],
  };
  // Préserve les recherches historiques par inclusion et ajoute les variantes accentuées.
  // Les valeurs sont issues uniquement d'une liste autorisée.
  return variants[result.code].map(v => 'city.ilike.%'+v+'%').join(',');
}
