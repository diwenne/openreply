import { NextRequest, NextResponse } from "next/server";
import {
  getAllLeads,
  createOrUpdateLead,
  updateLeadStatus,
  updateLeadNotes,
  getLeadMetrics,
} from "@/lib/ai/leads";
import { generateAICompletion, getWorkspaceAISettings } from "@/lib/ai/gateway";
import {
  getConversationHistory,
  appendChatMessage,
  getUserProfile,
} from "@/lib/ai/conversation";
import { appendQAToKnowledgeBase } from "@/lib/ai/rag";
import { getAllKnowledgeGaps, approveKnowledgeGap } from "@/lib/ai/knowledge-gaps";
import { dispatchOutboundEvent } from "@/lib/crm/webhooks";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationUser = searchParams.get("conversation");

    if (conversationUser) {
      const history = getConversationHistory(conversationUser);
      const profile = getUserProfile(conversationUser);
      return NextResponse.json({
        success: true,
        data: {
          history,
          profile,
        },
      });
    }

    const status = searchParams.get("status") || "ALL";
    const search = searchParams.get("search") || "";
    const withMetrics = searchParams.get("metrics") === "true";

    const leads = getAllLeads({ status, search });
    const pendingCount = getAllLeads().filter((l) => l.status === "NEEDS_REPLY").length;
    const metrics = withMetrics ? getLeadMetrics() : undefined;

    return NextResponse.json({
      success: true,
      data: {
        leads,
        pendingCount,
        metrics,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "update_status") {
      const { id, status } = body;
      const ok = updateLeadStatus(id, status);
      return NextResponse.json({ success: ok });
    }

    if (action === "send_reply") {
      const { id, username, replyText, saveToFaq, question, campaignId } = body;
      if (!username || !replyText) {
        return NextResponse.json({ success: false, error: "Username and reply text required" }, { status: 400 });
      }

      // Record in conversation store
      const addedMsg = appendChatMessage(username, {
        sender: "admin",
        text: replyText,
      });

      // Mark lead as resolved
      if (id) {
        updateLeadStatus(id, "RESOLVED");
      }

      // 1-Click continuous learning: save to knowledge base
      let savedToFaq = false;
      if (saveToFaq && question) {
        const targetCampId = campaignId || "draft";
        savedToFaq = appendQAToKnowledgeBase({
          campaignId: targetCampId,
          question,
          answer: replyText,
        });

        // Check if question matches any detected knowledge gap and mark as approved
        const detectedGaps = getAllKnowledgeGaps({ status: "DETECTED" });
        const lowerQ = question.toLowerCase();
        for (const g of detectedGaps) {
          if (
            lowerQ.includes(g.topic.toLowerCase()) ||
            g.sampleQuestions.some((sq) => sq.toLowerCase().includes(lowerQ) || lowerQ.includes(sq.toLowerCase()))
          ) {
            approveKnowledgeGap({
              gapId: g.id,
              customQuestion: question,
              customAnswer: replyText,
              targetCampaignId: targetCampId,
            });
            break;
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          message: addedMsg,
          savedToFaq,
        },
      });
    }

    if (action === "save_to_faq") {
      const { campaignId, question, answer } = body;
      if (!question || !answer) {
        return NextResponse.json({ success: false, error: "Question and answer required" }, { status: 400 });
      }
      const ok = appendQAToKnowledgeBase({
        campaignId,
        question,
        answer,
      });
      return NextResponse.json({ success: ok });
    }

    if (action === "update_notes") {
      const { id, notes } = body;
      const ok = updateLeadNotes(id, notes || "");
      return NextResponse.json({ success: ok });
    }

    if (action === "forward_webhook") {
      const { lead, webhookUrl } = body;

      // Also trigger global configured webhooks for this lead
      const trigger = lead.intent === "HOT_LEAD" ? "LEAD_HOT" : "CONVERSATION_ESCALATED";
      void dispatchOutboundEvent(trigger, {
        username: lead.username,
        name: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        intent: lead.intent,
        campaignName: lead.campaignName,
        lastMessage: lead.lastMessage,
        escalationReason: lead.escalationReason,
        notes: lead.notes,
      });

      if (webhookUrl) {
        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "openreply.lead_escalated",
              timestamp: new Date().toISOString(),
              lead: {
                username: lead.username,
                message: lead.lastMessage,
                reason: lead.escalationReason,
                intent: lead.intent,
                status: lead.status,
                campaign: lead.campaignName,
                source: lead.source,
                notes: lead.notes,
              },
            }),
          });

          return NextResponse.json({
            success: true,
            status: response.status,
            message: "Lead forwarded to CRM webhook successfully",
          });
        } catch (err) {
          return NextResponse.json({
            success: false,
            error: (err as Error).message || "Webhook delivery failed",
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: "Dispatched to all connected outbound CRM webhooks",
      });
    }

    if (action === "create_lead") {
      const { username, lastMessage, escalationReason, campaignName, source, intent } = body;
      const lead = createOrUpdateLead({
        username,
        lastMessage,
        escalationReason,
        campaignName,
        source,
        intent,
      });
      return NextResponse.json({ success: true, data: lead });
    }

    // AI Assist: Suggest high-converting, empathetic reply for this escalated lead
    if (action === "suggest_reply") {
      const { username, userMessage, escalationReason, campaignContext } = body;
      const settings = getWorkspaceAISettings();

      const prompt = `
You are the founder/creator responding directly to an escalated lead on Instagram.
User: @${username}
Their Message/Question: "${userMessage}"
Why AI escalated it: "${escalationReason}"
Additional context: ${campaignContext || "None provided"}

Write a natural, direct, and warm creator reply.
Rules:
- Be concise (1-3 sentences).
- Directly answer or invite them to a quick resolution/call/link.
- Sound like a real person, not an automated bot.
- No quotation marks.
`;

      const result = await generateAICompletion({
        systemPrompt: "You are the creator personally messaging an interested lead.",
        userPrompt: prompt,
        temperature: 0.6,
        maxTokens: 150,
        settings,
      });

      return NextResponse.json({
        success: true,
        data: {
          suggestion: result.text.trim().replace(/^["']|["']$/g, ""),
        },
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
