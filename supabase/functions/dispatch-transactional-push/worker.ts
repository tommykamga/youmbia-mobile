export type Delivery = {
  delivery_id: string; claim: string; attempt: number; kind: 'message' | 'favorite';
  target_id: string; source_id: string; first_contact: boolean; expo_push_token: string;
};
export type ReceiptDelivery = { id: string; ticket_id: string; receipt_checks: number };
export type Patch = {
  state?: string; error_code?: string | null; ticket_id?: string;
  available_at?: string; receipt_checks?: number;
};
export interface Store {
  claim(): Promise<Delivery[]>;
  finish(row: Delivery, patch: Patch): Promise<void>;
  receipts(): Promise<ReceiptDelivery[]>;
  receipt(row: ReceiptDelivery, patch: Patch): Promise<void>;
  invalidate(id: string): Promise<void>;
}
export function payload(row: Delivery) {
  const favorite = row.kind === 'favorite';
  return {
    to: row.expo_push_token,
    title: favorite ? 'Votre annonce plaît !' : row.first_contact ? 'Un acheteur vous contacte' : 'Nouveau message YOUMBIA',
    body: favorite ? 'Un utilisateur a ajouté votre annonce à ses favoris.' : row.first_contact
      ? 'Vous avez reçu une demande concernant votre annonce.' : 'Vous avez reçu un nouveau message.',
    data: favorite ? { type: 'listing_favorite', listingId: row.target_id } :
      { type: 'conversation_message', conversationId: row.target_id, messageId: row.source_id },
    sound: 'default', channelId: 'default', priority: 'high',
  };
}

const later = (now: number, seconds: number) => new Date(now + seconds * 1000).toISOString();
const knownErrors = new Set(['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials']);
type Ticket = { status?: string; id?: string; details?: { error?: string } };
function safeError(ticket: Ticket): string {
  const code = ticket.details?.error ?? '';
  return knownErrors.has(code) ? code : 'expo_rejected';
}
export async function dispatch(store: Store, fetcher: typeof fetch, accessToken?: string, now = Date.now()) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // Receipts can be safely queried again: this operation never sends a notification.
  const receipts = await store.receipts();
  if (receipts.length) {
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST', headers, body: JSON.stringify({ ids: receipts.map(r => r.ticket_id) }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('receipt_request_failed');
      const result = await response.json() as { data?: Record<string, Ticket> };
      for (const row of receipts) {
        const ticket = result.data?.[row.ticket_id];
        if (ticket?.status === 'ok') await store.receipt(row, { state: 'delivered', error_code: null });
        else if (ticket?.status === 'error') {
          const code = safeError(ticket);
          await store.receipt(row, { state: 'failed', error_code: code });
          if (code === 'DeviceNotRegistered') await store.invalidate(row.id);
        } else {
          await store.receipt(row, { state: row.receipt_checks >= 23 ? 'uncertain' : 'accepted',
            receipt_checks: row.receipt_checks + 1, available_at: later(now, 3600), error_code: 'receipt_missing' });
        }
      }
    } catch {
      for (const row of receipts) await store.receipt(row, {
        state: row.receipt_checks >= 23 ? 'uncertain' : 'accepted', receipt_checks: row.receipt_checks + 1,
        available_at: later(now, 3600), error_code: 'receipt_unavailable',
      });
    }
  }
  const rows = await store.claim();
  // Claim at most 50, send sequentially: one recipient device failure cannot replay another.
  for (const row of rows) {
    let patch: Patch;
    try {
      const response = await fetcher('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers, body: JSON.stringify([payload(row)]), signal: AbortSignal.timeout(10000),
      });
      if (response.status === 429 || response.status >= 500) {
        patch = { state: row.attempt >= 5 ? 'failed' : 'pending', error_code: `expo_http_${response.status}`,
          available_at: later(now, Math.max(Math.min(Number(response.headers.get('Retry-After')) || 0, 3600), 30 * 2 ** (row.attempt - 1))) };
      } else if (!response.ok) patch = { state: 'failed', error_code: `expo_http_${response.status}` };
      else {
        const result = await response.json() as { data?: Ticket[] };
        const ticket = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : undefined;
        if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length) {
          patch = { state: 'accepted', ticket_id: ticket.id, available_at: later(now, 900), error_code: null };
        } else if (ticket?.status === 'error') {
          const code = safeError(ticket);
          patch = { state: code === 'MessageRateExceeded' && row.attempt < 5 ? 'pending' : 'failed',
            error_code: code, available_at: later(now, 30 * 2 ** (row.attempt - 1)) };
        } else patch = { state: 'uncertain', error_code: 'invalid_expo_response' };
      }
    } catch {
      patch = { state: 'uncertain', error_code: 'send_outcome_unknown' };
    }
    // If persistence fails, stop. The lease expires to uncertain; no blind resend.
    await store.finish(row, patch);
    if (patch.error_code === 'DeviceNotRegistered') await store.invalidate(row.delivery_id);
  }
  return { claimed: rows.length, receipts: receipts.length };
}
