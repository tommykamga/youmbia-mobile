import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyConversationUndeleteOnNewMessage,
  conversationsVisibleForUserOrFilter,
  isConversationVisibleForUser,
} from '@/lib/conversationVisibility';
import { hideConversationForMe } from '@/services/conversations/hideConversationForMe';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** Extrait le corps SQL de conversations_undelete_on_new_message (entre AS $$ et $$;). */
function undeleteFunctionBody(mig: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.conversations_undelete_on_new_message()';
  const start = mig.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const after = mig.slice(start);
  const bodyStart = after.indexOf('AS $$');
  const bodyEnd = after.indexOf('$$;', bodyStart + 4);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return after.slice(bodyStart, bodyEnd);
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  },
}));

const BUYER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SELLER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HIDDEN_AT = '2026-09-09T10:00:00.000Z';

describe('conversation hide-for-me — visibilité', () => {
  it('A masqué => invisible pour A, visible pour B ; messages non concernés', () => {
    const conv = {
      buyer_id: BUYER,
      seller_id: SELLER,
      buyer_deleted_at: HIDDEN_AT,
      seller_deleted_at: null,
    };
    expect(isConversationVisibleForUser(conv, BUYER)).toBe(false);
    expect(isConversationVisibleForUser(conv, SELLER)).toBe(true);
  });

  it('filtre PostgREST n’inclut que deleted_at IS NULL pour le rôle courant', () => {
    const filter = conversationsVisibleForUserOrFilter(BUYER);
    expect(filter).toContain(`buyer_id.eq.${BUYER}`);
    expect(filter).toContain('buyer_deleted_at.is.null');
    expect(filter).toContain(`seller_id.eq.${BUYER}`);
    expect(filter).toContain('seller_deleted_at.is.null');
  });
});

describe('applyConversationUndeleteOnNewMessage — règles destinataire only', () => {
  it('1–2) buyer hidden, seller sends => buyer_deleted_at NULL ; seller_deleted_at inchangé', () => {
    const next = applyConversationUndeleteOnNewMessage(
      {
        buyer_id: BUYER,
        seller_id: SELLER,
        buyer_deleted_at: HIDDEN_AT,
        seller_deleted_at: HIDDEN_AT,
      },
      SELLER
    );
    expect(next.buyer_deleted_at).toBeNull();
    expect(next.seller_deleted_at).toBe(HIDDEN_AT);
  });

  it('3–4) seller hidden, buyer sends => seller_deleted_at NULL ; buyer_deleted_at inchangé', () => {
    const next = applyConversationUndeleteOnNewMessage(
      {
        buyer_id: BUYER,
        seller_id: SELLER,
        buyer_deleted_at: HIDDEN_AT,
        seller_deleted_at: HIDDEN_AT,
      },
      BUYER
    );
    expect(next.seller_deleted_at).toBeNull();
    expect(next.buyer_deleted_at).toBe(HIDDEN_AT);
  });

  it('5) sender masqué qui envoie lui-même => son propre flag reste masqué', () => {
    const asBuyer = applyConversationUndeleteOnNewMessage(
      {
        buyer_id: BUYER,
        seller_id: SELLER,
        buyer_deleted_at: HIDDEN_AT,
        seller_deleted_at: null,
      },
      BUYER
    );
    expect(asBuyer.buyer_deleted_at).toBe(HIDDEN_AT);
    expect(asBuyer.seller_deleted_at).toBeNull();

    const asSeller = applyConversationUndeleteOnNewMessage(
      {
        buyer_id: BUYER,
        seller_id: SELLER,
        buyer_deleted_at: null,
        seller_deleted_at: HIDDEN_AT,
      },
      SELLER
    );
    expect(asSeller.seller_deleted_at).toBe(HIDDEN_AT);
    expect(asSeller.buyer_deleted_at).toBeNull();
  });
});

