/**
 * Préférences email — marketing + opposition rappels brouillon.
 * Défaut marketing = false. Ne touche pas Auth / Magic Link.
 */

import { supabase } from '@/lib/supabase';
import { MARKETING_CONSENT_VERSION } from '@/lib/marketingConsentVersion';

export { MARKETING_CONSENT_VERSION } from '@/lib/marketingConsentVersion';

export type EmailPreferences = {
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  marketing_opt_in_source: string | null;
  marketing_opt_in_version: string | null;
  unsubscribed_at: string | null;
  optional_draft_reminders_opt_out: boolean;
  draft_reminders_notice_acknowledged_at: string | null;
};

export type EmailPreferencesResult =
  | { data: EmailPreferences; error: null }
  | { data: null; error: { message: string } };

const GENERIC_ERROR = 'Impossible de mettre à jour vos préférences email';

const PREFS_SELECT =
  'marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, marketing_opt_in_version, unsubscribed_at, optional_draft_reminders_opt_out, draft_reminders_notice_acknowledged_at';

function mapError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'Réseau indisponible';
  if (msg.includes('jwt') || msg.includes('auth')) return 'Connexion requise';
  return GENERIC_ERROR;
}

function mapRow(data: {
  marketing_opt_in?: boolean | null;
  marketing_opt_in_at?: string | null;
  marketing_opt_in_source?: string | null;
  marketing_opt_in_version?: string | null;
  unsubscribed_at?: string | null;
  optional_draft_reminders_opt_out?: boolean | null;
  draft_reminders_notice_acknowledged_at?: string | null;
}): EmailPreferences {
  return {
    marketing_opt_in: data.marketing_opt_in === true,
    marketing_opt_in_at: data.marketing_opt_in_at ?? null,
    marketing_opt_in_source: data.marketing_opt_in_source ?? null,
    marketing_opt_in_version: data.marketing_opt_in_version ?? null,
    unsubscribed_at: data.unsubscribed_at ?? null,
    optional_draft_reminders_opt_out: data.optional_draft_reminders_opt_out === true,
    draft_reminders_notice_acknowledged_at:
      data.draft_reminders_notice_acknowledged_at ?? null,
  };
}

async function requireUserId(): Promise<
  { userId: string; error: null } | { userId: null; error: { message: string } }
> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) {
    return { userId: null, error: { message: 'Connexion requise' } };
  }
  return { userId: sessionData.session.user.id, error: null };
}

export async function getEmailPreferences(): Promise<EmailPreferencesResult> {
  const auth = await requireUserId();
  if (auth.error || !auth.userId) {
    return { data: null, error: auth.error ?? { message: 'Connexion requise' } };
  }

  const { data, error } = await supabase
    .from('email_preferences')
    .select(PREFS_SELECT)
    .eq('user_id', auth.userId)
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
        marketing_opt_in_version: null,
        unsubscribed_at: null,
        optional_draft_reminders_opt_out: false,
        draft_reminders_notice_acknowledged_at: null,
      },
      error: null,
    };
  }

  return { data: mapRow(data), error: null };
}

/**
 * Opt-in explicite uniquement si optedIn === true.
 * Opt-out : marketing_opt_in=false + unsubscribed_at.
 * Jamais d’opt-in implicite. Ne touche pas optional_draft_reminders_opt_out.
 */
export async function setMarketingEmailOptIn(
  optedIn: boolean,
  source: 'signup' | 'settings' | 'mobile_home_prompt'
): Promise<EmailPreferencesResult> {
  const auth = await requireUserId();
  if (auth.error || !auth.userId) {
    return { data: null, error: auth.error ?? { message: 'Connexion requise' } };
  }
  const rpcBySource = {
    signup: 'set_marketing_consent_from_signup',
    settings: 'set_marketing_consent_from_settings',
    mobile_home_prompt: 'set_marketing_consent_from_home_prompt',
  } as const;
  const rpcName = rpcBySource[source];
  const { data, error } = await supabase.rpc(rpcName, {
    p_opted_in: optedIn,
    p_consent_version: MARKETING_CONSENT_VERSION,
  });

  if (error || !data) {
    return {
      data: null,
      error: { message: mapError(error?.message ?? GENERIC_ERROR) },
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: { message: GENERIC_ERROR } };
  return { data: mapRow(row), error: null };
}

/**
 * Opposition spécifique aux rappels de brouillon (indépendante du marketing).
 * `allowed=true` → opt_out false ; `allowed=false` → opt_out true.
 * Ne modifie jamais marketing_opt_in.
 */
export async function setDraftRemindersAllowed(
  allowed: boolean
): Promise<EmailPreferencesResult> {
  const auth = await requireUserId();
  if (auth.error || !auth.userId) {
    return { data: null, error: auth.error ?? { message: 'Connexion requise' } };
  }
  const optOut = !allowed;

  const { data: updated, error: updateError } = await supabase
    .from('email_preferences')
    .update({
      optional_draft_reminders_opt_out: optOut,
    })
    .eq('user_id', auth.userId)
    .select(PREFS_SELECT)
    .maybeSingle();

  if (updateError) {
    return { data: null, error: { message: mapError(updateError.message) } };
  }

  if (updated) {
    return { data: mapRow(updated), error: null };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('email_preferences')
    .insert({
      user_id: auth.userId,
      optional_draft_reminders_opt_out: optOut,
    })
    .select(PREFS_SELECT)
    .single();

  if (insertError || !inserted) {
    return {
      data: null,
      error: { message: mapError(insertError?.message ?? GENERIC_ERROR) },
    };
  }

  return { data: mapRow(inserted), error: null };
}

/**
 * Enregistre l’information préalable sur les rappels brouillon (idempotent).
 * Identité côté SQL via auth.uid() uniquement — pas de p_user_id.
 * N’active aucun envoi et ne force aucun consentement marketing.
 */
export async function acknowledgeDraftRemindersNotice(): Promise<EmailPreferencesResult> {
  const auth = await requireUserId();
  if (auth.error || !auth.userId) {
    return { data: null, error: auth.error ?? { message: 'Connexion requise' } };
  }

  const { error: rpcError } = await supabase.rpc(
    'acknowledge_lifecycle_draft_reminders_notice'
  );

  if (rpcError) {
    return { data: null, error: { message: mapError(rpcError.message) } };
  }

  const prefs = await getEmailPreferences();
  if (prefs.error) {
    return prefs;
  }
  if (!prefs.data.draft_reminders_notice_acknowledged_at) {
    return {
      data: null,
      error: { message: GENERIC_ERROR },
    };
  }
  return prefs;
}
