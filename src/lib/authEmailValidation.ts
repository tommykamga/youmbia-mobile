/**
 * Validation email côté client (UX) — le serveur reste la source de vérité.
 */

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string): boolean {
  const t = value.trim();
  if (t.length < 5) return false;
  return PLAUSIBLE_EMAIL.test(t);
}