describe('hideConversationForMe', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
  });

  it('appelle la RPC hide_conversation_for_me (idempotent côté serveur)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: BUYER } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await hideConversationForMe(CONV);
    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('hide_conversation_for_me', {
      p_conversation_id: CONV,
    });
  });

  it('refuse si non participant (message RPC)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: BUYER } }, error: null });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'not a participant of this conversation' },
    });
    const result = await hideConversationForMe(CONV);
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/autorisé/i);
  });
});

describe('migration + contrats hide-for-me', () => {
  it('migration : colonnes + RPC own-only + trigger undelete ciblé + pas de hard-delete', () => {
    const mig = read('supabase/migrations/20260909120000_conversation_hide_for_me_v1.sql');
    expect(mig).toMatch(/buyer_deleted_at/);
    expect(mig).toMatch(/seller_deleted_at/);
    expect(mig).toMatch(/hide_conversation_for_me/);
    expect(mig).toMatch(/conversations_undelete_on_new_message/);
    expect(mig).toMatch(/AFTER INSERT ON public\.messages/);
    expect(mig).not.toMatch(/DELETE FROM public\.messages/i);
    expect(mig).not.toMatch(/DELETE FROM public\.conversations/i);
    expect(mig).not.toMatch(/DROP TABLE/i);
    expect(mig).not.toMatch(/ALTER TABLE public\.conversation_reports/i);
  });

  it('6) undelete SQL : destinataire only ; SECURITY DEFINER ; aucun hard-delete', () => {
    const mig = read('supabase/migrations/20260909120000_conversation_hide_for_me_v1.sql');
    const fnStart = mig.indexOf(
      'CREATE OR REPLACE FUNCTION public.conversations_undelete_on_new_message()'
    );
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBlock = mig.slice(fnStart, mig.indexOf('$$;', fnStart) + 3);
    expect(fnBlock).toMatch(/SECURITY DEFINER/);
    expect(fnBlock).toMatch(/SET search_path = public/);

    const body = undeleteFunctionBody(mig);
    expect(body).toMatch(/NEW\.sender_id = v_buyer/);
    expect(body).toMatch(/NEW\.sender_id = v_seller/);
    expect(body).toMatch(/SET seller_deleted_at = NULL/);
    expect(body).toMatch(/SET buyer_deleted_at = NULL/);
    // Ne doit plus clear les deux flags dans le même UPDATE.
    expect(body).not.toMatch(
      /SET\s+buyer_deleted_at\s*=\s*NULL\s*,\s*seller_deleted_at\s*=\s*NULL/i
    );
    expect(body).not.toMatch(
      /SET\s+seller_deleted_at\s*=\s*NULL\s*,\s*buyer_deleted_at\s*=\s*NULL/i
    );
    expect(fnBlock).not.toMatch(/DELETE FROM/i);
  });

  it('inbox / unread filtrent via conversationsVisibleForUserOrFilter', () => {
    const inbox = read('src/services/conversations/getConversations.ts');
    const unread = read('src/services/conversations/getUnreadConversationsCount.ts');
    const messagesUi = read('app/(tabs)/messages.tsx');
    expect(inbox).toMatch(/conversationsVisibleForUserOrFilter/);
    expect(unread).toMatch(/conversationsVisibleForUserOrFilter/);
    expect(messagesUi).toMatch(/hideConversationForMe/);
    expect(messagesUi).toMatch(/SwipeToDeleteRow/);
    expect(messagesUi).toMatch(/Elle restera visible pour l’autre participant/);
  });

  it('TOM-102 conversation_reports inchangé par la migration hide', () => {
    const reports = read('supabase/migrations/20260903220000_conversation_reports_v1.sql');
    expect(reports).toMatch(/conversation_reports/);
    const mig = read('supabase/migrations/20260909120000_conversation_hide_for_me_v1.sql');
    expect(mig).not.toMatch(/DROP TABLE.*conversation_reports/i);
    expect(mig).not.toMatch(/DROP POLICY/i);
  });
});
