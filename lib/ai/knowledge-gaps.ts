import { getAllLeads } from "./leads";
import { appendQAToKnowledgeBase, getCampaignRAGContext } from "./rag";
import { generateAICompletion } from "./gateway";
import { dispatchOutboundEvent } from "@/lib/crm/webhooks";

export type KnowledgeGapCategory =
  | "PRICING"
  | "ENTERPRISE"
  | "INTEGRATION"
  | "REFUND_POLICY"
  | "PRODUCT_FEATURE"
  | "SUPPORT";

export type KnowledgeGapStatus = "DETECTED" | "APPROVED" | "DISMISSED";

export interface KnowledgeGap {
  id: string;
  topic: string;
  category: KnowledgeGapCategory;
  frequency: number;
  sampleQuestions: string[];
  impactedUsers: string[];
  suggestedQuestion: string;
  suggestedAnswer: string;
  confidence: number;
  status: KnowledgeGapStatus;
  campaignId?: string;
  campaignName?: string;
  createdAt: number;
  approvedAt?: number;
}

// In-memory persistent store for discovered knowledge gaps
const gapsStore = new Map<string, KnowledgeGap>();

function ensureSeedGaps() {
  if (gapsStore.size === 0) {
    const seed1: KnowledgeGap = {
      id: "gap_enterprise_tier",
      topic: "Enterprise & Team Onboarding",
      category: "ENTERPRISE",
      frequency: 4,
      sampleQuestions: [
        "Do you offer custom enterprise onboarding for marketing teams with 15+ members?",
        "Can we get dedicated account management and custom team seats?",
        "Is there an agency volume discount for managing 20+ client accounts?",
      ],
      impactedUsers: ["sarah_growth", "marcus_agency", "david_director"],
      suggestedQuestion: "Do you offer custom enterprise or multi-seat agency onboarding?",
      suggestedAnswer:
        "Yes! For marketing teams and agencies with 10+ team members or 20+ accounts, we offer dedicated VIP onboarding, custom SLA, and pooled seat pricing. Contact enterprise@openreply.app or reply 'ENTERPRISE' here for custom pricing.",
      confidence: 0.94,
      status: "DETECTED",
      campaignName: "Launch Guide Reel",
      createdAt: Date.now() - 4 * 3600 * 1000,
    };

    const seed2: KnowledgeGap = {
      id: "gap_crm_zapier",
      topic: "CRM & Zapier Integrations",
      category: "INTEGRATION",
      frequency: 3,
      sampleQuestions: [
        "Is there a webhook for Zapier integration with Real Estate CRM?",
        "Can I sync captured phone numbers and emails to HubSpot automatically?",
        "Do you support Make.com or webhook triggers for lead capture?",
      ],
      impactedUsers: ["elena_realtor", "tech_founder_jack"],
      suggestedQuestion: "How do I integrate OpenReply with my CRM, Zapier, or Make.com?",
      suggestedAnswer:
        "OpenReply offers real-time outbound webhooks and native Zapier integration. All captured emails, phones, and hot lead intents can automatically stream to HubSpot, Salesforce, GoHighLevel, or Google Sheets.",
      confidence: 0.91,
      status: "DETECTED",
      campaignName: "Real Estate Leads Funnel",
      createdAt: Date.now() - 12 * 3600 * 1000,
    };

    const seed3: KnowledgeGap = {
      id: "gap_refund_trial",
      topic: "Money-Back Guarantee & Trial Terms",
      category: "REFUND_POLICY",
      frequency: 2,
      sampleQuestions: [
        "What happens if I try it and it doesn't work for my niche?",
        "Is there a money-back guarantee or trial period?",
      ],
      impactedUsers: ["growth_hacker_dan"],
      suggestedQuestion: "What is your refund policy or trial guarantee?",
      suggestedAnswer:
        "We offer a 14-day 100% money-back guarantee on all plans. If OpenReply does not save you at least 5 hours per week or increase your DM conversion, reach out within 14 days for a full refund.",
      confidence: 0.88,
      status: "DETECTED",
      campaignName: "Black Friday Automation",
      createdAt: Date.now() - 18 * 3600 * 1000,
    };

    gapsStore.set(seed1.id, seed1);
    gapsStore.set(seed2.id, seed2);
    gapsStore.set(seed3.id, seed3);
  }
}

