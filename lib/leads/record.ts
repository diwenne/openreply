import { prisma } from "@/lib/db/client";

/**
 * Lead tracking for the DM worker.
 *
 * Every function here is best-effort: lead bookkeeping must never fail or
 * delay a DM delivery, so errors are logged and swallowed. A missed timestamp
 * only means a follow-up behaves as it did before leads existed.
 */

export interface LeadRef {
  workspaceId: string;
  /** InstagramAccount.id (database id, not the Instagram user id). */
  instagramAccountId: string;
  /** Instagram-scoped id of the person. */
  igsid: string;
  username?: string | null;
}

type ActivityField =
  | "lastInboundAt"
  | "lastRepliedAt"
  | "lastOutboundAt"
  | "lastFollowUpSentAt";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Create the lead if needed, then move each activity timestamp forward to
 * `at`. Timestamps never move backwards: worker jobs run concurrently and are
 * retried, so an older job can finish after a newer one.
 */
async function touchLead(
  ref: LeadRef,
  fields: ActivityField[],
  at: Date,
  sourceAutomationId?: string | null
): Promise<void> {
  const key = {
    instagramAccountId: ref.instagramAccountId,
    igsid: ref.igsid,
  };
  const username = ref.username?.trim() || undefined;
  const timestamps = Object.fromEntries(fields.map((field) => [field, at]));
  const args = {
    where: { instagramAccountId_igsid: key },
    create: {
      workspaceId: ref.workspaceId,
      ...key,
      username,
      ...(sourceAutomationId ? { sourceAutomationId } : {}),
      ...timestamps,
    },
    update: username ? { username } : {},
  };

  let lead;
  try {
    lead = await prisma.lead.upsert(args);
  } catch (error) {
    // Two jobs for the same person raced on the first insert; the row exists now.
    if (!isUniqueViolation(error)) throw error;
    lead = await prisma.lead.upsert(args);
  }

  // A freshly created row already carries everything; only advance what's stale.
  for (const field of fields) {
    const current = lead[field];
    if (current && current >= at) continue;
    await prisma.lead.updateMany({
      where: { ...key, OR: [{ [field]: null }, { [field]: { lt: at } }] },
      data: { [field]: at },
    });
  }

  // Credit the first campaign that reached a lead with no source yet (e.g.
  // someone who messaged in before any campaign DM).
  if (sourceAutomationId && !lead.sourceAutomationId) {
    await prisma.lead.updateMany({
      where: { ...key, sourceAutomationId: null },
      data: { sourceAutomationId },
    });
  }
}

/** The person messaged in (`message`) or tapped a button (`postback`). */
export async function recordLeadInbound(
  ref: LeadRef & { kind: "message" | "postback"; at?: Date }
): Promise<void> {
  try {
    await touchLead(
      ref,
      ref.kind === "message"
        ? ["lastInboundAt", "lastRepliedAt"]
        : ["lastInboundAt"],
      ref.at ?? new Date()
    );
  } catch (error) {
    console.warn("[Leads] Failed to record inbound activity:", error);
  }
}

/** A campaign DM or follow-up was delivered to the person. */
export async function recordLeadOutbound(
  ref: LeadRef & { automationId?: string | null; followUp?: boolean; at?: Date }
): Promise<void> {
  try {
    await touchLead(
      ref,
      ref.followUp
        ? ["lastOutboundAt", "lastFollowUpSentAt"]
        : ["lastOutboundAt"],
      ref.at ?? new Date(),
      ref.automationId
    );
  } catch (error) {
    console.warn("[Leads] Failed to record outbound activity:", error);
  }
}

/**
 * True when the person sent a text reply after `since`. Fails open (false) so
 * a lookup error falls back to sending, the pre-existing behaviour.
 */
export async function hasLeadRepliedSince(
  instagramAccountId: string,
  igsid: string,
  since: Date
): Promise<boolean> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { instagramAccountId_igsid: { instagramAccountId, igsid } },
      select: { lastRepliedAt: true },
    });
    return !!lead?.lastRepliedAt && lead.lastRepliedAt > since;
  } catch (error) {
    console.warn("[Leads] Failed to check reply status:", error);
    return false;
  }
}
