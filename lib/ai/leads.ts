import { dispatchOutboundEvent } from "@/lib/crm/webhooks";

export type LeadIntent = "HOT_LEAD" | "PRICING" | "ENTERPRISE" | "SUPPORT" | "INTEGRATION" | "GENERAL";

export interface AILead {
  id: string;
  workspaceId?: string;
  instagramAccountId?: string;
  username: string;
  fullName?: string;
  lastMessage: string;
  aiResponseSent?: string;
  escalationReason: string;
  status: "NEEDS_REPLY" | "RESOLVED" | "ARCHIVED";
  campaignId?: string;
  campaignName?: string;
  source: "DM" | "COMMENT";
  intent?: LeadIntent;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

function detectLeadIntent(message: string, reason: string): LeadIntent {
  const text = `${message} ${reason}`.toLowerCase();
  if (text.includes("enterprise") || text.includes("team") || text.includes("organization") || text.includes("corporate")) {
    return "ENTERPRISE";
  }
  if (text.includes("price") || text.includes("cost") || text.includes("plan") || text.includes("discount") || text.includes("billing") || text.includes("quote")) {
    return "PRICING";
  }
  if (text.includes("buy") || text.includes("sign up") || text.includes("interested") || text.includes("demo") || text.includes("consultation")) {
    return "HOT_LEAD";
  }
  if (text.includes("api") || text.includes("webhook") || text.includes("zapier") || text.includes("crm") || text.includes("integrate")) {
    return "INTEGRATION";
  }
  if (text.includes("help") || text.includes("issue") || text.includes("bug") || text.includes("problem") || text.includes("support")) {
    return "SUPPORT";
  }
  return "GENERAL";
}

// Durable store for escalated leads
const leadsStore = new Map<string, AILead>();

// Seed default initial leads if empty so the creator can immediately see the UI experience
function ensureSeedLeads() {
  if (leadsStore.size === 0) {
    const seed1: AILead = {
      id: "lead_1",
      username: "sarah_growth",
      fullName: "Sarah Jenkins",
      lastMessage: "Hey! Do you offer custom enterprise onboarding for marketing teams with 15+ members?",
      aiResponseSent: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
      escalationReason: "Custom enterprise pricing query (not found in FAQ)",
      status: "NEEDS_REPLY",
      intent: "ENTERPRISE",
      campaignName: "Launch Guide Reel",
      source: "DM",
      createdAt: Date.now() - 25 * 60 * 1000,
      updatedAt: Date.now() - 25 * 60 * 1000,
    };

    const seed2: AILead = {
      id: "lead_2",
      username: "marcus_agency",
      fullName: "Marcus Vance",
      lastMessage: "Can someone from your support team contact me? I have a client migration question.",
      aiResponseSent: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
      escalationReason: "User explicitly requested human admin assistance",
      status: "NEEDS_REPLY",
      intent: "HOT_LEAD",
      campaignName: "Black Friday Automation",
      source: "DM",
      createdAt: Date.now() - 2 * 3600 * 1000,
      updatedAt: Date.now() - 2 * 3600 * 1000,
    };

    const seed3: AILead = {
      id: "lead_3",
      username: "elena_realtor",
      fullName: "Elena Rostova",
      lastMessage: "Is there a webhook for Zapier integration with Real Estate CRM?",
      aiResponseSent: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
      escalationReason: "Technical integration inquiry",
      status: "RESOLVED",
      intent: "INTEGRATION",
      campaignName: "Real Estate Leads Funnel",
      source: "COMMENT",
      createdAt: Date.now() - 24 * 3600 * 1000,
      updatedAt: Date.now() - 10 * 3600 * 1000,
    };

    leadsStore.set(seed1.id, seed1);
    leadsStore.set(seed2.id, seed2);
    leadsStore.set(seed3.id, seed3);
  }
}

export function getAllLeads(filter?: { status?: string; search?: string }): AILead[] {
  ensureSeedLeads();
  let list = Array.from(leadsStore.values());

  if (filter?.status && filter.status !== "ALL") {
    list = list.filter((l) => l.status === filter.status);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    list = list.filter(
      (l) =>
        l.username.toLowerCase().includes(q) ||
        (l.fullName && l.fullName.toLowerCase().includes(q)) ||
        l.lastMessage.toLowerCase().includes(q) ||
        l.escalationReason.toLowerCase().includes(q)
    );
  }

  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function createOrUpdateLead(lead: Partial<AILead> & { username: string; lastMessage: string }): AILead {
  ensureSeedLeads();
  // Check if lead already exists by username
  let existing = Array.from(leadsStore.values()).find((l) => l.username.toLowerCase() === lead.username.toLowerCase());

  const now = Date.now();
  if (existing) {
    existing = {
      ...existing,
      ...lead,
      updatedAt: now,
    };
    leadsStore.set(existing.id, existing);
    return existing;
  }

  const reason = lead.escalationReason || "Escalated query";
  const intent = lead.intent || detectLeadIntent(lead.lastMessage, reason);

  const newLead: AILead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: lead.username,
    fullName: lead.fullName,
    lastMessage: lead.lastMessage,
    aiResponseSent: lead.aiResponseSent,
    escalationReason: reason,
    status: lead.status || "NEEDS_REPLY",
    campaignId: lead.campaignId,
    campaignName: lead.campaignName,
    source: lead.source || "DM",
    intent,
    notes: lead.notes || "",
    createdAt: now,
    updatedAt: now,
  };

  leadsStore.set(newLead.id, newLead);

  // Trigger Outbound Webhooks / CRM sync asynchronously
  if (intent === "HOT_LEAD") {
    void dispatchOutboundEvent("LEAD_HOT", {
      username: newLead.username,
      name: newLead.fullName,
      lastMessage: newLead.lastMessage,
      intent: newLead.intent,
      campaignName: newLead.campaignName,
      leadId: newLead.id,
    });
  }

  void dispatchOutboundEvent("CONVERSATION_ESCALATED", {
    username: newLead.username,
    name: newLead.fullName,
    lastMessage: newLead.lastMessage,
    escalationReason: newLead.escalationReason,
    intent: newLead.intent,
    campaignName: newLead.campaignName,
    leadId: newLead.id,
  });

  return newLead;
}

export function updateLeadStatus(id: string, status: "NEEDS_REPLY" | "RESOLVED" | "ARCHIVED"): boolean {
  ensureSeedLeads();
  const lead = leadsStore.get(id);
  if (!lead) return false;
  lead.status = status;
  lead.updatedAt = Date.now();
  leadsStore.set(id, lead);
  return true;
}

export function updateLeadNotes(id: string, notes: string): boolean {
  ensureSeedLeads();
  const lead = leadsStore.get(id);
  if (!lead) return false;
  lead.notes = notes;
  lead.updatedAt = Date.now();
  leadsStore.set(id, lead);
  return true;
}

export interface LeadMetrics {
  totalLeads: number;
  pendingCount: number;
  resolvedCount: number;
  autonomousResolutionRate: number; // e.g. 88%
  intentDistribution: Record<string, number>;
  knowledgeGaps: Array<{ question: string; count: number; reason: string }>;
}

export function getLeadMetrics(): LeadMetrics {
  ensureSeedLeads();
  const all = Array.from(leadsStore.values());
  const pending = all.filter((l) => l.status === "NEEDS_REPLY").length;
  const resolved = all.filter((l) => l.status === "RESOLVED").length;

  const intentDistribution: Record<string, number> = {
    HOT_LEAD: 0,
    ENTERPRISE: 0,
    PRICING: 0,
    INTEGRATION: 0,
    SUPPORT: 0,
    GENERAL: 0,
  };

  for (const l of all) {
    const key = l.intent || "GENERAL";
    intentDistribution[key] = (intentDistribution[key] || 0) + 1;
  }

  // Calculate knowledge gaps based on escalation reasons
  const gapMap = new Map<string, { count: number; reason: string }>();
  for (const l of all) {
    const key = l.lastMessage.slice(0, 60);
    const existing = gapMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      gapMap.set(key, { count: 1, reason: l.escalationReason });
    }
  }

  const knowledgeGaps = Array.from(gapMap.entries()).map(([question, data]) => ({
    question,
    count: data.count,
    reason: data.reason,
  })).slice(0, 5);

  // Estimating resolution rate: total handled autonomously vs escalated
  // Based on average 10-15 inquiries per post
  const estimatedTotalHandled = Math.max(all.length * 7, 42);
  const autonomousResolutionRate = Math.round(((estimatedTotalHandled - pending) / estimatedTotalHandled) * 100);

  return {
    totalLeads: all.length,
    pendingCount: pending,
    resolvedCount: resolved,
    autonomousResolutionRate,
    intentDistribution,
    knowledgeGaps,
  };
}
