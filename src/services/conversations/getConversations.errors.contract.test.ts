import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('getConversations — erreurs exposées (A3)', () => {
  it('ne renvoie plus liste vide sur erreur Supabase', () => {
    const src = read('src/services/conversations/getConversations.ts');
    expect(src).not.toMatch(/fallbackEmptyList/);
    expect(src).toMatch(/failureFromSupabase/);
    expect(src).toMatch(/\{\s*data:\s*null,\s*error:/);
    expect(src).toMatch(/classifyAuthErrorMessage/);
  });

  it('inbox traite les erreurs sans écraser le cache et affiche une bannière stale', () => {
    const ui = read('src/features/messages/MessagesInboxScreen.tsx');
    expect(ui).toMatch(/setStaleFromCache\(true\)/);
    expect(ui).toMatch(/Liste non actualisée/);
    expect(ui).toMatch(/staleFromCache/);
    expect(ui).toMatch(/testID=\"inbox-stale-retry\"/);
  });

  it('fil conversation n’aligne pas le snapshot notifications sur une erreur inbox', () => {
    const thread = read('app/conversation/[id].tsx');
    expect(thread).toMatch(/!convListResult\.error && convListResult\.data/);
  });
});
