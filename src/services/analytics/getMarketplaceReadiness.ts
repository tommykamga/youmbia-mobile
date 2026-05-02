import {
  getMarketplaceAnalytics,
  type ActivityBucket,
  type MarketplaceAnalyticsSnapshot,
} from './getMarketplaceAnalytics';

export type MarketplaceReadinessStatus = 'not_ready' | 'early_traction' | 'ready_for_boost_test';

export type MarketplaceReadinessRecommendation =
  | 'continuer acquisition offre'
  | 'ameliorer qualite du stock'
  | 'tester Boost sur petit perimetre'
  | 'attendre avant monetisation';

export type MarketplaceDecisionSignals = {
  activeListings: number;
  activeSellers: number;
  avgListingsPerSeller: number;
  noViewRate: number;
  noFavoriteRate: number;
  noContactRate: number;
  topCategories: ActivityBucket[];
  topCities: ActivityBucket[];
};

export type MarketplaceReadinessSnapshot = {
  status: MarketplaceReadinessStatus;
  recommendation: MarketplaceReadinessRecommendation;
  summary: {
    strengths: string[];
    weaknesses: string[];
    primaryReasons: string[];
  };
  signals: MarketplaceDecisionSignals;
  warnings: string[];
  partial: boolean;
  analytics: MarketplaceAnalyticsSnapshot;
};

export type GetMarketplaceReadinessResult = {
  data: MarketplaceReadinessSnapshot;
  error: null | { message: string };
};

/**
 * Seuils explicites et volontairement prudents :
 * - avant 80 annonces actives ou 25 vendeurs actifs, la monétisation serait trop tôt.
 * - on considère une traction "pré-test boost" quand l’offre devient assez large,
 *   que la densité vendeur progresse, et qu’une partie suffisante du stock génère de l’intérêt.
 */
const READINESS_THRESHOLDS = {
  minimumListingsForTraction: 80,
  minimumSellersForTraction: 25,
  minimumAvgListingsPerSellerForTraction: 1.2,
  minimumListingsForBoostTest: 180,
  minimumSellersForBoostTest: 60,
  minimumAvgListingsPerSellerForBoostTest: 1.5,
  maxNoViewRateForBoostTest: 55,
  maxNoFavoriteRateForBoostTest: 80,
  maxNoContactRateForBoostTest: 90,
  minimumActiveCategoriesForBoostTest: 3,
  minimumActiveCitiesForBoostTest: 2,
} as const;

function toDecisionSignals(snapshot: MarketplaceAnalyticsSnapshot): MarketplaceDecisionSignals {
  return {
    activeListings: snapshot.marketplaceVolume.activeListings,
    activeSellers: snapshot.marketplaceVolume.activeSellers,
    avgListingsPerSeller: snapshot.marketplaceVolume.averageListingsPerSeller,
    noViewRate: snapshot.stockQuality.listingsWithoutViewsSharePct,
    noFavoriteRate: snapshot.stockQuality.listingsWithoutFavoritesSharePct,
    noContactRate: snapshot.stockQuality.listingsWithoutContactsSharePct,
    topCategories: snapshot.businessRead.topCategories,
    topCities: snapshot.businessRead.topCities,
  };
}

function buildDefaultSnapshot(analytics: MarketplaceAnalyticsSnapshot): MarketplaceReadinessSnapshot {
  return {
    status: 'not_ready',
    recommendation: 'attendre avant monetisation',
    summary: {
      strengths: [],
      weaknesses: [],
      primaryReasons: [],
    },
    signals: toDecisionSignals(analytics),
    warnings: analytics.warnings,
    partial: analytics.partial,
    analytics,
  };
}

function getActiveDiversityCount(items: ActivityBucket[]): number {
  return items.filter((item) => item.count > 0).length;
}