/**
 * Retrieve all identified knowledge gaps with optional filters
 */
export function getAllKnowledgeGaps(filter?: {
  campaignId?: string;
  status?: KnowledgeGapStatus;
}): KnowledgeGap[] {
  ensureSeedGaps();
  let list = Array.from(gapsStore.values());

  if (filter?.status) {
    list = list.filter((g) => g.status === filter.status);
  }
  if (filter?.campaignId) {
    list = list.filter((g) => !g.campaignId || g.campaignId === filter.campaignId);
  }

  return list.sort((a, b) => b.frequency - a.frequency || b.createdAt - a.createdAt);
}

/**
 * Cluster and analyze unanswerable questions from leads to discover new knowledge gaps
 */
export async function analyzeAndClusterKnowledgeGaps(): Promise<{
  newGapsCount: number;
  totalGaps: KnowledgeGap[];
}> {
  ensureSeedGaps();
  const leads = getAllLeads();
  const unresolvedQuestions = leads.map((l) => ({
    username: l.username,
    question: l.lastMessage,
    escalationReason: l.escalationReason,
    intent: l.intent,
    campaignName: l.campaignName,
  }));

  if (unresolvedQuestions.length === 0) {
    return {
      newGapsCount: 0,
      totalGaps: getAllKnowledgeGaps(),
    };
  }

  try {
    const prompt = `
You are an AI Knowledge Intelligence system analyzing Instagram inquiries that could NOT be answered by the current RAG knowledge base and required human escalation.

Here are recent escalated customer inquiries:
${JSON.stringify(unresolvedQuestions.slice(0, 15), null, 2)}

Your task:
1. Cluster recurring themes and common questions into distinct knowledge gaps.
2. For each cluster:
   - Identify the clear topic.
   - Categorize as one of: PRICING, ENTERPRISE, INTEGRATION, REFUND_POLICY, PRODUCT_FEATURE, SUPPORT.
   - Write a clear, generalized FAQ question.
   - Write a high-accuracy, helpful brand answer that can be directly added to the brand's knowledge base.
   - Assign confidence score (0.5 to 0.99).

Return ONLY valid JSON:
{
  "clusters": [
    {
      "topic": "string",
      "category": "PRICING" | "ENTERPRISE" | "INTEGRATION" | "REFUND_POLICY" | "PRODUCT_FEATURE" | "SUPPORT",
      "sampleQuestions": ["string"],
      "impactedUsers": ["string"],
      "suggestedQuestion": "string",
      "suggestedAnswer": "string",
      "confidence": number
    }
  ]
}
`;

    const aiRes = await generateAICompletion({
      systemPrompt: "You are an autonomous customer support intelligence engine. Output JSON only.",
      userPrompt: prompt,
      jsonMode: true,
      temperature: 0.3,
    });

    const parsed = JSON.parse(aiRes.text);
    let newCount = 0;

    if (Array.isArray(parsed.clusters)) {
      for (const c of parsed.clusters) {
        if (!c.topic || !c.suggestedQuestion || !c.suggestedAnswer) continue;

        // Check if similar gap already exists
        const existing = Array.from(gapsStore.values()).find(
          (g) => g.topic.toLowerCase() === c.topic.toLowerCase()
        );

        if (existing) {
          // Update frequency and samples
          existing.frequency = Math.max(existing.frequency, c.sampleQuestions?.length || 1) + 1;
          existing.sampleQuestions = Array.from(
            new Set([...existing.sampleQuestions, ...(c.sampleQuestions || [])])
          ).slice(0, 5);
          existing.impactedUsers = Array.from(
            new Set([...existing.impactedUsers, ...(c.impactedUsers || [])])
          ).slice(0, 5);
        } else {
          const newId = `gap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const gap: KnowledgeGap = {
            id: newId,
            topic: c.topic,
            category: c.category || "SUPPORT",
            frequency: c.sampleQuestions?.length || 2,
            sampleQuestions: c.sampleQuestions || [],
            impactedUsers: c.impactedUsers || [],
            suggestedQuestion: c.suggestedQuestion,
            suggestedAnswer: c.suggestedAnswer,
            confidence: c.confidence || 0.88,
            status: "DETECTED",
            createdAt: Date.now(),
          };
          gapsStore.set(newId, gap);
          newCount++;

          void dispatchOutboundEvent("KNOWLEDGE_GAP_DETECTED", {
            gapId: gap.id,
            topic: gap.topic,
            category: gap.category,
            frequency: gap.frequency,
            suggestedQuestion: gap.suggestedQuestion,
            suggestedAnswer: gap.suggestedAnswer,
          });
        }
      }
    }

    return {
      newGapsCount: newCount,
      totalGaps: getAllKnowledgeGaps(),
    };
  } catch (err: unknown) {
    console.warn("[KnowledgeGap] AI clustering fallback:", err);
    return {
      newGapsCount: 0,
      totalGaps: getAllKnowledgeGaps(),
    };
  }
}

/**
 * Approve a knowledge gap and directly inject the Q&A pair into the campaign RAG knowledge base
 */
export function approveKnowledgeGap(params: {
  gapId: string;
  customAnswer?: string;
  customQuestion?: string;
  targetCampaignId?: string;
}): { success: boolean; gap?: KnowledgeGap; updatedFaqNotes?: string; error?: string } {
  ensureSeedGaps();
  const gap = gapsStore.get(params.gapId);
  if (!gap) {
    return { success: false, error: "Knowledge gap not found" };
  }

  const finalQuestion = params.customQuestion?.trim() || gap.suggestedQuestion;
  const finalAnswer = params.customAnswer?.trim() || gap.suggestedAnswer;
  const targetId = params.targetCampaignId || gap.campaignId || "draft";

  // Inject into campaign RAG FAQ notes
  const appended = appendQAToKnowledgeBase({
    campaignId: targetId,
    question: finalQuestion,
    answer: finalAnswer,
  });

  if (!appended) {
    return { success: false, error: "Failed to append to knowledge base context" };
  }

  gap.status = "APPROVED";
  gap.suggestedQuestion = finalQuestion;
  gap.suggestedAnswer = finalAnswer;
  gap.approvedAt = Date.now();
  gapsStore.set(gap.id, gap);

  const updatedContext = getCampaignRAGContext(targetId);

  return {
    success: true,
    gap,
    updatedFaqNotes: updatedContext?.faqNotes,
  };
}

/**
 * Dismiss a knowledge gap
 */
export function dismissKnowledgeGap(gapId: string): boolean {
  ensureSeedGaps();
  const gap = gapsStore.get(gapId);
  if (!gap) return false;
  gap.status = "DISMISSED";
  gapsStore.set(gapId, gap);
  return true;
}

/**
 * Statistical summary of knowledge gap coverage and learning velocity
 */
export function getKnowledgeGapStats() {
  ensureSeedGaps();
  const all = Array.from(gapsStore.values());
  const detected = all.filter((g) => g.status === "DETECTED");
  const approved = all.filter((g) => g.status === "APPROVED");
  const dismissed = all.filter((g) => g.status === "DISMISSED");

  const totalInquiriesImpacted = all.reduce((sum, g) => sum + g.frequency, 0);
  const resolvedInquiriesByLearning = approved.reduce((sum, g) => sum + g.frequency, 0);

  // Coverage score: 70 base + (approved proportion * 30)
  const coverageScore =
    all.length > 0
      ? Math.round(70 + (approved.length / (all.length || 1)) * 28)
      : 85;

  return {
    totalGaps: all.length,
    pendingReview: detected.length,
    approvedCount: approved.length,
    dismissedCount: dismissed.length,
    totalInquiriesImpacted,
    resolvedInquiriesByLearning,
    coverageScore,
    topGaps: detected.slice(0, 3),
  };
}
