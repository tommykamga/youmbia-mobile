/**
 * Report a listing (e.g. inappropriate, scam).
 * Reuses existing backend: insert into listing_reports (listing_id, user_id, reason).
 */

import { trackListingReported } from '@/lib/analytics';
import { submitReport, type SubmitReportResult } from './submitReport';

export type ReportListingResult = SubmitReportResult;

export async function reportListing(
  listingId: string,
  reason?: string | null,
  options?: { sellerId?: string | null; comment?: string | null }
): Promise<ReportListingResult> {
  const result = await submitReport({
    targetType: 'listing',
    targetId: listingId,
    reason,
    comment: options?.comment,
    sellerId: options?.sellerId,
  });
  if (!result.error && listingId.trim()) {
    trackListingReported({
      listing_id: listingId.trim(),
      report_reason: (reason ?? '').trim() || 'other',
    });
  }
  return result;
}
