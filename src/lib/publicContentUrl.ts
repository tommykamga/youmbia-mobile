/** Public share URLs always use the canonical HTTPS host and one encoded segment. */
export function publicContentUrl(family: 'annonce' | 'seller' | 'shop', segment: string): string {
  return `https://www.youmbia.com/${family}/${encodeURIComponent(segment)}`;
}
