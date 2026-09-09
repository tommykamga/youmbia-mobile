/**
 * Spécification du trigger DB `set_listings_sale_cycle`.
 * Helper pur pour tests déterministes — le client n’écrit jamais ces colonnes.
 */

export type ListingSaleCycleTimestamps = {
  sold_at: string | null;
  sale_cycle_started_at: string | null;
};

/**
 * INSERT : ignore toute valeur client de sold_at / sale_cycle_started_at.
 */
export function applyListingSaleCycleInsert(args: {
  status: string;
  created_at: string | null | undefined;
  now: string;
  clientSoldAt?: string | null;
  clientSaleCycleStartedAt?: string | null;
}): ListingSaleCycleTimestamps {
  void args.clientSoldAt;
  void args.clientSaleCycleStartedAt;
  if (args.status === 'draft') {
    return {
      sold_at: null,
      sale_cycle_started_at: null,
    };
  }
  const created = String(args.created_at ?? '').trim();
  return {
    sold_at: args.status === 'sold' ? args.now : null,
    sale_cycle_started_at: created || args.now,
  };
}

/**
 * UPDATE : restaure OLD, puis applique uniquement les transitions légitimes.
 * Les timestamps fournis par le client sont ignorés.
 */
export function applyListingSaleCycleUpdate(args: {
  oldStatus: string;
  newStatus: string;
  oldSoldAt: string | null;
  oldSaleCycleStartedAt: string | null;
  now: string;
  clientSoldAt?: string | null;
  clientSaleCycleStartedAt?: string | null;
}): ListingSaleCycleTimestamps {
  void args.clientSoldAt;
  void args.clientSaleCycleStartedAt;

  let sold_at = args.oldSoldAt;
  let sale_cycle_started_at = args.oldSaleCycleStartedAt;

  if (args.newStatus === 'sold' && args.oldStatus !== 'sold') {
    sold_at = args.now;
  } else if (args.oldStatus === 'sold' && (args.newStatus === 'active' || args.newStatus === 'hidden')) {
    sold_at = null;
    sale_cycle_started_at = args.now;
  } else if (args.oldStatus === 'sold' && args.newStatus === 'suspended') {
    sold_at = null;
  } else if (args.oldStatus === 'draft' && args.newStatus === 'active') {
    sold_at = null;
    sale_cycle_started_at = args.now;
  }

  return { sold_at, sale_cycle_started_at };
}
