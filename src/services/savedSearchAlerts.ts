/**
 * Matching d’une recherche sauvegardée — contrat testable, aligné Search V2.
 * La détection runtime « nouvelle annonce » est serveur (trigger INSERT + ledger).
 */

export {
  listingMatchesSavedSearch,
  listingMatchesSavedSearchCriteria,
  shouldDispatchSavedSearchAlertOnEvent,
  isListingEligibleForSavedSearchAlert,
  isOwnListingForSavedSearch,
  savedSearchMatchLedgerKey,
} from '@/lib/savedSearchMatch';
export type {
  SavedSearchMatchListing,
  SavedSearchMatchSearch,
  ListingLifecycleEvent,
} from '@/lib/savedSearchMatch';
