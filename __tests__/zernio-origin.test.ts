import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace-access', () => ({
  getCurrentWorkspaceContext: async () => ({ workspaceId: 'ours', role: 'OWNER' }),
  canManageWorkspace: () => true,
}));
import { withZernioManagement } from '@/lib/zernio/route-handler';

const handler = withZernioManagement(async () => Response.json({ success: true }));
// Behind a TLS-terminating proxy, Next.js sees the plain-http internal URL.
const post = (origin: string) =>
  handler(new Request('http://openreply.example/api/zernio/connection', { method: 'POST', headers: { origin } }));

afterEach(() => vi.unstubAllEnvs());

it('accepts the public NEXTAUTH_URL origin when the request URL is plain http', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://openreply.example');
  expect((await post('https://openreply.example')).status).toBe(200);
});
it('still accepts the request URL origin', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://openreply.example');
  expect((await post('http://openreply.example')).status).toBe(200);
});
it('rejects a foreign origin', async () => {
  vi.stubEnv('NEXTAUTH_URL', 'https://openreply.example');
  const response = await post('https://evil.example');
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ success: false, error: 'Invalid request origin.' });
});
