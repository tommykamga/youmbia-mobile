/** Boutique créée depuis moins de N jours — badge « Nouvelle boutique ». */
export const NEW_SHOP_MAX_AGE_DAYS = 14;

export function isNewShop(createdAt: string | null | undefined, maxAgeDays = NEW_SHOP_MAX_AGE_DAYS): boolean {
  if (!createdAt?.trim()) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const ageMs = Date.now() - created.getTime();
  if (ageMs < 0) return false;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < maxAgeDays;
}
