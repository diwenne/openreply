/**
 * Proactive Follow-Up Sequence & Drip Engine
 *
 * Manages scheduled follow-ups, evaluates conversion / click conditions,
 * and executes AI Smart Re-Engagement within Instagram's 24-hour messaging window.
 */

import { prisma } from "@/lib/db/client";
import { generateAICompletion } from "@/lib/ai/gateway";
import { getConversationHistory, appendChatMessage } from "@/lib/ai/conversation";
import { sendDirectMessage } from "@/lib/instagram/provider";
import { createInstagramContext, hasInstagramCredentials } from "@/lib/instagram/provider";

export type FollowUpCondition = "ALWAYS" | "IF_NOT_CLICKED" | "IF_NOT_REPLIED";
export type FollowUpType = "CUSTOM_MESSAGE" | "AI_SMART_REENGAGE";

export interface ScheduledFollowUp {
  id: string;
  automationId: string;
  automationName: string;
  instagramAccountId: string;
  recipientId: string;
  recipientUsername: string;
  condition: FollowUpCondition;
  followUpType: FollowUpType;
  customMessage?: string;
  delayMinutes: number;
  scheduledFor: number; // timestamp ms
  status: "SCHEDULED" | "DISPATCHED" | "CANCELLED_CLICKED" | "CANCELLED_REPLIED" | "EXPIRED_WINDOW" | "FAILED";
  dispatchedAt?: number;
  dispatchedMessage?: string;
  failureReason?: string;
  createdAt: number;
}

// In-memory follow-up store buffer for real-time queue management & simulation
const scheduledFollowUps = new Map<string, ScheduledFollowUp>();

function ensureSeedFollowUps() {
  if (scheduledFollowUps.size > 0) return;
  const now = Date.now();

  scheduledFollowUps.set("flw_seed_1", {
    id: "flw_seed_1",
    automationId: "cm_growth_guide",
    automationName: "AI Automation Growth Guide",
    instagramAccountId: "ig_growth_hq",
    recipientId: "user_alex_109",
    recipientUsername: "alex_ecom",
    condition: "IF_NOT_CLICKED",
    followUpType: "AI_SMART_REENGAGE",
    delayMinutes: 60,
    scheduledFor: now + 38 * 60 * 1000,
    status: "SCHEDULED",
    createdAt: now - 22 * 60 * 1000,
  });

  scheduledFollowUps.set("flw_seed_2", {
    id: "flw_seed_2",
    automationId: "cm_agency_templates",
    automationName: "Agency Workflow Templates",
    instagramAccountId: "ig_growth_hq",
    recipientId: "user_jessica_204",
    recipientUsername: "jessica_mkt",
    condition: "IF_NOT_REPLIED",
    followUpType: "CUSTOM_MESSAGE",
    customMessage: "Hey @{username}, just wanted to check if you had a chance to download the workflow templates! Let me know if you need anything.",
    delayMinutes: 120,
    scheduledFor: now + 75 * 60 * 1000,
    status: "SCHEDULED",
    createdAt: now - 45 * 60 * 1000,
  });

  scheduledFollowUps.set("flw_seed_3", {
    id: "flw_seed_3",
    automationId: "cm_vip_masterclass",
    automationName: "VIP Scaling Masterclass",
    instagramAccountId: "ig_growth_hq",
    recipientId: "user_david_301",
    recipientUsername: "david_creator",
    condition: "ALWAYS",
    followUpType: "CUSTOM_MESSAGE",
    customMessage: "Hey @david_creator, thanks for connecting! Looking forward to seeing you at the masterclass.",
    delayMinutes: 15,
    scheduledFor: now - 90 * 60 * 1000,
    status: "DISPATCHED",
    dispatchedAt: now - 90 * 60 * 1000,
    dispatchedMessage: "Hey @david_creator, thanks for connecting! Looking forward to seeing you at the masterclass.",
    createdAt: now - 105 * 60 * 1000,
  });
}

export function scheduleFollowUpJob(params: {
  automationId: string;
  automationName: string;
  instagramAccountId: string;
  recipientId: string;
  recipientUsername: string;
  condition?: FollowUpCondition;
  followUpType?: FollowUpType;
  customMessage?: string;
  delayMinutes?: number;
}): ScheduledFollowUp {
  const delayMinutes = params.delayMinutes ?? 60;
  const now = Date.now();
  const scheduledFor = now + delayMinutes * 60 * 1000;
  const id = `flw_${params.automationId}_${params.recipientId}_${now}`;

  const job: ScheduledFollowUp = {
    id,
    automationId: params.automationId,
    automationName: params.automationName,
    instagramAccountId: params.instagramAccountId,
    recipientId: params.recipientId,
    recipientUsername: params.recipientUsername,
    condition: params.condition ?? "IF_NOT_CLICKED",
    followUpType: params.followUpType ?? (params.customMessage ? "CUSTOM_MESSAGE" : "AI_SMART_REENGAGE"),
    customMessage: params.customMessage,
    delayMinutes,
    scheduledFor,
    status: "SCHEDULED",
    createdAt: now,
  };

  scheduledFollowUps.set(id, job);
  return job;
}

