import { NextRequest, NextResponse } from "next/server";
import {
  getScheduledFollowUps,
  scheduleFollowUpJob,
  executeFollowUpJob,
  cancelFollowUpJob,
  type FollowUpCondition,
  type FollowUpType,
} from "@/lib/queue/followup-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get("automationId") ?? undefined;
    const recipientUsername = searchParams.get("recipientUsername") ?? undefined;

    const followUps = getScheduledFollowUps({
      automationId,
      recipientUsername,
    });

    return NextResponse.json({
      success: true,
      followUps,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load follow-ups" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || "schedule";

    if (action === "execute") {
      const { jobId } = body;
      if (!jobId) {
        return NextResponse.json({ success: false, error: "jobId is required" }, { status: 400 });
      }
      const result = await executeFollowUpJob(jobId);
      return NextResponse.json({ success: true, result });
    }

    if (action === "cancel") {
      const { jobId } = body;
      if (!jobId) {
        return NextResponse.json({ success: false, error: "jobId is required" }, { status: 400 });
      }
      cancelFollowUpJob(jobId, "CANCELLED_REPLIED");
      return NextResponse.json({ success: true, message: "Job cancelled" });
    }

    // Default: schedule a new follow-up
    const {
      automationId,
      automationName,
      instagramAccountId,
      recipientId,
      recipientUsername,
      condition,
      followUpType,
      customMessage,
      delayMinutes,
    } = body;

    const job = scheduleFollowUpJob({
      automationId: automationId || "default-campaign",
      automationName: automationName || "Auto Growth Campaign",
      instagramAccountId: instagramAccountId || "ig-account",
      recipientId: recipientId || "test_user_id",
      recipientUsername: recipientUsername || "tester",
      condition: condition as FollowUpCondition,
      followUpType: followUpType as FollowUpType,
      customMessage,
      delayMinutes: Number(delayMinutes) || 60,
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process follow-up action" },
      { status: 500 }
    );
  }
}
