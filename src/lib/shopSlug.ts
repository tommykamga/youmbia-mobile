/**
 * Génération de slug boutique (URL) — sans logique métier par niche.
 */

export function slugifyShopName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'boutique';
}

export function buildShopSlugCandidate(baseName: string, suffix?: number): string {
  const base = slugifyShopName(baseName);
  if (suffix == null || suffix < 2) return base;
  return `${base}-${suffix}`.slice(0, 60);
}
