/**
 * Report a user (seller) – trust & safety.
 * Table existante : user_reports.
 */

import { submitReport, type SubmitReportResult } from './submitReport';

export type ReportUserResult = SubmitReportResult;

export async function reportUser(
  reportedUserId: string,
  reason?: string | null,
  options?: { comment?: string | null }
): Promise<ReportUserResult> {
  return submitReport({
    targetType: 'seller',
    targetId: reportedUserId,
    reason,
    comment: options?.comment,
  });
}
