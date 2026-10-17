/**
 * Client Supabase pour Edge Functions — résolution offline (bundle local).
 * Remplace esm.sh pour Edge Runtime sur réseau --internal.
 */
export {
  createClient,
  type SupabaseClient,
} from '../_vendor/supabase-js-bundle.mjs';
