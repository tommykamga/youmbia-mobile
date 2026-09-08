import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('saved search notification deep links', () => {
  it('ouvre la fiche annonce depuis une alerte saved_search_match', () => {
    const notifications = read('src/services/notifications.ts');
    const layout = read('app/_layout.tsx');
    const edge = read('supabase/functions/dispatch-saved-search-alerts/index.ts');

    expect(edge).toMatch(/type: 'saved_search_match'/);
    expect(edge).toMatch(/href = `\/listing\/\$\{listing\.id\}`/);
    expect(notifications).toMatch(/href\.startsWith\('\/listing\/'\)/);
    expect(notifications).toMatch(/data\.listingId/);
    expect(notifications).toMatch(/savedSearchId/);
    expect(layout).toMatch(/getNotificationOpenMeta/);
    expect(layout).toMatch(/saved_search_match/);
    expect(layout).toMatch(/trackSavedSearchNotificationOpened/);
  });

  it('reconstruit un deep link Search stable depuis les critères sauvegardés', () => {
    const criteria = read('src/lib/savedSearchCriteria.ts');
    const searchScreen = read('app/(tabs)/search.tsx');
    expect(criteria).toMatch(/params\.set\('q'/);
    expect(criteria).toMatch(/params\.set\('categoryId'/);
    expect(criteria).toMatch(/`\/\(tabs\)\/search\?\$\{qs\}`/);
    expect(searchScreen).toMatch(/params\.categoryId/);
    expect(searchScreen).toMatch(/buildAuthGateHref\('search'/);
  });
});
