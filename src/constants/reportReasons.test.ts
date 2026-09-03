import { describe, expect, it } from 'vitest';
import {
  REPORT_COMMENT_MAX_LENGTH,
  buildPersistedReason,
  getReportReasonsForTarget,
  getReportSeverity,
  isReportTargetType,
  normalizeReportComment,
  normalizeReportReason,
} from './reportReasons';

describe('report reasons mapping', () => {
  it('accepte les codes canoniques et les libellés historiques', () => {
    expect(normalizeReportReason('scam')).toBe('scam');
    expect(normalizeReportReason('Arnaque')).toBe('scam');
    expect(normalizeReportReason('Contenu inapproprié')).toBe('abusive_content');
    expect(normalizeReportReason('other: précisions')).toBe('other');
  });

  it('valide target_type et filtre les motifs hors surface', () => {
    expect(isReportTargetType('listing')).toBe(true);
    expect(isReportTargetType('seller')).toBe(true);
    expect(isReportTargetType('conversation')).toBe(true);
    expect(isReportTargetType('shop')).toBe(false);
    expect(normalizeReportReason('wrong_category', 'conversation')).toBeNull();
    expect(normalizeReportReason('scam', 'conversation')).toBe('scam');
    expect(getReportReasonsForTarget('listing')).toContain('misleading_price');
    expect(getReportReasonsForTarget('seller')).not.toContain('duplicate');
  });

  it('limite le commentaire et n’emballe que le motif other', () => {
    expect(normalizeReportComment('  hello  ')).toBe('hello');
    expect(normalizeReportComment('x'.repeat(REPORT_COMMENT_MAX_LENGTH + 20))?.length).toBe(
      REPORT_COMMENT_MAX_LENGTH
    );
    expect(buildPersistedReason('scam', 'ignore moi')).toBe('scam');
    expect(buildPersistedReason('other', 'prix bizarre')).toBe('other: prix bizarre');
  });

  it('calcule une sévérité système sans accuser le vendeur', () => {
    expect(getReportSeverity('scam')).toBe('high');
    expect(getReportSeverity('unreachable_seller')).toBe('medium');
    expect(getReportSeverity('duplicate')).toBe('low');
  });
});
