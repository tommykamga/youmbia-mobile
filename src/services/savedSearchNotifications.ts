import 'expo-sqlite/localStorage/install';

import * as Notifications from 'expo-notifications';
import { getPublicListings } from '@/services/listings';
import { getSavedSearchAlertMatches } from '@/services/savedSearchAlerts';
import { buildSavedSearchHref, getSavedSearches, type SavedSearch } from '@/services/savedSearches';
import {
  getComparableTargetKey,
  getPushPermissionStatus,
  initializeNotifications,
  reserveNotificationDispatch,
} from '@/services/notifications';

const SAVED_SEARCH_NOTIFICATION_STATE_KEY = 'youmbia.savedSearchNotifications.v1';
const SAVED_SEARCH_FETCH_LIMIT = 24;
const SAVED_SEARCH_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000;

type SavedSearchNotificationSnapshot = {
  notifiedBySearchId: Record<string, string[]>;
};

let syncInFlight = false;

function readSnapshot(): SavedSearchNotificationSnapshot | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVED_SEARCH_NOTIFICATION_STATE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSearchNotificationSnapshot> | null;
    if (!parsed || typeof parsed.notifiedBySearchId !== 'object') return null;
    return {
      notifiedBySearchId: parsed.notifiedBySearchId as Record<string, string[]>,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: SavedSearchNotificationSnapshot): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVED_SEARCH_NOTIFICATION_STATE_KEY, JSON.stringify(snapshot));
    }
  } catch {}
}

function getMatchesBySearchId(
  savedSearches: SavedSearch[],
  matches: ReturnType<typeof getSavedSearchAlertMatches>
): Record<string, string[]> {
  const map = savedSearches.reduce<Record<string, string[]>>((acc, search) => {
    acc[search.id] = [];
    return acc;
  }, {});

  matches.forEach((match) => {
    match.searchIds.forEach((searchId) => {
      if (!map[searchId]) map[searchId] = [];
      map[searchId].push(match.listing.id);
    });
  });

  return map;
}

function getNewListingIds(
  currentIds: string[],
  previousIds: string[] | undefined
): string[] {
  const previousSet = new Set(previousIds ?? []);
  return currentIds.filter((id) => !previousSet.has(id));
}

function getSearchNotificationLabel(search: SavedSearch): string {
  const label = String(search.label || search.query || 'votre recherche').trim();
  if (!label) return 'votre recherche';
  return label.length > 40 ? `${label.slice(0, 37)}...` : label;
}

function buildNotificationBody(
  search: SavedSearch,
  newCount: number,
  title: string | null,
  city: string | null
): string {
  if (newCount <= 1) {
    const safeTitle = String(title ?? '').trim();
    const safeCity = String(city ?? '').trim();
    if (safeTitle && safeCity) return `${safeTitle} a ${safeCity}`;
    if (safeTitle) return safeTitle;
  }
  return `${newCount} nouvelles annonces pour "${getSearchNotificationLabel(search)}"`;
}

async function scheduleSavedSearchNotification(
  search: SavedSearch,
  params: { newCount: number; title: string | null; city: string | null }
): Promise<void> {
  initializeNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title:
        params.newCount > 1
          ? 'Nouvelles annonces pour votre recherche'
          : 'Nouvelle annonce pour votre recherche',
      body: buildNotificationBody(search, params.newCount, params.title, params.city),
      data: {
        href: buildSavedSearchHref(search),
        searchId: search.id,
        type: 'saved_search_match',
      },
    },
    trigger: null,
  });
}

export async function syncSavedSearchNotifications(
  currentPath: string | null | undefined
): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;

  try {
    const savedSearches = getSavedSearches().slice(0, 8);
    if (savedSearches.length === 0) return;

    const feedResult = await getPublicListings(0, SAVED_SEARCH_FETCH_LIMIT);
    if (feedResult.error || !feedResult.data) return;

    const matches = getSavedSearchAlertMatches(feedResult.data, savedSearches);
    const matchesBySearchId = getMatchesBySearchId(savedSearches, matches);
    const previousSnapshot = readSnapshot();

    if (!previousSnapshot) {
      writeSnapshot({ notifiedBySearchId: matchesBySearchId });
      return;
    }

    const permissionStatus = await getPushPermissionStatus();
    const targetSearch = savedSearches.find((search) => {
      const currentIds = matchesBySearchId[search.id] ?? [];
      const newIds = getNewListingIds(currentIds, previousSnapshot.notifiedBySearchId[search.id]);
      return newIds.length > 0;
    });

    const targetHref = targetSearch ? buildSavedSearchHref(targetSearch) : '';
    const isCurrentSearchOpen =
      !!targetHref && getComparableTargetKey(targetHref) === getComparableTargetKey(currentPath);
    const canNotify = permissionStatus === 'granted' && !isCurrentSearchOpen;

    if (canNotify && targetSearch) {
      const currentIds = matchesBySearchId[targetSearch.id] ?? [];
      const newIds = getNewListingIds(currentIds, previousSnapshot.notifiedBySearchId[targetSearch.id]);
      const firstMatch = matches.find(
        (item) => item.searchIds.includes(targetSearch.id) && newIds.includes(item.listing.id)
      );
      const notificationKey = `saved-search:${targetSearch.id}:${newIds.sort().join(',')}`;

      if (reserveNotificationDispatch(notificationKey, SAVED_SEARCH_NOTIFICATION_COOLDOWN_MS)) {
        await scheduleSavedSearchNotification(targetSearch, {
          newCount: newIds.length,
          title: firstMatch?.listing.title ?? null,
          city: firstMatch?.listing.city ?? null,
        }).catch(() => {});
      }
    }

    writeSnapshot({ notifiedBySearchId: matchesBySearchId });
  } finally {
    syncInFlight = false;
  }
}
