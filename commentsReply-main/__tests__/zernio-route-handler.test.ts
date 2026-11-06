import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/app/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock('@/lib/meta/client', () => ({ MetaApiError: class extends Error {} }));
vi.mock('@/lib/workspace-access', () => ({
  getCurrentWorkspaceContext: async () => ({ workspaceId: 'ours', role: 'OWNER' }),
  canManageWorkspace: () => true,
}));
import { withZernioManagement } from '@/lib/zernio/route-handler';

const handler = vi.fn(async () => Response.json({ success: true }));
const route = withZernioManagement(handler);
const internalUrl = 'http://openreply:3000/api/zernio/settings';
const send = (method: string, origin?: string, url = internalUrl) =>
  route(new Request(url, { method, headers: origin ? { origin } : {} }));

beforeEach(() => {
  vi.unstubAllEnvs();
  handler.mockClear();
});

it('accepts requests from the public NEXTAUTH_URL origin behind a reverse proxy', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com');
  const response = await send('POST', 'https://app.example.com');
  expect(response.status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});

it('rejects requests from a different origin when NEXTAUTH_URL is set', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com');
  const response = await send('POST', 'https://evil.example.com');
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ success: false, error: 'Invalid request origin.' });
  expect(handler).not.toHaveBeenCalled();
});

it('falls back to the request URL origin when NEXTAUTH_URL is not set', async () => {
  vi.stubEnv('NEXTAUTH_URL', '');
  expect((await send('POST', 'http://openreply:3000')).status).toBe(200);
  expect((await send('POST', 'https://app.example.com')).status).toBe(403);
});

it('does not validate the origin of GET requests', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com');
  expect((await send('GET', 'https://evil.example.com')).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});
