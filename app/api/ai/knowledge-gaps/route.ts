import { NextRequest, NextResponse } from "next/server";
import {
  getAllKnowledgeGaps,
  analyzeAndClusterKnowledgeGaps,
  approveKnowledgeGap,
  dismissKnowledgeGap,
  getKnowledgeGapStats,
  type KnowledgeGapStatus,
} from "@/lib/ai/knowledge-gaps";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") || undefined;
    const status = (searchParams.get("status") as KnowledgeGapStatus) || undefined;

    const gaps = getAllKnowledgeGaps({ campaignId, status });
    const stats = getKnowledgeGapStats();

    return NextResponse.json({
      success: true,
      data: {
        gaps,
        stats,
      },
    });
  } catch (err: unknown) {
    console.error("[API /api/ai/knowledge-gaps GET] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch knowledge gaps" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || "analyze";

    if (action === "analyze") {
      const result = await analyzeAndClusterKnowledgeGaps();
      const stats = getKnowledgeGapStats();
      return NextResponse.json({
        success: true,
        data: {
          newGapsCount: result.newGapsCount,
          gaps: result.totalGaps,
          stats,
        },
      });
    }

    if (action === "approve") {
      const { gapId, customQuestion, customAnswer, targetCampaignId } = body;
      if (!gapId) {
        return NextResponse.json({ success: false, error: "Missing gapId" }, { status: 400 });
      }

      const res = approveKnowledgeGap({
        gapId,
        customQuestion,
        customAnswer,
        targetCampaignId,
      });

      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      }

      const stats = getKnowledgeGapStats();
      return NextResponse.json({
        success: true,
        data: {
          gap: res.gap,
          updatedFaqNotes: res.updatedFaqNotes,
          stats,
        },
      });
    }

    if (action === "batch_approve") {
      const { targetCampaignId } = body;
      const allPending = getAllKnowledgeGaps({ status: "DETECTED" });
      let approvedCount = 0;

      for (const gap of allPending) {
        const res = approveKnowledgeGap({
          gapId: gap.id,
          targetCampaignId,
        });
        if (res.success) approvedCount++;
      }

      const stats = getKnowledgeGapStats();
      const gaps = getAllKnowledgeGaps({ status: undefined });

      return NextResponse.json({
        success: true,
        data: {
          approvedCount,
          gaps,
          stats,
        },
      });
    }

    if (action === "dismiss") {
      const { gapId } = body;
      if (!gapId) {
        return NextResponse.json({ success: false, error: "Missing gapId" }, { status: 400 });
      }

      const ok = dismissKnowledgeGap(gapId);
      const stats = getKnowledgeGapStats();
      return NextResponse.json({
        success: ok,
        data: { stats },
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[API /api/ai/knowledge-gaps POST] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process knowledge gap action" },
      { status: 500 }
    );
  }
}
