/**
 * Supabase client for YOUMBIA mobile.
 * Uses the same project as the web app (same URL + anon key).
 *
 * Session persistence (Expo-specific):
 * - We use expo-sqlite's localStorage polyfill (expo-sqlite/localStorage/install).
 * - It provides a localStorage-like API backed by SQLite on device so the session
 *   survives app restarts and is scoped to the app sandbox.
 *
 * Safety: if env vars are missing we log an error and create a no-op client instead
 * of throwing at import time (which would crash every screen that imports this module).
 */

import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  // Log clearly but do NOT throw: a throw here crashes every screen that imports
  // this module, making debugging impossible. Supabase calls will fail with auth
  // errors instead, which are caught gracefully by each service.
  console.error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. ' +
      'Copy .env.example to .env and set the values. The app will not be able to connect.'
  );
}

// Resolve storage: expo-sqlite/localStorage/install patches the global, but only
// after module evaluation. Guard against the polyfill not being ready yet.
const authStorage =
  typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
    ? localStorage
    : undefined;

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
