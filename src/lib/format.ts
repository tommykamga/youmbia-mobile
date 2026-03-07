/**
 * Format price for display (FCFA). Same convention as web.
 * Delegates to utils for null-safe display.
 */
export { formatPrice } from '@/utils/formatPrice';

/** Relative time for listings (il y a X min/h/j). Re-exported for consistent date display. */
export { timeAgo } from '@/utils/timeAgo';

/**
 * Format listing date for card metadata (messages, etc.): relative or short date.
 * For listing cards/detail use timeAgo instead.
 */
export function formatListingDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} j.`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** Format date for “member since” (e.g. “Membre depuis mars 2024”). */
export function formatJoinDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}
