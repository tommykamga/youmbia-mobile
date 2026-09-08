import { describe, expect, it } from 'vitest';
import {
  canSellerMarkListingSold,
  canSellerReactivateListing,
  canSellerRenewListing,
  canViewerAccessListingDetail,
  getSellerListingStatusLabel,
  getSellerReactivateActionLabel,
  isAllowedListingStatus,
  isDiscoveryListingStatus,
  isSoldListingStatus,
  LISTING_STATUS,
  LISTING_UNAVAILABLE_MESSAGE,
} from './listingStatus';

describe('listingStatus', () => {
  it('distingue sold de hidden et suspended', () => {
    expect(getSellerListingStatusLabel('sold')).toBe('Vendue');
    expect(getSellerListingStatusLabel('hidden')).toBe('En pause');
    expect(getSellerListingStatusLabel('suspended')).toBe('Suspendue');
    expect(getSellerListingStatusLabel('active')).toBe('En ligne');
  });

  it('exclut sold de la discovery', () => {
    expect(isDiscoveryListingStatus('active')).toBe(true);
    expect(isDiscoveryListingStatus(null)).toBe(true);
    expect(isDiscoveryListingStatus('sold')).toBe(false);
    expect(isDiscoveryListingStatus('hidden')).toBe(false);
    expect(isDiscoveryListingStatus('suspended')).toBe(false);
  });

  it('autorise le vendeur à marquer vendue depuis active ou hidden, pas suspended/sold', () => {
    expect(canSellerMarkListingSold('active')).toBe(true);
    expect(canSellerMarkListingSold('hidden')).toBe(true);
    expect(canSellerMarkListingSold('sold')).toBe(false);
    expect(canSellerMarkListingSold('suspended')).toBe(false);
  });

  it('owner sold => réactivation disponible ; suspended => non réactivable', () => {
    expect(canSellerReactivateListing('sold')).toBe(true);
    expect(canSellerReactivateListing('hidden')).toBe(true);
    expect(canSellerReactivateListing('suspended')).toBe(false);
    expect(canSellerReactivateListing('active')).toBe(false);
  });

  it('renouvellement manuel : active uniquement ; sold/hidden restent sur réactivation', () => {
    expect(canSellerRenewListing('active')).toBe(true);
    expect(canSellerRenewListing('sold')).toBe(false);
    expect(canSellerRenewListing('hidden')).toBe(false);
    expect(canSellerRenewListing('suspended')).toBe(false);
    expect(getSellerReactivateActionLabel('sold')).toBe('Remettre en ligne');
    expect(getSellerReactivateActionLabel('hidden')).toBe('Réactiver');
  });

  it('public/non-owner sold => indisponible ; owner sold => consultable ; active inchangé', () => {
    expect(
      canViewerAccessListingDetail({ status: 'sold', ownerId: 'owner', viewerId: null })
    ).toBe(false);
    expect(
      canViewerAccessListingDetail({ status: 'sold', ownerId: 'owner', viewerId: 'other' })
    ).toBe(false);
    expect(
      canViewerAccessListingDetail({ status: 'sold', ownerId: 'owner', viewerId: 'owner' })
    ).toBe(true);
    expect(
      canViewerAccessListingDetail({ status: 'active', ownerId: 'owner', viewerId: null })
    ).toBe(true);
    expect(
      canViewerAccessListingDetail({ status: 'suspended', ownerId: 'owner', viewerId: 'owner' })
    ).toBe(false);
    expect(
      canViewerAccessListingDetail({ status: 'hidden', ownerId: 'owner', viewerId: 'owner' })
    ).toBe(false);
  });

  it('après passage à sold, le badge devient Vendue et l’action disparaît', () => {
    expect(isSoldListingStatus('sold')).toBe(true);
    expect(isSoldListingStatus('SOLD')).toBe(true);
    expect(isAllowedListingStatus(LISTING_STATUS.sold)).toBe(true);
    expect(isAllowedListingStatus('deleted')).toBe(false);
    expect(LISTING_UNAVAILABLE_MESSAGE).toBe("Cette annonce n'est plus disponible.");
    expect(getSellerListingStatusLabel('sold')).toBe('Vendue');
    expect(canSellerMarkListingSold('sold')).toBe(false);
    expect(isDiscoveryListingStatus('sold')).toBe(false);
  });
});
