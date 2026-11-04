import type { Message } from '@/services/conversations/types';
import { formatPrice } from '@/lib/format';

/** Utilisateur « moi » dans la démo inbox — aligné fixtures inbox. */
export const DEMO_THREAD_VIEWER_ID = '00000000-0000-4000-8000-000000000demo';

const DEMO_PEER_PREFIX = '00000000-0000-4000-8000-00000000';

function peerId(suffix: string): string {
  return `${DEMO_PEER_PREFIX}${suffix}`;
}

function msg(
  id: string,
  conversationId: string,
  senderId: string,
  body: string,
  createdAt: string,
  readAt: string | null = null
): Message {
  return {
    id,
    conversation_id: conversationId,
    sender_id: senderId,
    body,
    created_at: createdAt,
    read_at: readAt,
  };
}

/** Prix fictifs FCFA pour le bandeau fil démo (pas de requête listings). */
const DEMO_LISTING_PRICE: Record<string, number> = {
  'msg-demo-listing-01': 185_000,
  'msg-demo-listing-02': 4_500_000,
  'msg-demo-listing-03': 320_000,
  'msg-demo-listing-04': 385_000,
  'msg-demo-listing-05': 95_000,
  'msg-demo-listing-06': 45_000,
  'msg-demo-listing-07': 25_000,
};

export function getDemoThreadListingPriceLabel(listingId: string): string | null {
  const price = DEMO_LISTING_PRICE[listingId];
  if (typeof price !== 'number') return null;
  const label = formatPrice(price);
  return label || null;
}

const THREAD_BY_CONV: Record<string, Message[]> = {
  'msg-demo-conv-01': [
    msg(
      'msg-demo-m-01-1',
      'msg-demo-conv-01',
      peerId('01'),
      'Bonjour, le téléphone est-il toujours disponible ?',
      '2026-11-04T09:05:00.000Z'
    ),
    msg(
      'msg-demo-m-01-2',
      'msg-demo-conv-01',
      DEMO_THREAD_VIEWER_ID,
      'Oui, toujours disponible à Douala.',
      '2026-11-04T09:12:00.000Z',
      '2026-11-04T09:20:00.000Z'
    ),
    msg(
      'msg-demo-m-01-3',
      'msg-demo-conv-01',
      peerId('01'),
      'Parfait, je peux passer cet après-midi vers 16 h.',
      '2026-11-04T14:20:00.000Z'
    ),
  ],
  'msg-demo-conv-02': [
    msg(
      'msg-demo-m-02-1',
      'msg-demo-conv-02',
      DEMO_THREAD_VIEWER_ID,
      'Bonjour, la voiture est-elle toujours en vente ?',
      '2026-11-03T11:30:00.000Z',
      '2026-11-03T12:00:00.000Z'
    ),
    msg(
      'msg-demo-m-02-2',
      'msg-demo-conv-02',
      peerId('02'),
      'Oui, vous pouvez la voir demain matin.',
      '2026-11-03T18:45:00.000Z'
    ),
    msg(
      'msg-demo-m-02-3',
      'msg-demo-conv-02',
      DEMO_THREAD_VIEWER_ID,
      'Merci, je passe demain matin.',
      '2026-11-03T18:50:00.000Z',
      '2026-11-03T19:00:00.000Z'
    ),
  ],
  'msg-demo-conv-03': [
    msg(
      'msg-demo-m-03-1',
      'msg-demo-conv-03',
      peerId('03'),
      'Bonjour, le canapé est-il toujours disponible ?',
      '2026-11-04T08:20:00.000Z'
    ),
    msg(
      'msg-demo-m-03-2',
      'msg-demo-conv-03',
      peerId('03'),
      'Pouvez-vous envoyer d’autres photos ?',
      '2026-11-04T10:05:00.000Z'
    ),
  ],
  'msg-demo-conv-04': [
    msg(
      'msg-demo-m-04-1',
      'msg-demo-conv-04',
      peerId('04'),
      'Bonjour, votre annonce m’intéresse beaucoup.',
      '2026-11-02T16:10:00.000Z'
    ),
    msg(
      'msg-demo-m-04-2',
      'msg-demo-conv-04',
      DEMO_THREAD_VIEWER_ID,
      'Bonjour ! Le PC est en excellent état, peu servi.',
      '2026-11-03T10:00:00.000Z',
      '2026-11-03T11:00:00.000Z'
    ),
    msg(
      'msg-demo-m-04-3',
      'msg-demo-conv-04',
      peerId('04'),
      'D’accord pour 385 000 FCFA.',
      '2026-11-04T07:30:00.000Z'
    ),
  ],
  'msg-demo-conv-05': [],
  'msg-demo-conv-06': [
    msg(
      'msg-demo-m-06-1',
      'msg-demo-conv-06',
      peerId('06'),
      'Bonjour, je suis intéressée par le lot complet mais j’aimerais savoir si vous pouvez séparer les pièces et préciser l’état de chaque article avant de me déplacer depuis le centre-ville.\n\nMerci d’avance pour votre retour.',
      '2026-11-04T13:55:00.000Z'
    ),
  ],
  'msg-demo-conv-07': [
    msg(
      'msg-demo-m-07-1',
      'msg-demo-conv-07',
      DEMO_THREAD_VIEWER_ID,
      'Bonjour, êtes-vous disponible samedi ?',
      '2026-09-15T08:30:00.000Z',
      '2026-09-15T09:00:00.000Z'
    ),
    msg(
      'msg-demo-m-07-2',
      'msg-demo-conv-07',
      peerId('07'),
      'Je peux passer samedi matin.',
      '2026-09-20T17:10:00.000Z'
    ),
  ],
  'msg-demo-conv-08': [
    msg(
      'msg-demo-m-08-1',
      'msg-demo-conv-08',
      DEMO_THREAD_VIEWER_ID,
      'Bonjour, l’annonce est-elle toujours active ?',
      '2026-08-01T10:30:00.000Z',
      '2026-08-01T11:00:00.000Z'
    ),
    msg(
      'msg-demo-m-08-2',
      'msg-demo-conv-08',
      peerId('08'),
      'Annonce retirée — merci quand même.',
      '2026-08-02T09:00:00.000Z'
    ),
  ],
};

export function createDemoThreadMessages(conversationId: string): Message[] {
  const seed = THREAD_BY_CONV[conversationId] ?? [];
  return seed.map((m) => ({ ...m }));
}

export function createLocalDemoSentMessage(
  conversationId: string,
  body: string
): Message {
  return {
    id: `msg-demo-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: conversationId,
    sender_id: DEMO_THREAD_VIEWER_ID,
    body,
    created_at: new Date().toISOString(),
    read_at: null,
  };
}
