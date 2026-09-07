export const REPORT_TARGET_TYPES = ['listing', 'seller', 'conversation'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASON_CODES = [
  'scam',
  'prohibited_product',
  'misleading_price',
  'wrong_category',
  'duplicate',
  'unreachable_seller',
  'abusive_content',
  'other',
] as const;

export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  scam: 'Arnaque',
  prohibited_product: 'Produit interdit',
  misleading_price: 'Prix trompeur',
  wrong_category: 'Mauvaise catégorie',
  duplicate: 'Annonce en double',
  unreachable_seller: 'Vendeur injoignable',
  abusive_content: 'Contenu abusif',
  other: 'Autre',
};

const LEGACY_REASON_ALIASES: Record<string, ReportReasonCode> = {
  'faux produit': 'prohibited_product',
  arnaque: 'scam',
  'contenu inapproprié': 'abusive_content',
  'contenu inapproprie': 'abusive_content',
  'déjà vendu': 'other',
  'deja vendu': 'other',
  autre: 'other',
  'comportement inapproprié': 'abusive_content',
  'comportement inapproprie': 'abusive_content',
  spam: 'abusive_content',
};

export const REPORT_COMMENT_MAX_LENGTH = 500;

const REASONS_BY_TARGET: Record<ReportTargetType, readonly ReportReasonCode[]> = {
  listing: REPORT_REASON_CODES,
  seller: ['scam', 'prohibited_product', 'unreachable_seller', 'abusive_content', 'other'],
  conversation: ['scam', 'abusive_content', 'unreachable_seller', 'other'],
};

export function isReportTargetType(value: string): value is ReportTargetType {
  return (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function getReportReasonsForTarget(targetType: ReportTargetType): ReportReasonCode[] {
  return [...REASONS_BY_TARGET[targetType]];
}

export function normalizeReportReason(
  raw: string | null | undefined,
  targetType?: ReportTargetType
): ReportReasonCode | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;

  const asCode = trimmed.split(':')[0]?.trim() as ReportReasonCode;
  if ((REPORT_REASON_CODES as readonly string[]).includes(asCode)) {
    if (targetType && !REASONS_BY_TARGET[targetType].includes(asCode)) return null;
    return asCode;
  }

  const alias = LEGACY_REASON_ALIASES[trimmed.toLowerCase()];
  if (!alias) return null;
  if (targetType && !REASONS_BY_TARGET[targetType].includes(alias)) return null;
  return alias;
}

export function normalizeReportComment(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, REPORT_COMMENT_MAX_LENGTH);
}

export function buildPersistedReason(
  code: ReportReasonCode,
  comment: string | null | undefined
): string {
  const extra = normalizeReportComment(comment);
  if (code !== 'other' || !extra) return code;
  const packed = `other: ${extra}`;
  return packed.length <= REPORT_COMMENT_MAX_LENGTH
    ? packed
    : packed.slice(0, REPORT_COMMENT_MAX_LENGTH);
}

export function getReportSeverity(code: ReportReasonCode): 'low' | 'medium' | 'high' {
  if (code === 'scam' || code === 'prohibited_product' || code === 'abusive_content') {
    return 'high';
  }
  if (code === 'misleading_price' || code === 'unreachable_seller') {
    return 'medium';
  }
  return 'low';
}

/** @deprecated Prefer REPORT_REASON_LABELS / getReportReasonsForTarget. */
export const MARKETPLACE_REPORT_REASONS = REPORT_REASON_CODES.map(
  (code) => REPORT_REASON_LABELS[code]
) as readonly string[];

export type MarketplaceReportReason = (typeof MARKETPLACE_REPORT_REASONS)[number];
