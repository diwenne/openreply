import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/zernio/client', () => ({ zernioRequest: request }));
import { listInstagramAccounts, ensureWebhook } from '@/lib/zernio/manage-remote';

beforeEach(() => request.mockReset());
describe('Zernio workspace management', () => {
  it('rejects accounts outside the selected profile even if the upstream filter leaks them', async () => {
    request.mockResolvedValue({ accounts: [
      { _id: 'a', platform: 'instagram', profileId: { _id: 'p' }, platformUserId: 'ig1', username: 'mine', isActive: true },
      { _id: 'b', platform: 'instagram', profileId: 'other', platformUserId: 'ig2', username: 'other', isActive: true },
      { _id: 'c', platform: 'facebook', profileId: 'p', platformUserId: 'fb', username: 'page', isActive: true },
    ] });
    expect(await listInstagramAccounts({ apiKey: 'key', profileId: 'p' })).toEqual([{ id: 'a', instagramId: 'ig1', username: 'mine', name: null }]);
  });
  it('reuses only this installation webhook and preserves other subscriptions', async () => {
    request.mockResolvedValueOnce({ webhooks: [{ _id: 'other', url: 'https://customer.example/hook' }, { _id: 'ours', url: 'https://open.example/api/zernio/webhook/ws' }] }).mockResolvedValueOnce({});
    expect(await ensureWebhook({ apiKey: 'key', workspaceId: 'ws', secret: 'secret', baseUrl: 'https://open.example' })).toBe('ours');
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'PUT', body: { _id: 'ours', secret: 'secret', isActive: true, events: ['comment.received', 'message.received', 'message.read'] } });
    expect(request.mock.calls).toHaveLength(2);
  });
  it('creates a distinct subscription when only unrelated webhooks exist', async () => {
    request.mockResolvedValueOnce({ webhooks: [{ _id: 'other', url: 'https://customer.example/hook' }] }).mockResolvedValueOnce({ webhook: { _id: 'new' } });
    expect(await ensureWebhook({ apiKey: 'key', workspaceId: 'ws', secret: 'secret', baseUrl: 'https://open.example' })).toBe('new');
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'POST', body: { url: 'https://open.example/api/zernio/webhook/ws' } });
  });
});

it('moves the saved installation webhook when the public base URL changes', async () => {
  request.mockResolvedValueOnce({ webhooks: [
    { _id: 'unrelated', url: 'https://customer.example/hook' },
    { _id: 'ours', url: 'https://old.example/api/zernio/webhook/ws' },
  ] }).mockResolvedValueOnce({});
  await ensureWebhook({ apiKey: 'key', workspaceId: 'ws', secret: 'secret', baseUrl: 'https://new.example', webhookId: 'ours' });
  expect(request.mock.calls[1][0]).toMatchObject({ method: 'PUT', body: { _id: 'ours', url: 'https://new.example/api/zernio/webhook/ws' } });
  expect(request).toHaveBeenCalledTimes(2);
});
