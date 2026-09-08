/**
 * Spécification du trigger DB `set_listings_renewed_at`.
 * Helper pur pour tests déterministes — le client n’écrit jamais la valeur finale.
 * Distinct de sold_at / sale_cycle_started_at (Lot B) et de updated_at (édition / bump).
 */

export const LISTING_RENEWAL_COOLDOWN_DAYS = 3;
export const LISTING_RENEWAL_COOLDOWN_MS = LISTING_RENEWAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
export const LISTING_RENEWAL_COOLDOWN_ERROR =
  'Cette annonce ne peut être renouvelée que toutes les 3 jours.';
export const LISTING_RENEWAL_SUSPENDED_ERROR = 'Une annonce suspendue ne peut pas être renouvelée.';

export class ListingRenewalCooldownError extends Error {
  constructor(message = LISTING_RENEWAL_COOLDOWN_ERROR) {
    super(message);
    this.name = 'ListingRenewalCooldownError';
  }
}

export class ListingRenewalSuspendedError extends Error {
  constructor(message = LISTING_RENEWAL_SUSPENDED_ERROR) {
    super(message);
    this.name = 'ListingRenewalSuspendedError';
  }
}

export type ListingRenewalTimestamp = {
  renewed_at: string | null;
};

function parseMs(value: string | null | undefined): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * INSERT : ignore toute valeur client. NULL = COALESCE(renewed_at, created_at) côté ranking.
 */
export function applyListingRenewalInsert(args: {
  clientRenewedAt?: string | null;
}): ListingRenewalTimestamp {
  void args.clientRenewedAt;
  return { renewed_at: null };
}

function lastPublicationMs(
  oldRenewedAt: string | null | undefined,
  oldCreatedAt: string | null | undefined
): number | null {
  return parseMs(oldRenewedAt) ?? parseMs(oldCreatedAt);
}

/** Boost ranking autorisé : now() >= last_publication + 3 days. Ne pas utiliser sold_at. */
export function canApplyRankingBoost(args: {
  oldRenewedAt: string | null | undefined;
  oldCreatedAt?: string | null;
  now: string;
}): boolean {
  const lastMs = lastPublicationMs(args.oldRenewedAt, args.oldCreatedAt);
  const nowMs = parseMs(args.now);
  if (lastMs == null || nowMs == null) return false;
  return nowMs >= lastMs + LISTING_RENEWAL_COOLDOWN_MS;
}

/**
 * UPDATE : restaure OLD, puis applique uniquement les transitions légitimes.
 * Réactivation (sold→active) ≠ boost ranking.
 * Cooldown 3 jours enforced ici (comme le trigger). Timestamp client ignoré.
 * Lève ListingRenewalCooldownError / ListingRenewalSuspendedError (équivalent RAISE).
 */
export function applyListingRenewalUpdate(args: {
  oldStatus: string;
  newStatus: string;
  oldRenewedAt: string | null;
  oldCreatedAt?: string | null;
  now: string;
  clientRenewedAt?: string | null;
}): ListingRenewalTimestamp {
  const requestedRenew =
    args.clientRenewedAt !== undefined && args.clientRenewedAt !== args.oldRenewedAt;

  let renewed_at = args.oldRenewedAt;
  const boost = canApplyRankingBoost({
    oldRenewedAt: args.oldRenewedAt,
    oldCreatedAt: args.oldCreatedAt,
    now: args.now,
  });

  if (args.oldStatus === 'sold' && args.newStatus === 'active') {
    if (boost) renewed_at = args.now;
  } else if (args.oldStatus === 'active' && args.newStatus === 'active' && requestedRenew) {
    const lastMs = lastPublicationMs(args.oldRenewedAt, args.oldCreatedAt);
    const nowMs = parseMs(args.now);
    if (lastMs != null && nowMs != null && nowMs < lastMs + LISTING_RENEWAL_COOLDOWN_MS) {
      throw new ListingRenewalCooldownError();
    }
    renewed_at = args.now;
  } else if (args.oldStatus === 'suspended' && requestedRenew) {
    throw new ListingRenewalSuspendedError();
  }

  return { renewed_at };
}
