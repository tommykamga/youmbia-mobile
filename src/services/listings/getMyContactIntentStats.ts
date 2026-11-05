import { supabase } from '@/lib/supabase';

export type ContactIntentStats = {
  total: number;
  byChannel: Record<string, number>;
};

type RpcRow = { channel: string; intent_count: number | string };

export async function getMyContactIntentStats(): Promise<
  | { data: ContactIntentStats; error: null }
  | { data: null; error: string }
> {
  try {
    const { data, error } = await (
      supabase.rpc as unknown as (
        name: 'get_v5_my_contact_intent_stats'
      ) => Promise<{
        data: RpcRow[] | null;
        error: { message: string } | null;
      }>
    )('get_v5_my_contact_intent_stats');

    if (error) return { data: null, error: error.message };
    if (!Array.isArray(data)) {
      return { data: null, error: 'Réponse statistique invalide' };
    }

    const byChannel: Record<string, number> = {};
    let total = 0;

    for (const row of data) {
      if (!row || typeof row.channel !== 'string' ||
          !['message', 'whatsapp', 'call', 'sms'].includes(row.channel)) {
        return { data: null, error: 'Canal statistique invalide' };
      }

      const count = Number(row.intent_count);
      if (!Number.isSafeInteger(count) || count < 0) {
        return { data: null, error: 'Compteur statistique invalide' };
      }

      byChannel[row.channel] = (byChannel[row.channel] ?? 0) + count;
      total += count;
      if (!Number.isSafeInteger(total)) {
        return { data: null, error: 'Total statistique invalide' };
      }
    }

    return { data: { total, byChannel }, error: null };
  } catch {
    return { data: null, error: 'Collecte indisponible' };
  }
}
