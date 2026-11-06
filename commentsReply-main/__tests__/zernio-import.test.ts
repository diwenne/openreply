import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  current: vi.fn(), existing: vi.fn(), create: vi.fn(), updateMany: vi.fn(),
}));
vi.mock('@/lib/zernio/route-handler', () => ({
  ConnectionError: class extends Error {},
  readBody: async () => ({ accountId: 'remote' }),
  withZernioManagement: (handler: (context: {workspaceId: string}, request: Request) => Promise<Response>) => (request: Request) => handler({ workspaceId: 'ours' }, request),
}));
vi.mock('@/lib/zernio/load-connection', () => ({ loadConnection: async () => ({ apiKey: 'key', profileId: 'profile', webhookId: 'hook' }) }));
vi.mock('@/lib/meta/oauth', () => ({ decryptToken: (token: string) => token }));
vi.mock('@/lib/zernio/manage-remote', () => ({ listInstagramAccounts: async () => [{ id: 'remote', instagramId: 'ig', username: 'ours', name: null }] }));
vi.mock('@/lib/zernio/lock-connection', () => ({
  withConnectionLock: async (_workspaceId: string, action: (tx: unknown) => Promise<void>) => action({
    zernioConnection: { findUnique: mocks.current },
    instagramAccount: { findUnique: mocks.existing, create: mocks.create, updateMany: mocks.updateMany },
  }),
}));
import { POST } from '@/app/api/zernio/accounts/route';
const request = new Request('https://open.example/api/zernio/accounts', { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.current.mockResolvedValue({ apiKey: 'key', profileId: 'profile', webhookId: 'hook' });
  mocks.existing.mockResolvedValue(null);
});
it('rejects an import validated using a replaced API key', async () => {
  mocks.current.mockResolvedValue({ apiKey: 'replacement', profileId: 'profile', webhookId: 'hook' });
  await expect(POST(request)).rejects.toThrow('Connection settings changed');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('cannot overwrite a direct Meta account', async () => {
  mocks.existing.mockResolvedValue({ id: 'local', workspaceId: 'ours', provider: 'META' });
  await expect(POST(request)).rejects.toThrow('already connected');
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it('does not fall back to updating a concurrently created account', async () => {
  mocks.create.mockRejectedValue(new Error('unique constraint'));
  await expect(POST(request)).rejects.toThrow('unique constraint');
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it('scopes reconnect writes to the original row, workspace and provider', async () => {
  mocks.existing.mockResolvedValue({ id: 'local', workspaceId: 'ours', provider: 'ZERNIO' });
  mocks.updateMany.mockResolvedValue({ count: 0 });
  await expect(POST(request)).rejects.toThrow('connection changed');
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'local', workspaceId: 'ours', provider: 'ZERNIO' } }));
});
