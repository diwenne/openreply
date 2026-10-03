import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { hasLegacyUnconfirmedDelivery } from "@/lib/instagram/delivery-errors";
import { selectAutomation, type CampaignRule } from "@/lib/campaigns/selection";

/** Freeze a trigger's winner before any external side effect. Unlike a lease,
 * this reservation survives retries, campaign edits and queue eviction. */
export async function selectTriggerWinner<T extends CampaignRule & {
  workspaceId: string; instagramAccountId: string; version?: number;
}>(campaigns: T[], input: {
  kind: "comment" | "dm"; text: string; mediaIds?: string[];
  inputId: string; instagramId: string;
}): Promise<T | null> {
  const selected = selectAutomation(campaigns, input).winner;
  if (!selected) return null;
  // Older workers did not reserve a winner. Pin any previous side effect to
  // its original campaign, including public replies and uncertain deliveries.
  const previous = await prisma.dmLog.findMany({
    where: {
      commentId: input.inputId,
      instagramAccount: { instagramId: input.instagramId },
    },
    select: {
      automationId: true, status: true, errorMessage: true,
      dmDeliveryUnconfirmed: true, publicReplySentAt: true,
      publicReplyDeliveryUnconfirmed: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const owner = previous.find((log) => log.status === "SENT" ||
    log.dmDeliveryUnconfirmed || log.publicReplySentAt ||
    log.publicReplyDeliveryUnconfirmed || hasLegacyUnconfirmedDelivery(log.errorMessage));
  const chosen = owner ? campaigns.find((campaign) => campaign.id === owner.automationId) : selected;
  if (!chosen) return null;
  // Persist only campaign content, never account credentials or workspace data.
  const snapshot: Record<string, unknown> = {};
  for (const key of ["version", "dmMessage", "openingDmEnabled", "openingDmMessage", "openingDmButtonLabel",
    "linkButtonLabel", "requireFollow", "followPromptMessage", "followPromptButtonLabel",
    "followUpEnabled", "followUpMessage", "followUpDelayMinutes", "publicReplyEnabled",
    "publicReplyMessage", "publicReplyMessages", "trackedLinks"]) {
    const value = (chosen as Record<string, unknown>)[key];
    if (value !== undefined) snapshot[key] = value;
  }
  const operationKey = `trigger_${createHash("sha256")
    .update(JSON.stringify([input.instagramId, input.kind, input.inputId])).digest("hex")}`;
  const reservation = await prisma.deliveryEvent.upsert({
    where: { operationKey },
    create: {
      operationKey, workspaceId: chosen.workspaceId,
      automationId: chosen.id,
      instagramAccountId: chosen.instagramAccountId,
      stage: "TRIGGER", status: "SELECTED", campaignVersion: chosen.version ?? 1,
      message: "", payload: { snapshot: JSON.parse(JSON.stringify(snapshot)) },
    },
    // A non-empty no-content-change update permits a native PostgreSQL upsert
    // instead of Prisma's read/create race under parallel webhook jobs.
    update: { operationKey },
    select: { automationId: true, payload: true },
  });
  // Never fall through to another campaign if the frozen winner is now
  // paused, archived or no longer matches. A new incoming trigger is required.
  const current = campaigns.find((campaign) => campaign.id === reservation.automationId &&
    selectAutomation([campaign], input).winner);
  if (!current) return null;
  const frozen = reservation.payload as { snapshot?: Partial<T> } | null;
  return { ...current, ...frozen?.snapshot };
}
