/**
 * Signalement Trust V1 — listing / vendeur / conversation.
 * Auth requise. Aucun corps de message n'est persisté.
 */

import { REPORT_OWN_CONTENT_MESSAGE } from '@/constants/reportMessages';
import {
  buildPersistedReason,
  isReportTargetType,
  normalizeReportComment,
  normalizeReportReason,
  type ReportReasonCode,
  type ReportTargetType,
} from '@/constants/reportReasons';
import { supabase } from '@/lib/supabase';

export type SubmitReportResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

export type SubmitReportInput = {
  targetType: ReportTargetType | string;
  targetId: string;
  reason?: string | null;
  comment?: string | null;
  sellerId?: string | null;
};

const inFlightKeys = new Set<string>();

export function resetReportInFlightForTests(): void {
  inFlightKeys.clear();
}

function toUserFacingReportError(error: { message?: string; code?: string } | null): string {
  const code = error?.code ?? '';
  const message = String(error?.message ?? '').toLowerCase();
  if (code === '23505') return 'Vous avez déjà signalé cet élément.';
  if (code === '23503') return 'Cible introuvable.';
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('failed to fetch')
  ) {
    return 'Réseau indisponible. Réessayez.';
  }
  if (message.includes('jwt') || message.includes('session') || message.includes('not authenticated')) {
    return 'Non connecté';
  }
  return error?.message?.trim() || 'Impossible d’envoyer le signalement.';
}

async function requireUser(): Promise<{ id: string } | { error: { message: string } }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: { message: 'Non connecté' } };
  }
  return { id: user.id };
}

function resolveReason(
  targetType: ReportTargetType,
  reason?: string | null
): { code: ReportReasonCode } | { error: { message: string } } {
  const code = normalizeReportReason(reason, targetType);
  if (!code) {
    return { error: { message: 'Veuillez choisir un motif' } };
  }
  return { code };
}

export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  if (!isReportTargetType(input.targetType)) {
    return { data: null, error: { message: 'Type de signalement invalide' } };
  }

  const targetId = input.targetId?.trim() ?? '';
  if (!targetId) {
    return { data: null, error: { message: 'Cible invalide' } };
  }

  const key = `${input.targetType}:${targetId}`;
  if (inFlightKeys.has(key)) {
    return { data: null, error: { message: 'Signalement déjà en cours.' } };
  }
  inFlightKeys.add(key);

  try {
    const auth = await requireUser();
    if ('error' in auth) return { data: null, error: auth.error };

    const reasonResult = resolveReason(input.targetType, input.reason);
    if ('error' in reasonResult) return { data: null, error: reasonResult.error };

    const comment = normalizeReportComment(input.comment);
    const persistedReason = buildPersistedReason(reasonResult.code, comment);

    if (input.targetType === 'listing') {
      return await insertListingReport({
        listingId: targetId,
        userId: auth.id,
        sellerId: input.sellerId,
        reason: persistedReason,
      });
    }
    if (input.targetType === 'seller') {
      return await insertSellerReport({
        reportedUserId: targetId,
        reporterUserId: auth.id,
        reason: persistedReason,
      });
    }
    return await insertConversationReport({
      conversationId: targetId,
      userId: auth.id,
      reason: reasonResult.code,
      comment,
    });
  } finally {
    inFlightKeys.delete(key);
  }
}

async function insertListingReport(params: {
  listingId: string;
  userId: string;
  sellerId?: string | null;
  reason: string;
}): Promise<SubmitReportResult> {
  if (params.sellerId?.trim() === params.userId) {
    return { data: null, error: { message: REPORT_OWN_CONTENT_MESSAGE } };
  }

  if (!params.sellerId?.trim()) {
    const { data: listingRow, error: listingError } = await supabase
      .from('listings')
      .select('user_id')
      .eq('id', params.listingId)
      .maybeSingle();

    if (listingError) {
      return { data: null, error: { message: toUserFacingReportError(listingError) } };
    }
    if (!listingRow) {
      return { data: null, error: { message: 'Cible introuvable.' } };
    }
    if (listingRow.user_id === params.userId) {
      return { data: null, error: { message: REPORT_OWN_CONTENT_MESSAGE } };
    }
  }

  const { error } = await supabase.from('listing_reports').insert({
    listing_id: params.listingId,
    user_id: params.userId,
    reason: params.reason,
  } as never);

  if (error) {
    if (error.code === '23505') return { data: null, error: null };
    return { data: null, error: { message: toUserFacingReportError(error) } };
  }
  return { data: null, error: null };
}

async function insertSellerReport(params: {
  reportedUserId: string;
  reporterUserId: string;
  reason: string;
}): Promise<SubmitReportResult> {
  if (params.reportedUserId === params.reporterUserId) {
    return { data: null, error: { message: 'Vous ne pouvez pas vous signaler vous-même.' } };
  }

  const { error } = await supabase.from('user_reports').insert({
    reported_user_id: params.reportedUserId,
    reporter_user_id: params.reporterUserId,
    reason: params.reason,
  } as never);

  if (error) {
    if (error.code === '23505') return { data: null, error: null };
    return { data: null, error: { message: toUserFacingReportError(error) } };
  }
  return { data: null, error: null };
}

async function insertConversationReport(params: {
  conversationId: string;
  userId: string;
  reason: ReportReasonCode;
  comment: string | null;
}): Promise<SubmitReportResult> {
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, buyer_id, seller_id')
    .eq('id', params.conversationId)
    .or(`buyer_id.eq.${params.userId},seller_id.eq.${params.userId}`)
    .maybeSingle();

  if (conversationError) {
    return { data: null, error: { message: toUserFacingReportError(conversationError) } };
  }
  if (!conversation) {
    return { data: null, error: { message: 'Conversation inaccessible.' } };
  }

  const { error } = await supabase.from('conversation_reports').insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    reason: params.reason,
    comment: params.comment,
  } as never);

  if (error) {
    if (error.code === '23505') return { data: null, error: null };
    return { data: null, error: { message: toUserFacingReportError(error) } };
  }
  return { data: null, error: null };
}
