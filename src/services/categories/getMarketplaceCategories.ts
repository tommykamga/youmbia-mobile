import { supabase } from '@/lib/supabase';

export type MarketplaceCategory = {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  level: number;
  icon: string | null;
  form_profile: string | null;
};

export type GetMarketplaceCategoriesResult =
  | { data: MarketplaceCategory[]; error: null }
  | { data: null; error: { message: string } };

let cache: MarketplaceCategory[] | null = null;
let inflight: Promise<MarketplaceCategory[]> | null = null;

export function peekMarketplaceCategoriesCache(): MarketplaceCategory[] | null {
  return cache;
}

export function clearMarketplaceCategoriesCache(): void {
  cache = null;
  inflight = null;
}

export async function getMarketplaceCategories(): Promise<GetMarketplaceCategoriesResult> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, parent_id, level, icon, form_profile')
      .order('id', { ascending: true });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    const rows = (data ?? []) as MarketplaceCategory[];
    cache = rows;
    return { data: rows, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}

export async function getMarketplaceCategoriesCached(): Promise<MarketplaceCategory[]> {
  if (cache) {
    return cache;
  }

  if (!inflight) {
    inflight = getMarketplaceCategories().then((result) => {
      inflight = null;
      if (result.data) {
        return result.data;
      }
      throw new Error(result.error?.message ?? 'Impossible de charger les catégories');
    });
  }

  return inflight;
}
