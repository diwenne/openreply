import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { decryptToken } from '@/lib/meta/oauth';
import { normalizeZernioEvent, verifyZernioSignature } from '@/lib/zernio/normalize-event';
import { processInstagramWebhook } from '@/lib/queue/process-webhook';

const eventEnvelopeSchema = z.object({ account: z.object({ id: z.string().min(1), platform: z.literal('instagram') }) });

export async function POST(request: Request, segmentData: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await segmentData.params;
  const connection = await prisma.zernioConnection.findUnique({ where: { workspaceId } });
  if (!connection?.webhookId) return NextResponse.json({ error: 'Unknown subscription' }, { status: 404 });
  const rawBody = await request.text();
  if (!verifyZernioSignature({ rawBody, signature: request.headers.get('x-zernio-signature'), secret: decryptToken(connection.webhookSecret) })) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = eventEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ success: true, ignored: true });
  // Zernio subscriptions are account-wide. Drop other profiles before persisting any payload.
  const account = await prisma.instagramAccount.findFirst({ where: { workspaceId, provider: 'ZERNIO', zernioAccountId: parsed.data.account.id } });
  if (!account) return NextResponse.json({ success: true, ignored: true });
  const normalized = normalizeZernioEvent({ payload, account });
  if (!normalized) return NextResponse.json({ success: true, ignored: true });
  try {
    await processInstagramWebhook({ payload: normalized, provider: 'ZERNIO', workspaceId });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed; retry delivery.' }, { status: 500 });
  }
}
