import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HomeCategoryStripContent } from '@/components/HomeCategoryStrip';
import { useMarketplaceCategories } from '@/hooks/useMarketplaceCategories';
import { getRootMarketplaceCategories } from '@/lib/marketplaceCategories';
import { getWindowSizeBucket } from '@/lib/responsiveLayout';
import { HomeBrandHeader } from '@/components/HomeBrandHeader';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
import { PopularShopsSection } from '@/features/shops/PopularShopsSection';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { ListingFeed } from '@/features/listings/ListingFeed';
import { ListingCard } from '@/features/listings/ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors } from '@/theme';
import { formatPrice } from '@/lib/format';
import { DEMO_IMAGES } from './demoImages';
import { createDemoProvider, DEMO_CITIES, type DemoCriteria } from './demoProvider';

const EMPTY: DemoCriteria = { query: '', city: '', category: null };
type Panel = 'city' | 'search' | 'filters' | null;

export function HomeDemoScreen({ onExit }: { onExit: () => void }) {
  const { fontScale, width } = useWindowDimensions();
  const { categories } = useMarketplaceCategories();
  const rootCategories = useMemo(() => getRootMarketplaceCategories(categories), [categories]);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [criteria, setCriteria] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [detail, setDetail] = useState<PublicListing | null>(null);
  const [shopDetail, setShopDetail] = useState<PopularShop | null>(null);
  const [notice, setNotice] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const provider = useMemo(() => createDemoProvider(criteria, categories), [criteria, categories]);
  const shopsPreview = useMemo(() => ({
    shops: provider.shops, onOpen: setShopDetail,
    banners: { 'home-demo-shop-1': DEMO_IMAGES.phone_01, 'home-demo-shop-2': DEMO_IMAGES.fashion_01, 'home-demo-shop-3': DEMO_IMAGES.home_01 },
  }), [provider.shops]);
  const open = (next: Panel) => {
    setDraft(criteria); setMin(criteria.min == null ? '' : String(criteria.min));
    setMax(criteria.max == null ? '' : String(criteria.max)); setError(''); setPanel(next);
  };
  const apply = () => {
    if (panel === 'city') {
      setCriteria(prev => ({ ...prev, city: draft.city.trim() })); setPanel(null); return;
    }
    const lower = min.trim() ? Number(min) : undefined;
    const upper = max.trim() ? Number(max) : undefined;
    if ((lower != null && (!/^\d+$/.test(min) || !Number.isFinite(lower))) ||
        (upper != null && (!/^\d+$/.test(max) || !Number.isFinite(upper))) ||
        (lower != null && upper != null && lower > upper)) {
      setError('Vérifiez la fourchette de prix.'); return;
    }
    setCriteria({ ...draft, query: draft.query.trim(), city: draft.city.trim(), min: lower, max: upper });
    setPanel(null);
  };
  const toggle = useCallback((id: string) => setFavorites(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  }), []);
  const renderCard = useCallback((listing: PublicListing, grid: boolean) => (
    <ListingCard listing={listing} feedPresentation="home" homeGridCell={grid}
      preview={{ image: DEMO_IMAGES[listing.images[0]], onOpen: () => setDetail(listing), favorite: (
        <Pressable accessibilityRole="button" accessibilityLabel={favorites.has(listing.id) ? 'Retirer le favori local' : 'Ajouter aux favoris locaux'}
          accessibilityState={{ selected: favorites.has(listing.id) }}
          onPress={event => { event.stopPropagation(); toggle(listing.id); }} style={styles.heart}>
          <Ionicons name={favorites.has(listing.id) ? 'heart' : 'heart-outline'} size={24} color="#0B4D3C" />
        </Pressable>
      ) }} />
  ), [favorites, toggle]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.chrome}>
        <HomeBrandHeader homePresentation unreadCount={0} onNotificationsPress={() => setNotice(true)}
          location={{ label: criteria.city || 'Ville', onPress: () => open('city') }} />
        <View style={[styles.search, fontScale > 1.2 && styles.searchExpanded]}>
          <Ionicons name="search" size={21} color="#64748B" />
          <Pressable onPress={() => open('search')} style={styles.searchTarget} accessibilityRole="button" accessibilityLabel="Ouvrir la recherche de démonstration">
            <Text style={styles.searchText}>{criteria.query || 'Que cherchez-vous ?'}</Text>
          </Pressable>
          <Pressable onPress={() => open('filters')} style={[styles.filter, fontScale > 1.2 && styles.filterExpanded]} accessibilityRole="button" accessibilityLabel="Filtres de démonstration">
            <Ionicons name="options-outline" size={21} color="#0B4D3C" /><Text style={styles.filterText}>Filtres</Text>
          </Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Commandes de démonstration" accessibilityState={{ expanded: devPanelOpen }}
        onPress={() => setDevPanelOpen(value => !value)} style={styles.demoIndicator}>
        <Text style={styles.demoIndicatorText}>Démonstration</Text><Ionicons name={devPanelOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#614700" />
      </Pressable>
      {devPanelOpen && <View style={styles.devPanel}>
        <Text>{provider.total} annonces fictives · {favorites.size} favoris locaux</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setCriteria(EMPTY)}><Text>Réinitialiser les critères démo</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button} onPress={onExit}><Text>Quitter la démonstration</Text></Pressable>
      </View>}
      <View style={styles.feed}><ListingFeed previewProvider={provider} renderPreviewCard={renderCard} fetchPageSize={6}
        listingCardFeedPresentation="home" homeFeedCardInset={16} contentBottomInset={120}
        listHeaderComponent={<View style={styles.intro}>
          <HomeCategoryStripContent compact categories={categories} bucket={getWindowSizeBucket(width)} insetHorizontal={0}
            selectedCategoryId={criteria.category} onAutresPress={() => open('filters')}
            onCategoryPress={id => setCriteria(prev => ({ ...prev, category: prev.category === Number(id) ? null : Number(id) }))} />
          <Text style={styles.title}>À découvrir</Text>
        </View>}
        extraComponent={<PopularShopsSection preview={shopsPreview} />} /></View>
      <Modal visible={panel != null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <KeyboardSafeView androidInsetPadding subtractSafeAreaBottom={false}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                <Text style={styles.title}>{panel === 'city' ? 'Ville' : panel === 'search' ? 'Recherche démo' : 'Filtres démo'}</Text>
                {panel !== 'city' && <><Text>Recherche</Text><TextInput style={styles.input} accessibilityLabel="Recherche démo" value={draft.query} onChangeText={query => setDraft(prev => ({ ...prev, query }))} /></>}
                <Text>Ville</Text><TextInput style={styles.input} accessibilityLabel="Ville démo" placeholder="Ex. Douala" value={draft.city} onChangeText={city => setDraft(prev => ({ ...prev, city }))} />
                <View style={styles.chips}>{DEMO_CITIES.map(city => <Pressable style={styles.chip} key={city} accessibilityRole="button" onPress={() => setDraft(prev => ({ ...prev, city }))}><Text>{city}</Text></Pressable>)}</View>
                {panel === 'filters' && <><Text>Catégorie</Text><View style={styles.chips}>{rootCategories.map(category => <Pressable style={styles.chip} key={category.id} accessibilityRole="button" onPress={() => setDraft(prev => ({ ...prev, category: prev.category === category.id ? null : category.id }))}><Text>{draft.category === category.id ? '✓ ' : ''}{category.name}</Text></Pressable>)}</View>
                  <Text>Prix min</Text><TextInput style={styles.input} accessibilityLabel="Prix minimum démo" keyboardType="number-pad" value={min} onChangeText={setMin} />
                  <Text>Prix max</Text><TextInput style={styles.input} accessibilityLabel="Prix maximum démo" keyboardType="number-pad" value={max} onChangeText={setMax} /></>}
                {!!error && <Text accessibilityRole="alert">{error}</Text>}
                <Pressable style={styles.button} accessibilityRole="button" onPress={apply}><Text>Appliquer</Text></Pressable>
                <Pressable style={styles.button} accessibilityRole="button" onPress={() => { setCriteria(prev => panel === 'city' ? { ...prev, city: '' } : EMPTY); setPanel(null); }}><Text>{panel === 'city' ? 'Toutes les villes' : 'Réinitialiser'}</Text></Pressable>
                <Pressable style={styles.button} accessibilityRole="button" onPress={() => setPanel(null)}><Text>Annuler</Text></Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardSafeView>
      </Modal>
      <Modal visible={shopDetail != null} transparent animationType="slide" onRequestClose={() => setShopDetail(null)}>
        <View style={styles.backdrop}><View style={styles.sheet}><ScrollView>
          <Text style={styles.banner}>BOUTIQUE FICTIVE · destination simulée</Text>
          <Text style={styles.title}>{shopDetail?.name}</Text>
          <Text>{shopDetail?.city} · {shopDetail?.active_listings_count} annonces fictives</Text>
          <Text>Vendeur Pro · déclaré (démonstration)</Text>
          <Text>Aucun contact, achat ou accès à une boutique réelle.</Text>
          <Pressable style={styles.button} accessibilityRole="button" onPress={() => setShopDetail(null)}><Text>Retour au fil</Text></Pressable>
        </ScrollView></View></View>
      </Modal>
      <Modal visible={detail != null || notice} transparent animationType="slide" onRequestClose={() => { setDetail(null); setNotice(false); }}>
        <View style={styles.backdrop}><View style={styles.sheet}><ScrollView>
          <Text style={styles.banner}>DÉMONSTRATION — aucune transaction</Text>
          {detail ? <>{DEMO_IMAGES[detail.images[0]] && <Image source={DEMO_IMAGES[detail.images[0]]} style={styles.detailImage} resizeMode="cover" />}
            <Text style={styles.title}>{detail.title}</Text><Text>{formatPrice(detail.price)} · {detail.city}</Text></> : <Text>Notifications simulées, aucun envoi.</Text>}
          <Pressable style={styles.button} accessibilityRole="button" onPress={() => { setDetail(null); setNotice(false); }}><Text>Retour au fil</Text></Pressable>
        </ScrollView></View></View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  demoIndicator: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF8E2' },
  demoIndicatorText: { fontSize: 12, color: '#614700' },
  devPanel: { padding: 16, backgroundColor: '#FFF8E2' },
  feed: { flex: 1, backgroundColor: colors.surface },
  screen: { flex: 1, backgroundColor: '#0B4D3C' }, chrome: { paddingBottom: 12 },
  search: { minHeight: 56, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, marginHorizontal: 16, marginTop: 8, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchExpanded: { flexWrap: 'wrap' }, filterExpanded: { width: '100%', justifyContent: 'center' },
  searchTarget: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }, searchText: { fontSize: 14, color: '#64748B' },
  filter: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }, filterText: { color: '#0B4D3C', fontSize: 14 },
  banner: { backgroundColor: '#FFF3CD', color: '#614700', padding: 8, fontSize: 12 },
  intro: { backgroundColor: '#FFF', padding: 16, gap: 8 }, title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#E9F5EF', borderRadius: 12 },
  button: { minHeight: 44, padding: 12, backgroundColor: '#E9F5EF', borderRadius: 12, marginTop: 8 },
  heart: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '84%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 12, marginVertical: 8, fontSize: 16 },
  detailImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
});
