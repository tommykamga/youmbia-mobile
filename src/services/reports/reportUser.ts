/**
 * Report a user (seller) – trust & safety.
 * Requires backend table user_reports (reported_user_id, reporter_user_id, reason).
 * Auth required.
 *
 * TODO (produit / alignement web) : voir `reportListing.ts` — table unifiée `reports` vs `user_reports` à valider côté modération.
 */

import { supabase } from '@/lib/supabase';

export type ReportUserResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

export async function reportUser(
  reportedUserId: string,
  reason?: string | null
): Promise<ReportUserResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  if (!reportedUserId?.trim()) {
    return { data: null, error: { message: 'Utilisateur invalide' } };
  }

  if (reportedUserId.trim() === user.id) {
    return { data: null, error: { message: 'Vous ne pouvez pas vous signaler vous-même.' } };
  }

  const trimmedReason = reason?.trim() || null;
  if (!trimmedReason) {
    return { data: null, error: { message: 'Veuillez choisir un motif' } };
  }

  const { error } = await supabase.from('user_reports').insert({
    reported_user_id: reportedUserId.trim(),
    reporter_user_id: user.id,
    reason: trimmedReason,
  } as never);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: null, error: null };
}
