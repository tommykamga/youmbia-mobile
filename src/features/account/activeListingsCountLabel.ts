export function formatActiveListingsCountLabel(count: number): string {
  if (count <= 0) return 'Aucune annonce active';
  if (count === 1) return '1 annonce active';
  return `${count.toLocaleString('fr-FR')} annonces actives`;
}
