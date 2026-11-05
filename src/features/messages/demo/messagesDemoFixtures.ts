import type { Conversation } from '@/services/conversations/types';
import { sortConversationsInbox } from '@/features/messages/inboxPatches';
import { messagesDemoImageUri } from './messagesDemoImages';

const DEMO_USER = '00000000-0000-4000-8000-000000000demo';
const DEMO_PEER_PREFIX = '00000000-0000-4000-8000-00000000';

function conv(partial: Conversation): Conversation {
  return partial;
}

/** Conversations fictives — IDs préfixe msg-demo-*, jamais routés vers Supabase. */
const BASE_CONVERSATIONS: Conversation[] = [
  conv({
    id: 'msg-demo-conv-01',
    listing_id: 'msg-demo-listing-01',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}01`,
    created_at: '2026-11-04T09:00:00.000Z',
    updated_at: '2026-11-04T14:20:00.000Z',
    listing_title: '[Démo] Smartphone Android 128 Go',
    other_party_name: 'Amadou Ndjeya',
    last_message_at: '2026-11-04T14:20:00.000Z',
    last_message_preview: 'Bonjour, le téléphone est-il toujours disponible ?',
    unread_count: 2,
  }),
  conv({
    id: 'msg-demo-conv-02',
    listing_id: 'msg-demo-listing-02',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}02`,
    created_at: '2026-11-03T11:00:00.000Z',
    updated_at: '2026-11-03T18:45:00.000Z',
    listing_title: 'Voiture familiale — Toyota Avensis',
    other_party_name: 'Chantal Mbarga',
    last_message_at: '2026-11-03T18:45:00.000Z',
    last_message_preview: 'Merci, je passe demain matin.',
    unread_count: 0,
  }),
  conv({
    id: 'msg-demo-conv-03',
    listing_id: 'msg-demo-listing-03',
    buyer_id: `${DEMO_PEER_PREFIX}03`,
    seller_id: DEMO_USER,
    created_at: '2026-11-04T08:15:00.000Z',
    updated_at: '2026-11-04T10:05:00.000Z',
    listing_title: 'Canapé trois places — tissu gris',
    other_party_name: 'Jean-Paul Fotso',
    last_message_at: '2026-11-04T10:05:00.000Z',
    last_message_preview: 'Pouvez-vous envoyer d’autres photos ?',
    unread_count: 1,
  }),
  conv({
    id: 'msg-demo-conv-04',
    listing_id: 'msg-demo-listing-04',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}04`,
    created_at: '2026-11-02T16:00:00.000Z',
    updated_at: '2026-11-04T07:30:00.000Z',
    listing_title:
      'Ordinateur portable professionnel 15 pouces — SSD 512 Go, 16 Go RAM, garantie constructeur jusqu’en 2027',
    other_party_name: 'Stéphanie Abanda',
    last_message_at: '2026-11-04T07:30:00.000Z',
    last_message_preview: 'D’accord pour 385 000 FCFA.',
    unread_count: 0,
  }),
  conv({
    id: 'msg-demo-conv-05',
    listing_id: 'msg-demo-listing-05',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}05`,
    created_at: '2026-11-01T12:00:00.000Z',
    updated_at: '2026-11-01T12:30:00.000Z',
    listing_title: 'Appartement deux pièces — centre-ville',
    other_party_name: 'Brice Tchokouani',
    last_message_at: '2026-11-01T12:30:00.000Z',
    last_message_preview: 'Démarrer la conversation',
    unread_count: 0,
  }),
  conv({
    id: 'msg-demo-conv-06',
    listing_id: 'msg-demo-listing-06',
    buyer_id: `${DEMO_PEER_PREFIX}06`,
    seller_id: DEMO_USER,
    created_at: '2026-11-04T13:00:00.000Z',
    updated_at: '2026-11-04T13:55:00.000Z',
    listing_title: 'Lot vêtements femme — taille M',
    other_party_name: 'Mireille Essomba',
    last_message_at: '2026-11-04T13:55:00.000Z',
    last_message_preview:
      'Bonjour, je suis intéressée par le lot complet mais j’aimerais savoir si vous pouvez séparer les pièces et préciser l’état de chaque article avant de me déplacer depuis le centre-ville.',
    unread_count: 0,
  }),
  conv({
    id: 'msg-demo-conv-07',
    listing_id: 'msg-demo-listing-07',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}07`,
    created_at: '2026-09-15T08:00:00.000Z',
    updated_at: '2026-09-20T17:10:00.000Z',
    listing_title: 'Service plomberie à domicile',
    other_party_name: 'Ibrahim Ousman',
    last_message_at: '2026-09-20T17:10:00.000Z',
    last_message_preview: 'Je peux passer samedi matin.',
    unread_count: 0,
  }),
  conv({
    id: 'msg-demo-conv-08',
    listing_id: 'msg-demo-listing-08',
    buyer_id: DEMO_USER,
    seller_id: `${DEMO_PEER_PREFIX}08`,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-02T09:00:00.000Z',
    listing_title: undefined,
    other_party_name: 'Utilisateur',
    last_message_at: '2026-08-02T09:00:00.000Z',
    last_message_preview: 'Annonce retirée — merci quand même.',
    unread_count: 0,
  }),
];

function buildDemoThumbByListingId(): Record<string, string> {
  return {
    'msg-demo-listing-01': messagesDemoImageUri('phone_01'),
    'msg-demo-listing-02': messagesDemoImageUri('car_01'),
    'msg-demo-listing-03': messagesDemoImageUri('home_02'),
    'msg-demo-listing-04': messagesDemoImageUri('tech_01'),
    'msg-demo-listing-06': messagesDemoImageUri('fashion_01'),
    'msg-demo-listing-07': messagesDemoImageUri('home_01'),
  };
}

export const MESSAGE_DEMO_PREVIEW_BODY: Record<string, string> = {
  'msg-demo-conv-01':
    'Conversation de démonstration — échange simulé autour d’un smartphone à Douala. Aucun message n’est enregistré.',
  'msg-demo-conv-02':
    'Conversation de démonstration — voiture familiale à Yaoundé, fil déjà lu.',
  'msg-demo-conv-03': 'Conversation de démonstration — canapé à Bafoussam, un message non lu simulé.',
  'msg-demo-conv-04': 'Conversation de démonstration — titre d’annonce volontairement long.',
  'msg-demo-conv-05': 'Conversation de démonstration — annonce sans photo (placeholder attendu).',
  'msg-demo-conv-06': 'Conversation de démonstration — aperçu de message très long dans la liste.',
  'msg-demo-conv-07': 'Conversation de démonstration — dernière activité ancienne (date relative).',
  'msg-demo-conv-08': 'Conversation de démonstration — annonce indisponible, sans miniature.',
};

export function createMessagesDemoSnapshot(): {
  conversations: Conversation[];
  thumbByListingId: Record<string, string>;
} {
  const conversations = BASE_CONVERSATIONS.map((c) => ({ ...c }));
  sortConversationsInbox(conversations);
  return {
    conversations,
    thumbByListingId: buildDemoThumbByListingId(),
  };
}

export const MESSAGE_DEMO_CONVERSATION_COUNT = BASE_CONVERSATIONS.length;
