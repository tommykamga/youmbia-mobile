/**
 * Délai de vente à partir des timestamps DB.
 * time_to_sale = sold_at - COALESCE(sale_cycle_started_at, created_at)
 * Helper pur : aucune I/O, aucune horloge locale.
 */

export type TimeToSaleDuration = {
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function cycleStartMs(
  createdAt: string | null | undefined,
  saleCycleStartedAt: string | null | undefined
): number | null {
  const cycleRaw = saleCycleStartedAt == null ? '' : String(saleCycleStartedAt).trim();
  if (cycleRaw) return parseTimestamp(cycleRaw);
  return parseTimestamp(createdAt);
}

/**
 * Retourne null si sold_at absent, timestamps invalides, ou delta négatif.
 */
export function computeTimeToSale(
  createdAt: string | null | undefined,
  soldAt: string | null | undefined,
  saleCycleStartedAt?: string | null | undefined
): TimeToSaleDuration | null {
  const startMs = cycleStartMs(createdAt, saleCycleStartedAt);
  const soldMs = parseTimestamp(soldAt);
  if (startMs == null || soldMs == null) return null;
  const ms = soldMs - startMs;
  if (ms < 0) return null;
  return {
    seconds: ms / 1000,
    minutes: ms / 60_000,
    hours: ms / 3_600_000,
    days: ms / 86_400_000,
  };
}

/** Secondes exactes pour analytics, ou null si le calcul n’est pas fiable. */
export function timeToSaleSeconds(
  createdAt: string | null | undefined,
  soldAt: string | null | undefined,
  saleCycleStartedAt?: string | null | undefined
): number | null {
  const duration = computeTimeToSale(createdAt, soldAt, saleCycleStartedAt);
  return duration == null ? null : duration.seconds;
}
