import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('sold exclu des requêtes discovery actives', () => {
  it('Home / Search / Similar / Favorites filtrent status = active', () => {
    const publicFeed = read('src/services/listings/getPublicListings.ts');
    const search = read('src/services/listings/searchListings.ts');
    const similar = read('src/services/listings/getSimilarListings.ts');
    const byIds = read('src/services/listings/getListingsByIds.ts');
    const byCity = read('src/services/listings/getListingsByCity.ts');
    const homeBoosted = read('src/features/listings/BoostedSection.tsx');
    const homeUrgent = read('src/features/listings/UrgentSection.tsx');

    expect(publicFeed).toMatch(/\.eq\('status', 'active'\)/);
    expect(search).toMatch(/\.eq\('status', 'active'\)/);
    expect(similar).toMatch(/ACTIVE_LISTING_STATUS/);
    expect(similar).toMatch(/\.eq\('status', ACTIVE_LISTING_STATUS\)/);
    expect(byIds).toMatch(/\.eq\('status', 'active'\)/);
    expect(byCity).toMatch(/\.eq\('status', 'active'\)/);
    expect(homeBoosted).toMatch(/\.eq\('status', 'active'\)/);
    expect(homeUrgent).toMatch(/\.eq\('status', 'active'\)/);
  });

  it('Mes annonces ne filtre pas le statut (sold reste visible au vendeur)', () => {
    const myListings = read('src/services/listings/getMyListings.ts');
    expect(myListings).not.toMatch(/\.eq\('status'/);
    expect(myListings).toMatch(/any status/);
  });

  it('l’action UI vendue est réservée au propriétaire, avec confirmation', () => {
    const mine = read('app/account/listings.tsx');
    const detail = read('app/listing/[id].tsx');
    expect(mine).toMatch(/markListingSold/);
    expect(mine).toMatch(/Marquer comme vendue/);
    expect(mine).toMatch(/MARK_LISTING_SOLD_CONFIRM_TITLE/);
    expect(mine).toMatch(/canSellerReactivateListing/);
    expect(detail).toMatch(/isOwnListing/);
    expect(detail).toMatch(/markListingSold/);
    expect(detail).toMatch(/canSellerReactivateListing/);
    expect(detail).toMatch(/getSellerReactivateActionLabel/);
    expect(detail).toMatch(/canSellerRenewListing/);
    expect(mine).toMatch(/renewListing/);
    expect(mine).toMatch(/getSellerReactivateActionLabel/);
    expect(mine).not.toMatch(/Remonter l'annonce/);
  });

  it('delete_my_account ne dépend pas du statut sold', () => {
    const rpc = read('supabase/migrations/20260602210000_delete_account_v1.sql');
    expect(rpc).toMatch(/DELETE FROM public\.listings WHERE user_id/);
    expect(rpc).not.toMatch(/status = 'sold'/);
  });

  it('les conversations existantes ne filtrent pas le listing par status', () => {
    const inbox = read('src/services/conversations/getConversations.ts');
    expect(inbox).toMatch(/\.from\('listings'\)/);
    expect(inbox).not.toMatch(/\.eq\('status'/);
  });

  it('les selects liste / discovery n’exigent pas sold_at ni sale_cycle_started_at', () => {
    const listSelect = read('src/services/listings/listingListSelect.ts');
    const publicFeed = read('src/services/listings/getPublicListings.ts');
    const search = read('src/services/listings/searchListings.ts');
    expect(listSelect).not.toMatch(/sold_at/);
    expect(listSelect).not.toMatch(/sale_cycle_started_at/);
    expect(listSelect).not.toMatch(/renewed_at/);
    expect(listSelect).toMatch(/last_published_at/);
    expect(publicFeed).not.toMatch(/sold_at/);
    expect(search).not.toMatch(/sold_at/);
  });

  it('Home / Search / Similar trient last_published_at, jamais updated_at', () => {
    const publicFeed = read('src/services/listings/getPublicListings.ts');
    const search = read('src/services/listings/searchListings.ts');
    const similar = read('src/services/listings/getSimilarListings.ts');
    const byCity = read('src/services/listings/getListingsByCity.ts');
    const listSelect = read('src/services/listings/listingListSelect.ts');
    expect(listSelect).toMatch(/LISTING_DISCOVERY_ORDER_COLUMN = 'last_published_at'/);
    expect(publicFeed).toMatch(/LISTING_DISCOVERY_ORDER_COLUMN/);
    expect(search).toMatch(/LISTING_DISCOVERY_ORDER_COLUMN/);
    expect(similar).toMatch(/LISTING_DISCOVERY_ORDER_COLUMN/);
    expect(byCity).toMatch(/LISTING_DISCOVERY_ORDER_COLUMN/);
    expect(publicFeed).not.toMatch(/\.order\('updated_at'/);
    expect(search).not.toMatch(/\.order\('updated_at'/);
  });
});
