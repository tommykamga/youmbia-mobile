import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('getConversations — fils fantômes (A2)', () => {
  it('prouve la présence de messages via requête dédiée paginée, pas via lastByConv seul', () => {
    const presence = read('src/services/conversations/getConversationsMessagePresence.ts');
    expect(presence).toMatch(/fetchConversationIdsWithAtLeastOneMessage/);
    expect(presence).toMatch(/\.from\('messages'\)/);
    expect(presence).toMatch(/\.range\(/);
    expect(presence).toMatch(/ROW_PAGE/);

    const inbox = read('src/services/conversations/getConversations.ts');
    expect(inbox).toMatch(/fetchConversationIdsWithAtLeastOneMessage/);
    expect(inbox).toMatch(/listWithMessages/);
    expect(inbox).toMatch(/presence\.conversationIds\.has/);
  });

  it('ne déduit pas l’absence de messages depuis le cache local', () => {
    const ui = read('src/features/messages/MessagesInboxScreen.tsx');
    expect(ui).toMatch(/isInboxLightCacheTrusted/);
    expect(ui).not.toMatch(/lightCacheRemove/);
    expect(ui).not.toMatch(/last_message_at != null/);
  });

  it('optimise la présence : retrait des ids couverts pour réduire la pagination', () => {
    const presence = read('src/services/conversations/getConversationsMessagePresence.ts');
    expect(presence).toMatch(/remaining\.delete/);
    expect(presence).toMatch(/while \(remaining\.size > 0\)/);
  });
});