export function getScheduledFollowUps(filter?: {
  automationId?: string;
  recipientUsername?: string;
  status?: ScheduledFollowUp["status"];
}): ScheduledFollowUp[] {
  ensureSeedFollowUps();
  let list = Array.from(scheduledFollowUps.values());
  if (filter?.automationId) {
    list = list.filter((j) => j.automationId === filter.automationId);
  }
  if (filter?.recipientUsername) {
    list = list.filter((j) => j.recipientUsername.toLowerCase() === filter.recipientUsername?.toLowerCase());
  }
  if (filter?.status) {
    list = list.filter((j) => j.status === filter.status);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function cancelFollowUpJob(id: string, reason: ScheduledFollowUp["status"]): boolean {
  const job = scheduledFollowUps.get(id);
  if (!job) return false;
  job.status = reason;
  scheduledFollowUps.set(id, job);
  return true;
}

/**
 * Executes a scheduled follow-up job:
 * 1. Checks Instagram 24-hour messaging window
 * 2. Evaluates condition (IF_NOT_CLICKED or IF_NOT_REPLIED)
 * 3. Formats message or calls AI Smart Re-Engagement
 * 4. Dispatches via provider and records in conversation history
 */
export async function executeFollowUpJob(jobId: string): Promise<{
  success: boolean;
  status: ScheduledFollowUp["status"];
  message?: string;
  reason?: string;
}> {
  const job = scheduledFollowUps.get(jobId);
  if (!job) {
    return { success: false, status: "FAILED", reason: "Follow-up job not found" };
  }

  // 1. Check 24-hour window (Meta API strict restriction: 24h from initial inbound message)
  const windowLimit = 24 * 60 * 60 * 1000;
  if (Date.now() - job.createdAt > windowLimit) {
    job.status = "EXPIRED_WINDOW";
    job.failureReason = "Exceeded Meta 24-hour customer service messaging window";
    scheduledFollowUps.set(job.id, job);
    return { success: false, status: "EXPIRED_WINDOW", reason: job.failureReason };
  }

  // 2. Evaluate Condition: IF_NOT_CLICKED
  if (job.condition === "IF_NOT_CLICKED") {
    try {
      const clickCount = await prisma.linkClick.count({
        where: {
          automationId: job.automationId,
          createdAt: { gte: new Date(job.createdAt) },
        },
      });

      if (clickCount > 0) {
        job.status = "CANCELLED_CLICKED";
        job.failureReason = "User already tapped and converted on the link";
        scheduledFollowUps.set(job.id, job);
        return { success: true, status: "CANCELLED_CLICKED", reason: job.failureReason };
      }
    } catch {
      // If DB check fails, continue
    }
  }

  // 3. Evaluate Condition: IF_NOT_REPLIED
  if (job.condition === "IF_NOT_REPLIED") {
    const history = getConversationHistory(job.recipientUsername);
    const userMessagesAfterFollowUpScheduled = history.filter(
      (m) => m.sender === "user" && m.timestamp > job.createdAt
    );
    if (userMessagesAfterFollowUpScheduled.length > 0) {
      job.status = "CANCELLED_REPLIED";
      job.failureReason = "User already replied with a message";
      scheduledFollowUps.set(job.id, job);
      return { success: true, status: "CANCELLED_REPLIED", reason: job.failureReason };
    }
  }

  // 4. Generate Message
  let finalMessage = "";
  if (job.followUpType === "AI_SMART_REENGAGE") {
    try {
      const history = getConversationHistory(job.recipientUsername);
      const historyText = history
        .slice(-4)
        .map((m) => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
        .join("\n");

      const prompt = `You are an empathetic, natural Instagram growth assistant for campaign "${job.automationName}".
The user @${job.recipientUsername} previously inquired or received a link from us.
Recent conversation history:
${historyText || "User received link earlier."}

Task:
Write a warm, non-pushy, 1-2 sentence follow-up check-in.
- Keep it friendly, casual, and brief.
- Ask if they had a chance to look at the resource or need help with anything.
- Do not sound like a generic corporate bot.
- Plain text only, no hashtags, maximum 180 characters.`;

      const aiRes = await generateAICompletion({ userPrompt: prompt, temperature: 0.7 });
      finalMessage = aiRes.text.trim().replace(/^["']|["']$/g, "");
    } catch {
      finalMessage = `Hey @${job.recipientUsername}, just checking in to see if you had a chance to check out the link or if you had any questions! 🙌`;
    }
  } else {
    finalMessage = (job.customMessage || "Hey @{username}, just wanted to check if you were able to check out the link! Let me know if you need anything.")
      .replace(/\{username\}/gi, job.recipientUsername);
  }

  // 5. Dispatch Direct Message
  try {
    const automation = await prisma.automation.findUnique({
      where: { id: job.automationId },
      include: { instagramAccount: true },
    });

    if (automation && hasInstagramCredentials(automation.instagramAccount)) {
      const context = await createInstagramContext(
        automation.instagramAccount,
        `followup:${job.id}`
      );
      await sendDirectMessage({
        context,
        instagramAccountId: automation.instagramAccount.instagramId,
        userId: job.recipientId,
        message: finalMessage,
      });
    }

    // Record to multi-turn conversation memory
    appendChatMessage(job.recipientUsername, {
      sender: "bot",
      text: finalMessage,
    });

    job.status = "DISPATCHED";
    job.dispatchedAt = Date.now();
    job.dispatchedMessage = finalMessage;
    scheduledFollowUps.set(job.id, job);

    return {
      success: true,
      status: "DISPATCHED",
      message: finalMessage,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to deliver Instagram DM";
    job.status = "FAILED";
    job.failureReason = errorMsg;
    scheduledFollowUps.set(job.id, job);
    return {
      success: false,
      status: "FAILED",
      reason: errorMsg,
    };
  }
}
