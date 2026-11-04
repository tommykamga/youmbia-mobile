import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { verifiedSubject } from '@/services/listings/listingTrust';
import { shareShop } from '@/lib/shareShop';
import { getMySellerProStatus } from '@/services/shops';

export type ProSellerActivationState = {
  loading: boolean;
  hasShop: boolean;
  shopSlug: string | null;
  shopName: string | null;
  shopCity: string | null;
  isVerified: boolean;
  sharing: boolean;
  handleShare: () => Promise<void>;
  reload: () => Promise<void>;
};

export function useProSellerActivation(): ProSellerActivationState {
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(false);
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [shopCity, setShopCity] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMySellerProStatus();
      if (result.error || !result.data) {
        setHasShop(false);
        setShopSlug(null);
        setShopName(null);
        setShopCity(null);
        setIsVerified(false);
        return;
      }
      const shop = result.data.shop;
      setHasShop(!!shop);
      setShopSlug(shop?.slug ?? null);
      setShopName(shop?.name ?? null);
      setShopCity(shop?.city ?? null);
      setIsVerified(!!shop && (await verifiedSubject('shop', shop.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleShare = useCallback(async () => {
    if (!shopSlug || !shopName || sharing) return;
    setSharing(true);
    try {
      await shareShop({ slug: shopSlug, name: shopName, city: shopCity });
    } finally {
      setSharing(false);
    }
  }, [shopCity, shopName, shopSlug, sharing]);

  return {
    loading,
    hasShop,
    shopSlug,
    shopName,
    shopCity,
    isVerified,
    sharing,
    handleShare,
    reload: load,
  };
}
