import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { campaignCanSend } from "@/lib/campaigns/selection";
import { classifySendError, isConfirmedSendRejection } from "@/lib/instagram/delivery-errors";
import { createInstagramContext, hasInstagramCredentials, sendDirectMessage } from "@/lib/instagram/provider";
import { renderMessageWithoutLink } from "@/lib/tracking/message";
import { FOLLOWUP_JOB_NAME, getDMQueue, type ProcessFollowUpJob } from "./client";

type FollowUpCampaign = {
  id: string; workspaceId: string; instagramAccountId: string; version: number;
  followUpEnabled: boolean; followUpMessage: string | null; followUpDelayMinutes: number;
  instagramAccount: { instagramId: string };
};
/** Snapshot is persisted before queue insertion. A failed queue insertion is
 * repaired by recoverPendingFollowUps, without altering a delivered reveal. */
export async function scheduleFollowUp(campaign: FollowUpCampaign, input: {
  userId: string; commenterName: string | null; sourceId: string;
  interactionAt: Date | null;
}, transaction?: Prisma.TransactionClient) {
  if (!campaign.followUpEnabled || !campaign.followUpMessage?.trim()) return;
  const operationKey = `followup_${createHash("sha256")
    .update(JSON.stringify([campaign.id, input.userId, input.sourceId])).digest("hex")}`;
  const anchor = input.interactionAt?.getTime();
  const validAnchor = anchor !== undefined && Number.isFinite(anchor) && anchor <= Date.now();
  const scheduledAt = new Date((validAnchor ? anchor : Date.now()) + Math.max(0, campaign.followUpDelayMinutes) * 60_000);
  const expiresAt = new Date((validAnchor ? anchor : 0) + 24 * 60 * 60_000);
  const event = await (transaction ?? prisma).deliveryEvent.upsert({
    where: { operationKey }, update: { operationKey },
    create: {
      workspaceId: campaign.workspaceId, automationId: campaign.id,
      instagramAccountId: campaign.instagramAccountId,
      stage: "FOLLOW_UP", operationKey, campaignVersion: campaign.version,
      recipientId: input.userId, scheduledAt,
      message: renderMessageWithoutLink({ message: campaign.followUpMessage, commenterName: input.commenterName }),
      status: !validAnchor || scheduledAt >= expiresAt || Date.now() >= expiresAt.getTime() ? "SKIPPED" : "PENDING",
      error: !validAnchor ? "Missing known interaction timestamp" : scheduledAt >= expiresAt || Date.now() >= expiresAt.getTime() ? "Outside the known messaging window" : null,
      payload: { instagramId: campaign.instagramAccount.instagramId, expiresAt: expiresAt.toISOString() },
    },
  });
  if (event.status !== "PENDING" || transaction) return;
  await queueEvent(event).catch((error) => console.error("[follow-up] durable event awaits queue recovery", event.id, error instanceof Error ? error.message : "Queue unavailable"));
}

async function queueEvent(event: { id: string; automationId: string; instagramAccountId: string | null; recipientId: string | null; scheduledAt: Date | null; payload: unknown }) {
  const payload = event.payload as { instagramId: string };
  await getDMQueue().add(FOLLOWUP_JOB_NAME, {
    deliveryEventId: event.id, automationId: event.automationId,
    accountConnectionId: event.instagramAccountId ?? undefined,
    instagramAccountId: payload.instagramId, userId: event.recipientId!,
  }, { jobId: `followup_${event.id}`, delay: Math.max(0, (event.scheduledAt?.getTime() ?? 0) - Date.now()) });
}

export async function recoverPendingFollowUps() {
  const pending = await prisma.deliveryEvent.findMany({
    where: { stage: "FOLLOW_UP", status: "PENDING", scheduledAt: { lte: new Date() } }, take: 100,
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
  });
  for (const event of pending) await queueEvent(event);
}

export async function deliverFollowUp(data: ProcessFollowUpJob, jobId: string) {
  const automation = await prisma.automation.findFirst({
    where: { id: data.automationId }, include: { instagramAccount: true },
  });
  if (!data.deliveryEventId) {
    // Old queue entries have neither a snapshot nor an opt-in/window anchor.
    if (automation) await prisma.deliveryEvent.upsert({
      where: { operationKey: `legacy_followup_${jobId}` }, update: { operationKey: `legacy_followup_${jobId}` },
      create: { workspaceId: automation.workspaceId, automationId: automation.id,
        stage: "FOLLOW_UP", status: "SKIPPED", operationKey: `legacy_followup_${jobId}`,
        campaignVersion: automation.version, error: "Legacy job has no immutable snapshot or known interaction window" },
    });
    return;
  }
  const event = await prisma.deliveryEvent.findUnique({ where: { id: data.deliveryEventId } });
  if (!event || event.stage !== "FOLLOW_UP" || event.automationId !== data.automationId || event.status !== "PENDING") return;
  const snapshot = event.payload as { instagramId?: string; expiresAt?: string } | null;
  const skip = async (error: string) => prisma.deliveryEvent.updateMany({
    where: { id: event.id, status: "PENDING" }, data: { status: "SKIPPED", error },
  });
  if (!automation || !campaignCanSend(automation) || !automation.followUpEnabled) {
    await skip("Campaign paused, archived, removed or follow-up disabled"); return;
  }
  if (automation.instagramAccountId !== event.instagramAccountId ||
    (data.accountConnectionId !== undefined && data.accountConnectionId !== event.instagramAccountId) ||
    automation.instagramAccount.instagramId !== snapshot?.instagramId ||
    data.instagramAccountId !== snapshot?.instagramId ||
    data.userId !== event.recipientId || !event.message) {
    await skip("Snapshot account or recipient mismatch"); return;
  }
  const expiry = snapshot?.expiresAt ? Date.parse(snapshot.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || Date.now() >= expiry) { await skip("Known messaging window expired"); return; }
  if (event.scheduledAt && Date.now() < event.scheduledAt.getTime()) return;
  if (!hasInstagramCredentials(automation.instagramAccount)) { await skip("No Instagram credentials"); return; }
  let context;
  try { context = await createInstagramContext(automation.instagramAccount, `followup:${event.id}`); }
  catch { await skip("Could not decrypt Instagram credentials"); return; }
  const claim = await prisma.deliveryEvent.updateMany({
    where: { id: event.id, status: "PENDING", automation: { isActive: true, lifecycle: "ACTIVE", followUpEnabled: true } },
    data: { status: "CLAIMED", claimedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count !== 1) return;
  // A crash after claim stays CLAIMED (potentially delivered), never resent.
  try {
    await sendDirectMessage({ context, instagramAccountId: snapshot!.instagramId!, userId: event.recipientId!, message: event.message });
    await prisma.deliveryEvent.update({ where: { id: event.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch (originalError) {
    const error = classifySendError(originalError);
    await prisma.deliveryEvent.update({ where: { id: event.id }, data: {
      status: isConfirmedSendRejection(error) ? "FAILED" : "UNCONFIRMED",
      error: error instanceof Error ? error.message : "Unknown delivery outcome",
    } });
  }
}
