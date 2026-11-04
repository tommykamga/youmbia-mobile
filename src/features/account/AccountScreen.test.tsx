import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountScreen from '../../../app/(tabs)/account';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCurrentProfile: vi.fn(),
  lightCacheRead: vi.fn(),
  lightCacheWrite: vi.fn(),
  resolveSingleAvatarUrl: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  ScrollView: 'ScrollView',
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  Alert: { alert: m.alert },
}));

const ReactForRouter = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock factory hoisted by Vitest
  return require('react') as typeof import('react');
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn() }),
  Redirect: ({ href }: { href: string }) => ReactForRouter.createElement('Redirect', { href }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    ReactForRouter.useEffect(() => {
      const cleanup = cb();
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }, [cb]);
  },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '7.0.0' }, nativeAppVersion: '7.0.0' },
}));

vi.mock('@/components', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
  Loader: 'Loader',
  NotificationsActivationCard: () => null,
}));

vi.mock('@/lib/lightCache', () => ({
  lightCacheKeys: { profile: (id: string) => `profile.${id}` },
  lightCacheRead: m.lightCacheRead,
  lightCacheWrite: m.lightCacheWrite,
}));

vi.mock('@/lib/avatarImageUrl', () => ({
  resolveSingleAvatarUrl: m.resolveSingleAvatarUrl,
  invalidateAvatarCache: vi.fn(),
}));

vi.mock('@/lib/profileRealtime', () => ({
  subscribeProfileEvents: () => () => {},
}));

vi.mock('@/services/auth', () => ({
  getSession: m.getSession,
  signOut: m.signOut,
}));

vi.mock('@/services/profile', () => ({
  getCurrentProfile: m.getCurrentProfile,
  getAvatarVersion: () => 'v1',
  getUserDisplayName: (
    profile: { full_name?: string | null; email?: string | null },
    fallback: string
  ) => profile.full_name?.trim() || fallback,
  isApplePrivateRelayEmail: (email: string | null) =>
    typeof email === 'string' && email.includes('@privaterelay.appleid.com'),
}));

vi.mock('@/features/account', async () => {
  const constants = await import('./accountScreen.constants');
  return {
    ...constants,
    AccountScreenHeader: () => React.createElement('AccountScreenHeader'),
    AccountProfileSummaryCard: (props: Record<string, unknown>) =>
      React.createElement('AccountProfileSummaryCard', props),
    AccountPriorityActions: () => React.createElement('AccountPriorityActions'),
    AccountMenuSection: ({
      section,
      onItemPress,
    }: {
      section: { title: string };
      onItemPress: (r: string) => void;
    }) =>
      React.createElement('AccountMenuSection', {
        title: section.title,
        onItemPress,
      }),
    AccountMenuRow: 'AccountMenuRow',
    AccountLogoutRow: ({ onPress, label }: { onPress: () => void; label: string }) =>
      React.createElement('AccountLogoutRow', { onPress, label }),
  };
});

vi.mock('@/theme', () => ({
  colors: { background: '#f9fafb', textTertiary: '#999', surface: '#fff', borderLight: '#eee' },
  spacing: { xs: 4, sm: 8, md: 16, xl: 24 },
  typography: { xs: {} },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.clearAllMocks();
  m.lightCacheRead.mockResolvedValue(null);
  m.lightCacheWrite.mockResolvedValue(undefined);
  m.resolveSingleAvatarUrl.mockResolvedValue('');
  m.getCurrentProfile.mockResolvedValue({ data: { full_name: 'QA User', avatar_url: '' }, error: null });
});

async function renderScreen() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AccountScreen />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe('AccountScreen', () => {
  it('redirects guest to auth gate', async () => {
    m.getSession.mockResolvedValue(null);
    const tree = await renderScreen();
    const redirect = tree.root.findByType('Redirect' as unknown as React.ComponentType);
    expect(String(redirect.props.href)).toContain('context=account');
  });

  it('shows loader and header while session loads', async () => {
    m.getSession.mockImplementation(() => new Promise(() => {}));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<AccountScreen />);
    });
    expect(tree.root.findByType('AccountScreenHeader' as unknown as React.ComponentType)).toBeTruthy();
    expect(tree.root.findByType('Loader' as unknown as React.ComponentType)).toBeTruthy();
  });

  it('renders profile summary and menu sections when authenticated', async () => {
    m.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'qa@youmbia.test', user_metadata: {} },
    });
    const tree = await renderScreen();
    expect(tree.root.findByType('AccountScreenHeader' as unknown as React.ComponentType)).toBeTruthy();
    expect(tree.root.findByType('AccountProfileSummaryCard' as unknown as React.ComponentType)).toBeTruthy();
    expect(tree.root.findByType('AccountPriorityActions' as unknown as React.ComponentType)).toBeTruthy();
    expect(tree.root.findAllByType('AccountMenuSection' as unknown as React.ComponentType).length).toBe(
      4
    );
  });

  it('mounts profile in hero stack outside ScrollView to prevent header clipping', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', user_metadata: {} } });
    const tree = await renderScreen();
    const scroll = tree.root.findByType('ScrollView' as unknown as React.ComponentType);
    expect(
      scroll.findAllByType('AccountProfileSummaryCard' as unknown as React.ComponentType)
    ).toHaveLength(0);
    expect(
      tree.root.findByType('AccountProfileSummaryCard' as unknown as React.ComponentType)
    ).toBeTruthy();
  });

  it('passes Apple relay email label to profile card', async () => {
    m.getSession.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'abc@privaterelay.appleid.com',
        user_metadata: { full_name: 'Tommy' },
      },
    });
    const tree = await renderScreen();
    const card = tree.root.findByType('AccountProfileSummaryCard' as unknown as React.ComponentType);
    expect(card.props.emailLabel).toBe('Adresse masquée par Apple');
  });

  it('does not call signOut until user confirms logout alert', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', user_metadata: {} } });
    m.alert.mockImplementation((_t, _m, buttons) => {
      expect(buttons[0].text).toBe('Annuler');
      expect(buttons[1].text).toBe('Se déconnecter');
    });
    const tree = await renderScreen();
    const logout = tree.root.findByType('AccountLogoutRow' as unknown as React.ComponentType);
    await act(async () => {
      logout.props.onPress();
    });
    expect(m.alert).toHaveBeenCalledWith(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      expect.any(Array)
    );
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it('shows app version at bottom', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', user_metadata: {} } });
    const tree = await renderScreen();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Version 7.0.0');
  });
});
