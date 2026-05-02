/**
 * Profile service – fetch current user's profile from public.profiles.
 * Same Supabase project as web; RLS allows select for own row.
 */

import { supabase } from '@/lib/supabase';

/** Values considered placeholder/fake; display as empty in UI. */
const FAKE_DISPLAY_VALUES = new Set([
  'utilisateur youmbia',
  '237600000000',
  'douala',
]);

/**
 * Minimal profile shape for mobile. Extend when you run
 * `npx supabase gen types typescript --project-id <id>` and use Database['public']['Tables']['profiles']['Row'].
 * Sprint 5.1 audit: only columns observed in codebase are id, full_name, avatar_url, phone, created_at, updated_at
 * (profile.ts + getListingById: is_verified, is_flagged, trust_score, reports_count, is_banned).
 * No evidence of bio or city/ville in profiles table – do not add until schema confirms they exist.
 */
export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone?: string | null;
  is_banned?: boolean | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Returns empty string if value is a known fake/placeholder, otherwise trimmed value. */
export function sanitizeProfileDisplayValue(value: string | null | undefined): string {
  if (value == null || typeof value !== 'string') return '';
  const t = value.trim();
  if (!t) return '';
  if (FAKE_DISPLAY_VALUES.has(t.toLowerCase())) return '';
  return t;
}

/**
 * Normalize phone for profile save: trim, remove spaces, accept +237.
 * Returns null for empty. Returns error message if manifestly invalid (< 9 digits).
 */
export function normalizePhoneForProfile(raw: string | null | undefined): { value: string | null; error?: string } {
  if (raw == null || typeof raw !== 'string') return { value: null };
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return { value: null };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9) {
    return { value: null, error: 'Numéro invalide (au moins 9 chiffres)' };
  }
  const normalized = trimmed.startsWith('+') ? trimmed : (digits.startsWith('237') ? '+' + digits : digits.length <= 10 ? digits : '+' + digits);
  return { value: normalized };
}

export type GetCurrentProfileResult =
  | { data: ProfileRow; error: null }
  | { data: null; error: { message: string } };

/**
 * Fetches the profile row for the currently authenticated user.
 * Returns null if not signed in or profile not found (RLS).
 */
export async function getCurrentProfile(): Promise<GetCurrentProfileResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      data: null,
      error: { message: userError?.message ?? 'Not authenticated' },
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, phone, is_banned, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  // Ligne absente en base (nouveau compte, trigger manquant) : pas d’erreur — formulaire éditable.
  if (!data) {
    return {
      data: {
        id: user.id,
        full_name: null,
        avatar_url: null,
        phone: null,
        is_banned: null,
      },
      error: null,
    };
  }

  return { data: data as ProfileRow, error: null };
}

/**
 * Normalisation "unicité" : trim, supprime espaces / tirets / parenthèses.
 * (Ne change pas auth / DB : uniquement pour comparer côté client.)
 */
export function normalizePhoneForUniquenessCheck(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.trim().replace(/[\s\-()]/g, '');
}

export type CheckPhoneUniquenessForPublishResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate' };

/**
 * Vérifie côté client qu'aucun autre profil n'utilise le même téléphone normalisé.
 * En cas d'erreur Supabase/réseau, on remonte l'erreur au caller pour appliquer une approche safe.
 */
export async function checkPhoneUniquenessForPublish(
  currentUserId: string,
  rawPhone: string
): Promise<CheckPhoneUniquenessForPublishResult> {
  const normalized = normalizePhoneForUniquenessCheck(rawPhone);
  if (!normalized) return { ok: true };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone')
    .not('phone', 'is', null);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as { id: string | null; phone: string | null }[];
  const conflict = rows.some((row) => {
    const id = String(row.id ?? '').trim();
    if (!id || id === currentUserId) return false;
    const p = normalizePhoneForUniquenessCheck(row.phone);
    return p !== '' && p === normalized;
  });

  return conflict ? { ok: false, reason: 'duplicate' } : { ok: true };
}

export type UpdateProfilePayload = {
  full_name?: string | null;
  phone?: string | null;
};

export type UpdateProfileResult =
  | { data: ProfileRow; error: null }
  | { data: null; error: { message: string } };

/**
 * Updates the current user's profile. Only supported fields are updated.
 * RLS must allow update on own row.
 */
export async function updateProfile(payload: UpdateProfilePayload): Promise<UpdateProfileResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: userError?.message ?? 'Non connecté' } };
  }

  const updates: Record<string, unknown> = {};
  if (payload.full_name !== undefined) {
    updates.full_name = payload.full_name?.trim() || null;
  }
  if (payload.phone !== undefined) {
    const normalized = normalizePhoneForProfile(payload.phone);
    if (normalized.error) {
      return { data: null, error: { message: normalized.error } };
    }
    updates.phone = normalized.value;
  }
  if (Object.keys(updates).length === 0) {
    return getCurrentProfile();
  }

  const selectCols = 'id, full_name, avatar_url, phone, created_at';

  const { data, error } = await supabase
    .from('profiles')
    .update(updates as never)
    .eq('id', user.id)
    .select(selectCols)
    .single();

  if (error) {
    // Profil absent en base (0 row updated) → `.single()` échoue. On tente un upsert minimal.
    const errAny = error as unknown as { code?: string; message?: string };
    const code = (errAny.code ?? '').toUpperCase();
    const msg = String(errAny.message ?? '');
    const looksLikeZeroRowSingle =
      // PostgREST `.single()` when 0 (or >1) rows returned
      code === 'PGRST116' ||
      msg.toLowerCase().includes('json object requested') ||
      msg.toLowerCase().includes('no rows') ||
      msg.toLowerCase().includes('0 rows');

    if (!looksLikeZeroRowSingle) {
      return { data: null, error: { message: error.message } };
    }

    const upsertPayload: Record<string, unknown> = { id: user.id };
    if (Object.prototype.hasOwnProperty.call(updates, 'full_name')) upsertPayload.full_name = updates.full_name;
    if (Object.prototype.hasOwnProperty.call(updates, 'phone')) upsertPayload.phone = updates.phone;

    const { data: upserted, error: upsertError } = await supabase
      .from('profiles')
      .upsert(upsertPayload as never, { onConflict: 'id' })
      .select(selectCols)
      .single();

    if (upsertError) {
      return { data: null, error: { message: upsertError.message } };
    }

    return { data: upserted as ProfileRow, error: null };
  }

  return { data: data as ProfileRow, error: null };
}
