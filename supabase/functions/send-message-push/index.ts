// Edge Function: send-message-push
//
// Envoie une vraie notification push (Expo) au DESTINATAIRE d'un message interne.
// - Reçoit { message_id }.
// - Charge le message + la conversation, déduit receiver_id (jamais le sender).
// - Récupère les tokens du destinataire et POST vers l'API Expo Push.
// - Nettoie les tokens "DeviceNotRegistered".
//
// Sécurité :
// - Utilise SERVICE_ROLE uniquement côté serveur (jamais exposé à l'app).
// - Vérifie via le JWT de l'appelant qu'il est bien l'expéditeur du message
//   (évite qu'un tiers déclenche des push arbitraires).
// - Payload V1 sans contenu sensible (corps du message non inclus).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: 'server_misconfigured' });
  }

  let messageId = '';
  try {
    const body = await req.json();
    messageId = String(body?.message_id ?? '').trim();
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!messageId) {
    return json(400, { error: 'missing_message_id' });
  }

  // Client privilégié (service_role) pour les lectures/écritures serveur.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Charger le message.
  const { data: message, error: messageError } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', messageId)
    .maybeSingle();

  if (messageError) return json(500, { error: 'message_lookup_failed' });
  if (!message) return json(404, { error: 'message_not_found' });

  // 2. Vérifier que l'appelant (JWT) est bien l'expéditeur du message.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (ANON_KEY && authHeader.startsWith('Bearer ')) {
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller } = await authed.auth.getUser();
    if (!caller?.user || caller.user.id !== message.sender_id) {
      return json(403, { error: 'forbidden' });
    }
  } else {
    return json(401, { error: 'unauthorized' });
  }

  // 3. Charger la conversation et déterminer le destinataire.
  const { data: conversation, error: convError } = await admin
    .from('conversations')
    .select('id, buyer_id, seller_id')
    .eq('id', message.conversation_id)
    .maybeSingle();

  if (convError) return json(500, { error: 'conversation_lookup_failed' });
  if (!conversation) return json(404, { error: 'conversation_not_found' });

  const receiverId =
    message.sender_id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;

  // Ne jamais notifier l'expéditeur.
  if (!receiverId || receiverId === message.sender_id) {
    return json(200, { ok: true, skipped: 'no_receiver' });
  }

  // 4. Récupérer les tokens actifs du destinataire.
  const { data: tokenRows, error: tokensError } = await admin
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', receiverId);

  if (tokensError) return json(500, { error: 'tokens_lookup_failed' });

  const tokens: string[] = (tokenRows ?? [])
    .map((r: { expo_push_token: string }) => r.expo_push_token)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  if (tokens.length === 0) {
    return json(200, { ok: true, skipped: 'no_tokens' });
  }

  // 5. Construire et envoyer les notifications (payload sans contenu sensible).
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: 'Nouveau message YOUMBIA',
    body: 'Vous avez reçu un nouveau message',
    data: {
      type: 'conversation_message',
      conversationId: message.conversation_id,
      messageId: message.id,
    },
    sound: 'default',
  }));

  let expoResult: unknown = null;
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
    expoResult = await resp.json();
  } catch (err) {
    return json(502, { error: 'expo_request_failed', detail: String(err) });
  }

  // 6. Nettoyage des tokens invalides (DeviceNotRegistered).
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
  }

  return json(200, {
    ok: true,
    sent: tokens.length,
    cleaned: invalidTokens.length,
  });
});
