/**
 * Supabase client for YOUMBIA mobile.
 * Uses the same project as the web app (same URL + anon key).
 *
 * Session persistence:
 * - We try to install expo-sqlite localStorage polyfill at runtime.
 * - If unavailable, we do not crash the app at import time.
 */

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let sqliteStorageInstalled = false;

try {
  require('expo-sqlite/localStorage/install');
  sqliteStorageInstalled = true;
  console.log('[supabase] expo-sqlite localStorage polyfill loaded');
} catch (error) {
  sqliteStorageInstalled = false;
  console.error('[supabase] Failed to load expo-sqlite localStorage polyfill', error);
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. ' +
    'Copy .env.example to .env and set the values. The app will not be able to connect.'
  );
}

const authStorage =
  typeof globalThis.localStorage !== 'undefined' &&
    typeof globalThis.localStorage.getItem === 'function'
    ? globalThis.localStorage
    : undefined;

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const canPersistSession = Boolean(sqliteStorageInstalled && authStorage);

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: canPersistSession ? authStorage : undefined,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: canPersistSession,
      detectSessionInUrl: false,
    },
  }
);

export const supabaseRuntime = {
  isConfigured: isSupabaseConfigured,
  sqliteStorageInstalled,
  canPersistSession,
};