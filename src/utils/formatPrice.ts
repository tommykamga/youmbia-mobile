/**
 * Format price for display: French locale spacing + FCFA.
 * Returns empty string for null/undefined.
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '';
  return price.toLocaleString('fr-FR') + ' FCFA';
}
