import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyContactIntentStats } from './getMyContactIntentStats';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}));

describe('getMyContactIntentStats', () => {
  beforeEach(() => rpcMock.mockReset());

  it('agrège les canaux enregistrés', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { channel: 'message', intent_count: 3 },
        { channel: 'whatsapp', intent_count: '2' },
      ],
      error: null,
    });
    expect(await getMyContactIntentStats()).toEqual({
      data: { total: 5, byChannel: { message: 3, whatsapp: 2 } },
      error: null,
    });
  });

  it('accepte zéro événement observé', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect((await getMyContactIntentStats()).data?.total).toBe(0);
  });

  it('ne transforme pas une erreur RPC en zéro', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'RPC indisponible' },
    });
    expect(await getMyContactIntentStats()).toEqual({
      data: null, error: 'RPC indisponible',
    });
  });

  it('rejette les réponses invalides', async () => {
    rpcMock.mockResolvedValue({
      data: [{ channel: 'message', intent_count: -1 }],
      error: null,
    });
    expect((await getMyContactIntentStats()).data).toBeNull();
  });

  it('gère les erreurs réseau', async () => {
    rpcMock.mockRejectedValueOnce(new Error('network'));
    const result = await getMyContactIntentStats();
    expect(result).toEqual({
      data: null,
      error: 'Collecte indisponible',
    });
  });
});
