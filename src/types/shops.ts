/** Boutique publique (Espace Vendeur Pro V1). */
export type ShopStatus = 'active' | 'hidden' | 'suspended';

export type PublicShop = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  status: ShopStatus;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  whatsapp_phone: string | null;
  phone: string | null;
  city: string | null;
  is_verified: boolean;
  is_featured: boolean;
  created_at: string;
};

/** Résumé boutique pour badges / liens (fiche annonce, cartes). */
export type ShopSummary = {
  id: string;
  slug: string;
  name: string;
  is_verified: boolean;
  status: ShopStatus;
};

export type SellerType = 'individual' | 'pro';
