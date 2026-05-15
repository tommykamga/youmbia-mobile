/** Motifs de signalement annonce / boutique (Sprint 5 — confiance marketplace). */
export const MARKETPLACE_REPORT_REASONS = [
  'Faux produit',
  'Arnaque',
  'Contenu inapproprié',
  'Déjà vendu',
  'Autre',
] as const;

export type MarketplaceReportReason = (typeof MARKETPLACE_REPORT_REASONS)[number];
