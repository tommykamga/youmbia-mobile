import { beforeEach, describe, expect, it, vi } from 'vitest';

const mixpanelInstance = vi.hoisted(() => ({
  setServerURL: vi.fn(),
  init: vi.fn().mockResolvedValue(undefined),
  setLoggingEnabled: vi.fn(),
  registerSuperProperties: vi.fn(),
  track: vi.fn(),
  identify: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
  getPeople: vi.fn(() => ({ set: vi.fn() })),
}));

const Mixpanel = vi.hoisted(() => vi.fn(function MixpanelMock() {
  return mixpanelInstance;
}));

vi.mock('mixpanel-react-native', () => ({
  Mixpanel,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '4.4.1' } },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

async function loadMixpanel() {
  vi.resetModules();
  Mixpanel.mockClear();
  mixpanelInstance.init.mockClear();
  mixpanelInstance.track.mockClear();
  mixpanelInstance.identify.mockClear();
  mixpanelInstance.reset.mockClear();
  mixpanelInstance.getPeople.mockClear();
  mixpanelInstance.setServerURL.mockClear();
  mixpanelInstance.registerSuperProperties.mockClear();
  mixpanelInstance.setLoggingEnabled.mockClear();
  return import('./mixpanel');
}

describe('mixpanel', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('__DEV__', false);
  });

  it('n’initialise pas et ne crash pas si le token est absent', async () => {
    vi.stubEnv('EXPO_PUBLIC_MIXPANEL_TOKEN', '   ');
    const mixpanel = await loadMixpanel();

    await expect(mixpanel.initMixpanel()).resolves.toBeNull();
    expect(Mixpanel).not.toHaveBeenCalled();

    mixpanel.trackEvent('home_feed_viewed', { feed_context: 'default' });
    await mixpanel.identifyAnalyticsUser('user-1', { email: 'a@b.c' });
    await mixpanel.resetAnalytics();

    expect(mixpanelInstance.track).not.toHaveBeenCalled();
    expect(mixpanelInstance.identify).not.toHaveBeenCalled();
    expect(mixpanelInstance.reset).not.toHaveBeenCalled();
  });

  it('n’initialise Mixpanel qu’une seule fois', async () => {
    vi.stubEnv('EXPO_PUBLIC_MIXPANEL_TOKEN', 'project-token');
    const mixpanel = await loadMixpanel();

    const first = await mixpanel.initMixpanel();
    const second = await mixpanel.initMixpanel();

    expect(first).toBe(second);
    expect(Mixpanel).toHaveBeenCalledTimes(1);
    expect(mixpanelInstance.init).toHaveBeenCalledTimes(1);
  });

  it('identifie l’utilisateur et reset au logout sans relancer un second client', async () => {
    vi.stubEnv('EXPO_PUBLIC_MIXPANEL_TOKEN', 'project-token');
    const mixpanel = await loadMixpanel();

    await mixpanel.initMixpanel();
    await mixpanel.identifyAnalyticsUser('user-1', { email: 'a@b.c', name: 'Ada' });
    await mixpanel.resetAnalytics();

    expect(mixpanelInstance.identify).toHaveBeenCalledWith('user-1');
    expect(mixpanelInstance.reset).toHaveBeenCalledTimes(1);
    expect(Mixpanel).toHaveBeenCalledTimes(1);
  });

  it('n’envoie pas le contenu des messages, seulement des métadonnées', async () => {
    vi.stubEnv('EXPO_PUBLIC_MIXPANEL_TOKEN', 'project-token');
    const mixpanel = await loadMixpanel();
    await mixpanel.initMixpanel();

    mixpanel.trackEvent('message_sent', {
      conversation_id: 'c1',
      message_count: 2,
      message_type: 'text',
    });

    await vi.waitFor(() => {
      expect(mixpanelInstance.track).toHaveBeenCalled();
    });

    const [, payload] = mixpanelInstance.track.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty('body');
    expect(payload).not.toHaveProperty('message');
    expect(payload).toMatchObject({
      conversation_id: 'c1',
      message_count: 2,
      message_type: 'text',
    });
  });
});
