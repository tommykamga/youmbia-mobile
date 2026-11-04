import type { PublicListing } from '@/services/listings';
import type { DiscoveryPage } from '@/features/listings/discoveryFeedController';

export function isHomeDemoEnabled(development: boolean, flag: string | undefined): boolean {
  return development && flag === '1';
}
export type DemoCriteria = { query: string; city: string; category: number | null; min?: number; max?: number };
export const DEMO_CITIES = ['Douala', 'Yaoundé', 'Bafoussam', 'Kribi', 'Garoua', 'Bamenda'];
export const DEMO_CATEGORIES = ['Téléphones', 'Mode', 'Immobilier', 'Auto', 'Maison', 'Informatique'];
const titles = ['Smartphone 128 Go avec chargeur et accessoires', 'Tenue de cérémonie avec accessoires assortis',
  'Appartement familial lumineux avec terrasse et grand séjour', 'Voiture familiale confortable et entretenue',
  'Mobilier de salon complet pour grande pièce', 'Ordinateur portable pour travail et études'];
const photos = ['phone_01', 'fashion_01', 'home_01', 'car_01', 'home_02', 'tech_01'];
export const DEMO_LISTINGS: readonly PublicListing[] = Array.from({ length: 48 }, (_, i) => ({
  id: `home-demo-${String(i + 1).padStart(2, '0')}`, seller_id: 'home-demo-local',
  title: `${titles[i % 6]} — modèle de démonstration ${i + 1}${i % 4 === 0 ? ', description particulièrement longue pour vérifier les retours à la ligne' : ''}`,
  price: i % 7 === 0 ? 1234567890 + i : 15000 + i * 27500,
  city: DEMO_CITIES[Math.floor(i / 6) % 6], category_id: i % 6 + 1,
  created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
  images: i % 11 === 10 ? [] : [photos[i % 6]], views_count: i * 3,
}));
export function createDemoProvider(criteria: DemoCriteria) {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const words = normalize(criteria.query).split(/\s+/).filter(Boolean);
  const matches = DEMO_LISTINGS.filter(x =>
    (!criteria.city || normalize(x.city) === normalize(criteria.city)) &&
    (criteria.category == null || x.category_id === criteria.category) &&
    (criteria.min == null || x.price >= criteria.min) && (criteria.max == null || x.price <= criteria.max) &&
    words.every(word => normalize(`${x.title} ${x.city}`).includes(word)));
  return {
    async loadPage(offset: number, limit: number): Promise<DiscoveryPage<PublicListing>> {
      const from = Math.max(0, Math.floor(offset));
      const size = Math.min(50, Math.max(1, Math.floor(limit)));
      const data = matches.slice(from, from + size);
      return { data, pagination: { nextOffset: from + data.length, hasMore: data.length === size } };
    },
    total: matches.length,
  };
}