export async function getMarketplaceReadiness(): Promise<GetMarketplaceReadinessResult> {
  const analyticsResult = await getMarketplaceAnalytics();
  const readiness = buildDefaultSnapshot(analyticsResult.data);
  const { signals } = readiness;

  if (analyticsResult.error) {
    readiness.summary.primaryReasons.push('Lecture prudente: les métriques marketplace sont incomplètes.');
    readiness.warnings = analyticsResult.data.warnings;
    return { data: readiness, error: analyticsResult.error };
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const primaryReasons: string[] = [];

  const activeCategoryCount = getActiveDiversityCount(signals.topCategories);
  const activeCityCount = getActiveDiversityCount(signals.topCities);

  if (signals.activeListings >= READINESS_THRESHOLDS.minimumListingsForTraction) {
    strengths.push("Le volume d'annonces actives commence à devenir exploitable.");
  } else {
    weaknesses.push("Le volume d'annonces actives reste trop faible pour monétiser proprement.");
  }

  if (signals.activeSellers >= READINESS_THRESHOLDS.minimumSellersForTraction) {
    strengths.push('Le nombre de vendeurs actifs montre un début de profondeur côté offre.');
  } else {
    weaknesses.push('Le nombre de vendeurs actifs est encore limité.');
  }

  if (signals.avgListingsPerSeller >= READINESS_THRESHOLDS.minimumAvgListingsPerSellerForTraction) {
    strengths.push("La densité d'annonces par vendeur commence à dépasser le niveau mono-annonce.");
  } else {
    weaknesses.push("La densité d'annonces par vendeur reste faible.");
  }

  if (signals.noViewRate <= READINESS_THRESHOLDS.maxNoViewRateForBoostTest) {
    strengths.push('Une part significative du stock obtient déjà des vues organiques.');
  } else {
    weaknesses.push("Trop d'annonces restent sans vue, signe d'un marché encore froid.");
  }

  if (signals.noFavoriteRate <= READINESS_THRESHOLDS.maxNoFavoriteRateForBoostTest) {
    strengths.push('Les annonces commencent à générer des signaux d’intérêt.');
  } else {
    weaknesses.push("Le niveau d’intérêt acheteur reste encore trop faible.");
  }

  if (signals.noContactRate <= READINESS_THRESHOLDS.maxNoContactRateForBoostTest) {
    strengths.push('Le stock commence à produire des contacts exploitables.');
  } else {
    weaknesses.push('La conversion vers le contact reste encore faible.');
  }

  if (activeCategoryCount >= READINESS_THRESHOLDS.minimumActiveCategoriesForBoostTest) {
    strengths.push('La marketplace montre déjà une diversité de catégories suffisante pour un test ciblé.');
  } else {
    weaknesses.push('La diversité de catégories reste trop limitée pour segmenter une offre premium.');
  }

  if (activeCityCount >= READINESS_THRESHOLDS.minimumActiveCitiesForBoostTest) {
    strengths.push('L’activité est répartie sur plusieurs villes.');
  } else {
    weaknesses.push('L’activité reste trop concentrée ou trop faible côté géographie.');
  }

  const isReadyForBoostTest =
    !readiness.partial &&
    signals.activeListings >= READINESS_THRESHOLDS.minimumListingsForBoostTest &&
    signals.activeSellers >= READINESS_THRESHOLDS.minimumSellersForBoostTest &&
    signals.avgListingsPerSeller >= READINESS_THRESHOLDS.minimumAvgListingsPerSellerForBoostTest &&
    signals.noViewRate <= READINESS_THRESHOLDS.maxNoViewRateForBoostTest &&
    signals.noFavoriteRate <= READINESS_THRESHOLDS.maxNoFavoriteRateForBoostTest &&
    signals.noContactRate <= READINESS_THRESHOLDS.maxNoContactRateForBoostTest &&
    activeCategoryCount >= READINESS_THRESHOLDS.minimumActiveCategoriesForBoostTest &&
    activeCityCount >= READINESS_THRESHOLDS.minimumActiveCitiesForBoostTest;

  const hasEarlyTraction =
    signals.activeListings >= READINESS_THRESHOLDS.minimumListingsForTraction &&
    signals.activeSellers >= READINESS_THRESHOLDS.minimumSellersForTraction &&
    signals.avgListingsPerSeller >= READINESS_THRESHOLDS.minimumAvgListingsPerSellerForTraction;

  if (readiness.partial) {
    primaryReasons.push('Les analytics sont partiels: lecture business volontairement prudente.');
  }

  if (isReadyForBoostTest) {
    readiness.status = 'ready_for_boost_test';
    readiness.recommendation = 'tester Boost sur petit perimetre';
    primaryReasons.push("Le volume d'offre, la profondeur vendeur et les signaux d'engagement sont suffisants pour un test Boost cible.");
  } else if (hasEarlyTraction) {
    readiness.status = 'early_traction';
    readiness.recommendation =
      signals.noViewRate > READINESS_THRESHOLDS.maxNoViewRateForBoostTest ||
      signals.noFavoriteRate > READINESS_THRESHOLDS.maxNoFavoriteRateForBoostTest
        ? 'ameliorer qualite du stock'
        : 'continuer acquisition offre';
    primaryReasons.push("La marketplace montre une traction initiale, mais pas encore assez solide pour monétiser largement.");
  } else {
    readiness.status = 'not_ready';
    readiness.recommendation =
      signals.activeListings < READINESS_THRESHOLDS.minimumListingsForTraction ||
      signals.activeSellers < READINESS_THRESHOLDS.minimumSellersForTraction
        ? 'continuer acquisition offre'
        : 'attendre avant monetisation';
    primaryReasons.push("Le volume d'offre et la profondeur vendeur restent insuffisants pour lancer Boost ou Urgent payant.");
  }

  readiness.summary = {
    strengths,
    weaknesses,
    primaryReasons,
  };

  return {
    data: readiness,
    error: analyticsResult.error,
  };
}

export { READINESS_THRESHOLDS };
