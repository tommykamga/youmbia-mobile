/**
 * Suppression de compte — conforme App Store Review Guideline 5.1.1(v) et RGPD.
 *
 * Appelle la RPC Supabase `delete_my_account` (SECURITY DEFINER) qui supprime
 * définitivement le compte et toutes les données personnelles de l'utilisateur,
 * puis déconnecte la session locale.
 *
 * Voir : supabase/migrations/20260602210000_delete_account_v1.sql
 */

import { supabase } from '@/lib/supabase';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string };

function safeMessage(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible. Réessayez.';
  }
  if (msg.includes('authenti')) {
    return 'Session expirée. Reconnectez-vous puis réessayez.';
  }
  return 'La suppression du compte a échoué. Réessayez plus tard.';
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  try {
    const { error } = await supabase.rpc('delete_my_account');

    if (error) {
      return { ok: false, message: safeMessage(error.message) };
    }

    // Le compte n'existe plus : on purge la session locale (best-effort).
    try {
      await supabase.auth.signOut();
    } catch {
      // non bloquant — le JWT est de toute façon invalide côté serveur
    }

    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e ?? '');
    return { ok: false, message: safeMessage(raw) };
  }
}
