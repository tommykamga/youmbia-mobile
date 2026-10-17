/**
 * Consentement marketing email — capture minimale.
 * Défaut DB = false. Ne touche pas Auth / Magic Link.
 */

import { supabase } from '@/lib/supabase';

export type EmailPreferences = {
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  marketing_opt_in_source: string | null;
  unsubscribed_at: string | null;
};

export type EmailPreferencesResult =
  | { data: EmailPreferences; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR = 'Impossible de mettre à jour vos préférences email';

function mapError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'Réseau indisponible';
  if (msg.includes('jwt') || msg.includes('auth')) return 'Connexion requise';
  return GENERIC_ERROR;
}

export async function getEmailPreferences(): Promise<EmailPreferencesResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) {
    return { data: null, error: { message: 'Connexion requise' } };
  }
  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from('email_preferences')
    .select('marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, unsubscribed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: mapError(error.message) } };
  }

  if (!data) {
    return {
      data: {
        marketing_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_in_source: null,
        unsubscribed_at: null,
      },
      error: null,
    };
  }

  return {
    data: {
      marketing_opt_in: data.marketing_opt_in === true,
      marketing_opt_in_at: data.marketing_opt_in_at ?? null,
      marketing_opt_in_source: data.marketing_opt_in_source ?? null,
      unsubscribed_at: data.unsubscribed_at ?? null,
    },
    error: null,
  };
}

/**
 * Opt-in explicite uniquement si optedIn === true.
 * Opt-out : marketing_opt_in=false + unsubscribed_at.
 * Jamais d’opt-in implicite.
 */
export async function setMarketingEmailOptIn(
  optedIn: boolean,
  source: 'signup' | 'settings' | 'unsubscribe'
): Promise<EmailPreferencesResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) {
    return { data: null, error: { message: 'Connexion requise' } };
  }
  const userId = sessionData.session.user.id;
  const nowIso = new Date().toISOString();

  const payload = optedIn
    ? {
        user_id: userId,
        marketing_opt_in: true,
        marketing_opt_in_at: nowIso,
        marketing_opt_in_source: source,
        unsubscribed_at: null,
        updated_at: nowIso,
      }
    : {
        user_id: userId,
        marketing_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_in_source: source,
        unsubscribed_at: nowIso,
        updated_at: nowIso,
      };

  const { data, error } = await supabase
    .from('email_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, unsubscribed_at')
    .single();

  if (error || !data) {
    return {
      data: null,
      error: { message: mapError(error?.message ?? GENERIC_ERROR) },
    };
  }

  return {
    data: {
      marketing_opt_in: data.marketing_opt_in === true,
      marketing_opt_in_at: data.marketing_opt_in_at ?? null,
      marketing_opt_in_source: data.marketing_opt_in_source ?? null,
      unsubscribed_at: data.unsubscribed_at ?? null,
    },
    error: null,
  };
}
