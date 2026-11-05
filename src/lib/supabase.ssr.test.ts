import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform: { OS: 'web' }, create: vi.fn((..._args: unknown[]) => ({})), storage: {} }));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.create }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: mocks.storage }));
describe('Supabase persistence during static export', () => {
 afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
 beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL','https://synthetic.invalid'); vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY','synthetic-only'); });
 it('does not touch browser storage or retain user sessions during server rendering', async () => {
  mocks.platform.OS='web'; vi.stubGlobal('window', undefined);
  const {supabaseRuntime}=await import('./supabase');
  expect(mocks.create.mock.calls[0]?.[2]).toMatchObject({auth:{persistSession:false,autoRefreshToken:false}});
  expect(supabaseRuntime.canPersistSession).toBe(false);
 });
 it.each(['ios','android','web'])('preserves %s session persistence in the client', async os => {
  mocks.platform.OS=os;
  if(os==='web') vi.stubGlobal('window',{});
  const {supabaseRuntime}=await import('./supabase');
  expect(mocks.create.mock.calls[0]?.[2]).toMatchObject({auth:{storage:mocks.storage,persistSession:true,autoRefreshToken:true}});
  expect(supabaseRuntime.canPersistSession).toBe(true);
 });
});
