/** French FCFA display independent of the installed Intl/Hermes locale data. */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '';
  const [mantissa, exponentText] = Math.abs(price).toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const position = whole.length + Number(exponentText ?? 0);
  const decimal = position <= 0 ? `0.${'0'.repeat(-position)}${digits}`
    : position >= digits.length ? digits + '0'.repeat(position - digits.length)
      : `${digits.slice(0, position)}.${digits.slice(position)}`;
  const [integer, decimals] = decimal.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return `${price < 0 ? '-' : ''}${grouped}${decimals ? ',' + decimals : ''}\u00a0FCFA`;
}
