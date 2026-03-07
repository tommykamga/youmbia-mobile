/**
 * Supabase client for YOUMBIA mobile.
 * Uses the same project as the web app (same URL + anon key).
 *
 * Configuration (fail-fast):
 * - EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (e.g. in .env).
 * - If either is missing or empty, this module throws at load time with a clear message.
 * - No placeholder or fake credentials: avoids ambiguous runtime failures and hidden misconfig.
 *
 * Session persistence (Expo-specific):
 * - We use expo-sqlite's localStorage polyfill (see expo-sqlite/localStorage/install).
 * - It provides a localStorage-like API backed by SQLite on device, so the session
 *   survives app restarts and is scoped to the app sandbox.
 * - Alternative (expo-secure-store) is encrypted but has a ~2KB value limit on Android;
 *   Supabase session JSON often exceeds that, so we follow Expo's recommended approach.
 */

import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabase] Missing required env: EXPO_PUBLIC_SUPABASE_URL and/or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and set the values from your Supabase project settings.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
