/**
 * Comparaison semver-like : 1.4.2 > 1.4.1, 1.10.0 > 1.9.9.
 * Retourne -1 si a < b, 0 si égal, 1 si a > b.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) =>
    value
      .trim()
      .replace(/^[vV]/, '')
      .split(/[.+_-]/)
      .map((segment) => {
        const match = segment.match(/^\d+/);
        return match ? Number.parseInt(match[0], 10) : 0;
      });

  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}
