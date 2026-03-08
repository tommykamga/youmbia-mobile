/**
 * Consultés récemment – mode hors ligne / continuité.
 * Stocke en mémoire les derniers IDs d'annonces consultées (max 20).
 * Utilisé pour la section "Consultés récemment" sur la home.
 */

const MAX_RECENT = 20;
let recentIds: string[] = [];

export function addRecentlyViewedListingId(id: string): void {
  if (!id?.trim()) return;
  const trimmed = id.trim();
  recentIds = [trimmed, ...recentIds.filter((x) => x !== trimmed)].slice(0, MAX_RECENT);
}

export function getRecentlyViewedListingIds(): string[] {
  return [...recentIds];
}
