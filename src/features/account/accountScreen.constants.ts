import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { spacing } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type AccountRouteItem = {
  icon: IoniconName;
  label: string;
  route: string;
  isDestructive?: boolean;
};

export type AccountMenuSectionConfig = {
  title: string;
  items: AccountRouteItem[];
};

/** Marge bas scroll pour tab bar (aligné Favoris / Messages inbox). */
export const ACCOUNT_TAB_BAR_SCROLL_PAD = 72;

/** Vert profond marketplace (Accueil, Favoris, Messages). */
export const ACCOUNT_MARKETPLACE_SURFACE = '#0B4D3C';

/** Padding bas titre onglet (aligné `AppHeader` compact / Messages / Favoris). */
export const MARKETPLACE_TAB_TITLE_PADDING_BOTTOM = 6;

/** Chevauchement carte profil sur le bandeau vert (Compte). */
export const ACCOUNT_PROFILE_CARD_OVERLAP = spacing.md;

// Historique & Notifications masqués temporairement — décommenter dans items pour réactiver.
export const ACCOUNT_MENU_SECTIONS: AccountMenuSectionConfig[] = [
  {
    title: 'Activité',
    items: [
      { icon: 'chatbubbles-outline', label: 'Messages', route: '/(tabs)/messages' },
      { icon: 'heart-outline', label: 'Favoris', route: '/(tabs)/favorites' },
      { icon: 'bookmark-outline', label: 'Recherches sauvegardées', route: '/account/saved-searches' },
      // { icon: 'time-outline', label: 'Historique', route: '/history' },
    ],
  },
  {
    title: 'Paramètres',
    items: [
      { icon: 'person-outline', label: 'Modifier mon profil', route: '/account/profile' },
      { icon: 'mail-outline', label: 'Préférences e-mail', route: '/account/settings' },
      // { icon: 'notifications-outline', label: 'Notifications', route: '/settings/notifications' },
      { icon: 'shield-checkmark-outline', label: 'Sécurité & Confidentialité', route: '/privacy' },
    ],
  },
  {
    title: 'Aide & Informations',
    items: [
      { icon: 'help-circle-outline', label: "Centre d'aide", route: '/help' },
      { icon: 'document-text-outline', label: "Conditions d'utilisation", route: '/terms' },
    ],
  },
  {
    title: 'Actions sensibles',
    items: [
      {
        icon: 'trash-outline',
        label: 'Supprimer mon compte',
        route: '/account/delete-account',
        isDestructive: true,
      },
    ],
  },
];

export const ACCOUNT_LOGOUT_ROW = {
  icon: 'log-out-outline' as const,
  label: 'Se déconnecter',
  labelLoading: 'Déconnexion...',
};
