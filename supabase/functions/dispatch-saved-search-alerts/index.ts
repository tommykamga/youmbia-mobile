// Edge Function: dispatch-saved-search-alerts
//
// Pipeline serveur uniquement :
//   INSERT listing active → trigger matching → ledger → pg_net → cette fonction → Expo.
//   Cron */5 min = filet. Claim atomique DB : un seul dispatcher envoie le push.
//
// Corps accepté : { listing_id } uniquement.
// Interdit : user_id, destinataires, tokens, JWT utilisateur comme autorité.
// Auth HTTP : header X-Saved-Search-Dispatch-Secret = secret Vault / Deno env.
// Service role : uniquement via Deno.env (jamais envoyé par le client, jamais dans le body).
// Mutations ledger : RPC claim/complete uniquement (pas d’UPDATE direct).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const LISTING_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
};

type ClaimOutcome = 'notified' | 'released' | 'expired';

type ClaimedMatch = {
  id: string;
  saved_search_id: string;
  listing_id: string;
  user_id: string;
  enabled: boolean;
  name: string | null;
  query: string;
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function readDefaultSecretKey(): string | null {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const secretKeys = JSON.parse(raw);
    if (!secretKeys || typeof secretKeys !== 'object' || Array.isArray(secretKeys)) {
      return null;
    }
    const value = secretKeys['default'];
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function secretsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function notificationBody(title: string, city: string): string {
  const safeTitle = title.trim();
  const safeCity = city.trim();
  if (safeTitle && safeCity) return `${safeTitle} à ${safeCity}`;
  if (safeTitle) return safeTitle;
  return 'Une nouvelle annonce correspond à votre recherche';
}

async function completeClaim(
  admin: SupabaseClient,
  claimId: string,
  matchIds: string[],
  outcome: ClaimOutcome
): Promise<void> {
  if (matchIds.length === 0) return;
  const { error } = await admin.rpc('complete_saved_search_alert_claim', {
    p_claim_id: claimId,
    p_match_ids: matchIds,
    p_outcome: outcome,
  });
  if (error) {
    throw new Error(`complete_claim_failed:${outcome}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = readDefaultSecretKey();
  const DISPATCH_SECRET = Deno.env.get('SAVED_SEARCH_DISPATCH_SECRET') ?? '';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DISPATCH_SECRET) {
    return json(500, { error: 'server_misconfigured' });
  }

  const providedSecret = String(req.headers.get('X-Saved-Search-Dispatch-Secret') ?? '').trim();
  if (!providedSecret || !secretsEqual(providedSecret, DISPATCH_SECRET)) {
    return json(401, { error: 'unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'invalid_body' });
  }
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'listing_id') {
    return json(400, { error: 'unexpected_field' });
  }

  const listingId = String(body.listing_id ?? '').trim();
  if (!listingId || !LISTING_ID_RE.test(listingId)) {
    return json(400, { error: 'missing_listing_id' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const claimId = crypto.randomUUID();
  const { data: claimedRows, error: claimError } = await admin.rpc('claim_saved_search_alerts', {
    p_listing_id: listingId,
    p_claim_id: claimId,
  });

  if (claimError) return json(500, { error: 'claim_failed' });

  const claimed = (claimedRows ?? []) as ClaimedMatch[];
  if (claimed.length === 0) {
    return json(200, { ok: true, skipped: 'no_claim' });
  }

  const held = new Set(claimed.map((row) => row.id));

  try {
    const { data: listing, error: listingError } = await admin
      .from('listings')
      .select('id, user_id, status, title, city')
      .eq('id', listingId)
      .maybeSingle();

    if (listingError) {
      await completeClaim(admin, claimId, [...held], 'released');
      held.clear();
      return json(500, { error: 'listing_lookup_failed' });
    }

    if (!listing || listing.status !== 'active') {
      await completeClaim(admin, claimId, [...held], 'expired');
      held.clear();
      return json(200, {
        ok: true,
        skipped: listing ? 'listing_inactive' : 'listing_not_found',
      });
    }

    const closeIds: string[] = [];
    const pending = claimed.filter((row) => {
      if (!row.enabled || !row.user_id || row.user_id === listing.user_id) {
        closeIds.push(row.id);
        return false;
      }
      return true;
    });

    if (closeIds.length > 0) {
      await completeClaim(admin, claimId, closeIds, 'expired');
      closeIds.forEach((id) => held.delete(id));
    }

    if (pending.length === 0) {
      return json(200, { ok: true, skipped: 'no_pending_matches', closed: closeIds.length });
    }

    const byUser = new Map<string, { matchIds: string[]; savedSearchId: string }>();
    for (const row of pending) {
      const existing = byUser.get(row.user_id);
      if (existing) {
        existing.matchIds.push(row.id);
        continue;
      }
      byUser.set(row.user_id, {
        matchIds: [row.id],
        savedSearchId: row.saved_search_id,
      });
    }

    const href = `/listing/${listing.id}`;
    const bodyText = notificationBody(String(listing.title ?? ''), String(listing.city ?? ''));
    let sent = 0;
    let cleaned = 0;
    const notifiedMatchIds: string[] = [];
    const releasedMatchIds: string[] = [];

    for (const [userId, group] of byUser.entries()) {
      const { data: tokenRows, error: tokensError } = await admin
        .from('user_push_tokens')
        .select('expo_push_token')
        .eq('user_id', userId);

      if (tokensError) {
        releasedMatchIds.push(...group.matchIds);
        continue;
      }

      const tokens: string[] = (tokenRows ?? [])
        .map((r: { expo_push_token: string }) => r.expo_push_token)
        .filter((t): t is string => typeof t === 'string' && t.length > 0);

      // Zéro token (permission refusée / pas d’appareil) : clôturer, pas de retry infini.
      if (tokens.length === 0) {
        notifiedMatchIds.push(...group.matchIds);
        continue;
      }

      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        title: 'Nouvelle annonce pour votre recherche',
        body: bodyText,
        data: {
          type: 'saved_search_match',
          listingId: listing.id,
          savedSearchId: group.savedSearchId,
          href,
        },
        sound: 'default',
      }));

      let expoResult: unknown = null;
      let expoOk = false;
      try {
        const resp = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(messages),
        });
        if (resp.ok) {
          expoResult = await resp.json();
          expoOk = true;
        }
      } catch {
        releasedMatchIds.push(...group.matchIds);
        continue;
      }

      if (!expoOk) {
        releasedMatchIds.push(...group.matchIds);
        continue;
      }

      sent += tokens.length;
      notifiedMatchIds.push(...group.matchIds);

      const tickets = Array.isArray((expoResult as { data?: unknown })?.data)
        ? ((expoResult as { data: Array<{ status?: string; details?: { error?: string } }> }).data)
        : [];
      const invalidTokens: string[] = [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          const badToken = tokens[index];
          if (badToken) invalidTokens.push(badToken);
        }
      });
      if (invalidTokens.length > 0) {
        await admin.from('user_push_tokens').delete().in('expo_push_token', invalidTokens);
        cleaned += invalidTokens.length;
      }
    }

    if (notifiedMatchIds.length > 0) {
      await completeClaim(admin, claimId, notifiedMatchIds, 'notified');
      notifiedMatchIds.forEach((id) => held.delete(id));
    }
    if (releasedMatchIds.length > 0) {
      await completeClaim(admin, claimId, releasedMatchIds, 'released');
      releasedMatchIds.forEach((id) => held.delete(id));
    }
    if (held.size > 0) {
      await completeClaim(admin, claimId, [...held], 'released');
      held.clear();
    }

    return json(200, {
      ok: true,
      sent,
      cleaned,
      users: byUser.size,
      closed: notifiedMatchIds.length + closeIds.length,
      released: releasedMatchIds.length,
    });
  } catch {
    try {
      await completeClaim(admin, claimId, [...held], 'released');
    } catch {
      // Crash / complete failed : claim récupérable après timeout 10 min.
    }
    return json(500, { error: 'dispatch_failed' });
  }
});
