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
