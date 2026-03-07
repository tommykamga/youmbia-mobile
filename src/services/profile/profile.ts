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
    .select('id, full_name, avatar_url, phone, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  if (!data) {
    return { data: null, error: { message: 'Profile not found' } };
  }

  return { data: data as ProfileRow, error: null };
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

  const { data, error } = await supabase
    .from('profiles')
    .update(updates as never)
    .eq('id', user.id)
    .select('id, full_name, avatar_url, phone, created_at, updated_at')
    .single();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: data as ProfileRow, error: null };
}
