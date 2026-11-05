import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AccountScreenHeader } from './AccountScreenHeader';
import { AccountProfileSummaryCard } from './AccountProfileSummaryCard';
import {
  ACCOUNT_MENU_SECTIONS,
  ACCOUNT_TAB_BAR_SCROLL_PAD,
  ACCOUNT_PROFILE_CARD_OVERLAP,
  MARKETPLACE_TAB_TITLE_PADDING_BOTTOM,
} from './accountScreen.constants';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: ({
    children,
    ...props
  }: {
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('@/context/AppUpdateBannerInsetContext', () => ({
  useAppUpdateBannerInset: () => 0,
}));
vi.mock('@/components', () => ({
  UserAvatar: ({ name }: { name: string }) => React.createElement('UserAvatar', { name }),
}));
vi.mock('@/theme', () => ({
  colors: {
    surface: '#fff',
    text: '#111',
    textSecondary: '#666',
    primary: '#16A34A',
    primaryLight: '#DCFCE7',
    borderLight: '#eee',
    surfaceSubtle: '#f4f4f5',
  },
  spacing: { screenHorizontal: 16, base: 12, sm: 8, xs: 4, md: 16 },
  typography: { xl: {}, base: {}, sm: {}, xs: {} },
  fontWeights: { bold: '700', semibold: '600' },
  radius: { full: 999, xl: 16 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AccountScreenHeader', () => {
  it('renders Compte title with marketplace header role', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<AccountScreenHeader />);
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((t) => t.props.children === 'Compte')).toBe(true);
    expect(texts[0]?.props.accessibilityRole).toBe('header');
  });

  it('reserves overlap space using shared marketplace title padding', () => {
    expect(MARKETPLACE_TAB_TITLE_PADDING_BOTTOM).toBe(6);
    expect(ACCOUNT_PROFILE_CARD_OVERLAP).toBeGreaterThan(0);
  });

  it('elevates profile card above header paint order', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <AccountProfileSummaryCard
          displayName="QA"
          emailLabel="a@b.com"
          avatarUrlRaw=""
          avatarVersion=""
          avatarDisplayUrl=""
          onEditPress={vi.fn()}
        />
      );
    });
    const card = tree.root.findByType('View' as unknown as React.ComponentType);
    expect(card.props.style).toEqual(
      expect.objectContaining({
        zIndex: 2,
        marginTop: -ACCOUNT_PROFILE_CARD_OVERLAP,
      })
    );
  });
});

describe('AccountProfileSummaryCard', () => {
  it('shows display name and email', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
      <AccountProfileSummaryCard
        displayName="Jean Dupont"
        emailLabel="jean@example.com"
        avatarUrlRaw=""
        avatarVersion=""
        avatarDisplayUrl=""
        onEditPress={vi.fn()}
      />
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Jean Dupont');
    expect(json).toContain('jean@example.com');
    expect(tree.root.findByType('UserAvatar' as unknown as React.ComponentType).props.name).toBe(
      'Jean Dupont'
    );
  });

  it('shows Apple relay label when provided', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
      <AccountProfileSummaryCard
        displayName="Utilisateur Apple"
        emailLabel="Adresse masquée par Apple"
        avatarUrlRaw=""
        avatarVersion=""
        avatarDisplayUrl=""
        onEditPress={vi.fn()}
      />
      );
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Adresse masquée par Apple');
  });

  it('supports long name on two lines', async () => {
    const longName = 'Nom très long pour tester le troncature sur deux lignes maximum';
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
      <AccountProfileSummaryCard
        displayName={longName}
        emailLabel="a@b.com"
        avatarUrlRaw=""
        avatarVersion=""
        avatarDisplayUrl=""
        onEditPress={vi.fn()}
      />
      );
    });
    const nameText = tree.root.findAllByType('Text' as unknown as React.ComponentType)[0];
    expect(nameText.props.numberOfLines).toBe(2);
    expect(nameText.props.children).toBe(longName);
  });

  it('keeps long email on two lines for dynamic type', async () => {
    const longEmail = 'utilisateur.tres.long.nom@privaterelay.appleid.com';
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <AccountProfileSummaryCard
          displayName="QA"
          emailLabel={longEmail}
          avatarUrlRaw=""
          avatarVersion=""
          avatarDisplayUrl=""
          onEditPress={vi.fn()}
        />
      );
    });
    const emailText = tree.root
      .findAllByType('Text' as unknown as React.ComponentType)
      .find((node) => node.props.children === longEmail);
    expect(emailText?.props.numberOfLines).toBe(2);
  });
});

describe('accountScreen.constants', () => {
  it('keeps profile edit route and CTO label', () => {
    const settings = ACCOUNT_MENU_SECTIONS.find((s) => s.title === 'Paramètres');
    const profileRow = settings?.items.find((i) => i.route === '/account/profile');
    expect(profileRow?.label).toBe('Modifier mon profil');
  });

  it('preserves activity and sensitive routes in menus', () => {
    const flat = ACCOUNT_MENU_SECTIONS.flatMap((s) => s.items);
    expect(flat.map((i) => i.route)).toEqual(
      expect.arrayContaining([
        '/(tabs)/messages',
        '/(tabs)/favorites',
        '/account/saved-searches',
        '/account/settings',
        '/privacy',
        '/help',
        '/terms',
        '/account/delete-account',
      ])
    );
  });

  it('does not duplicate Mes annonces in Activité section (priority actions instead)', () => {
    const activity = ACCOUNT_MENU_SECTIONS.find((s) => s.title === 'Activité');
    expect(activity?.items.some((i) => i.route === '/account/listings')).toBe(false);
  });

  it('labels sensitive account section', () => {
    expect(ACCOUNT_MENU_SECTIONS.some((s) => s.title === 'Actions sensibles')).toBe(true);
  });

  it('uses tab bar scroll padding aligned with other tabs', () => {
    expect(ACCOUNT_TAB_BAR_SCROLL_PAD).toBe(72);
  });
});
