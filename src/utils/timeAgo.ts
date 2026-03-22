/**
 * Relative time for listing dates (UI only).
 * Returns empty string for null/undefined or invalid date.
 */
export function timeAgo(date: string | Date | null | undefined): string {
  if (date == null) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  if (hours < 24) {
    return `il y a ${hours} h`;
  }
  return `il y a ${days} j`;
}

const NEW_LISTING_DAYS = 7;

/** Annonce publiée récemment — pour badge « Nouveau » (UI uniquement). */
export function isListingNew(createdAt: string | Date | null | undefined): boolean {
  if (createdAt == null) return false;
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= NEW_LISTING_DAYS;
  } catch {
    return false;
  }
}
