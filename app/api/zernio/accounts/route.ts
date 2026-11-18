import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decryptToken } from '@/lib/meta/oauth';
import { withConnectionLock } from '@/lib/zernio/lock-connection';
import { loadConnection } from '@/lib/zernio/load-connection';
import { listInstagramAccounts } from '@/lib/zernio/manage-remote';
import { ConnectionError, readBody, withZernioManagement } from '@/lib/zernio/route-handler';

const accountBodySchema = z.object({ accountId: z.string().min(1) });

export const POST = withZernioManagement(async ({ workspaceId }, request) => {
  const { accountId } = await readBody(request, accountBodySchema);
  const connection = await loadConnection(workspaceId);
  if (!connection.profileId || !connection.webhookId) throw new ConnectionError('Select a profile and finish webhook setup first.');
  const remote = (await listInstagramAccounts({ apiKey: connection.apiKey, profileId: connection.profileId })).find(a => a.id === accountId);
  if (!remote) throw new ConnectionError('That Instagram account is not in the selected profile.', 403);
  await withConnectionLock(workspaceId, async tx => {
    const current = await tx.zernioConnection.findUnique({ where: { workspaceId } });
    if (!current || current.profileId !== connection.profileId || current.webhookId !== connection.webhookId || decryptToken(current.apiKey) !== connection.apiKey) throw new ConnectionError('Connection settings changed. Refresh and try again.');
    // Rows imported before the stored id changed are not found by the new
    // instagramId, so also match this workspace's row for the same Zernio account.
    const existing = await tx.instagramAccount.findUnique({ where: { instagramId: remote.instagramId } })
      ?? await tx.instagramAccount.findFirst({ where: { workspaceId, provider: 'ZERNIO', zernioAccountId: remote.id } });
    if (existing && (existing.workspaceId !== workspaceId || existing.provider !== 'ZERNIO')) throw new ConnectionError('This Instagram account is already connected. Existing connections are not migrated automatically.', 409);
    const data = { instagramId: remote.instagramId, username: remote.username, name: remote.name, zernioAccountId: remote.id, webhookSubscribed: true };
    if (existing) {
      const updated = await tx.instagramAccount.updateMany({
        where: { id: existing.id, workspaceId, provider: 'ZERNIO' }, data,
      });
      if (!updated.count) throw new ConnectionError('This account connection changed. Refresh and try again.', 409);
    } else {
      await tx.instagramAccount.create({ data: { ...data, workspaceId, provider: 'ZERNIO', accessToken: '' } });
    }
  });
  return NextResponse.json({ success: true });
});
