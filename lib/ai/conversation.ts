import { dispatchOutboundEvent } from "@/lib/crm/webhooks";

export interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "admin";
  text: string;
  timestamp: number;
  intent?: string;
}

export interface UserProfile {
  username: string;
  fullName?: string;
  email?: string;
  phone?: string;
  interestTags: string[];
  totalMessages: number;
  firstSeenAt: number;
  lastSeenAt: number;
  leadScore: number; // 0 to 100
  stage: "DISCOVERY" | "EVALUATING" | "QUALIFIED" | "CONVERTED" | "ESCALATED";
}

// In-memory store for rolling multi-turn threads
const conversationStore = new Map<string, ChatMessage[]>();
const userProfileStore = new Map<string, UserProfile>();

// Seed default conversation history for demonstration leads
function ensureSeedConversations() {
  if (conversationStore.size === 0) {
    const now = Date.now();

    // Sarah's thread (Enterprise onboarding query)
    conversationStore.set("sarah_growth", [
      {
        id: "msg_s1",
        sender: "user",
        text: "Hi there! I saw your reel about the new automation guide.",
        timestamp: now - 35 * 60 * 1000,
        intent: "GENERAL",
      },
      {
        id: "msg_s2",
        sender: "bot",
        text: "Hey Sarah! Thanks for reaching out. Here is the link to download the agency launch guide: https://openreply.app/guide",
        timestamp: now - 34 * 60 * 1000,
      },
      {
        id: "msg_s3",
        sender: "user",
        text: "Thanks! Quick question: Do you offer custom enterprise onboarding for marketing teams with 15+ members?",
        timestamp: now - 25 * 60 * 1000,
        intent: "ENTERPRISE",
      },
      {
        id: "msg_s4",
        sender: "bot",
        text: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
        timestamp: now - 24 * 60 * 1000,
      },
    ]);

    userProfileStore.set("sarah_growth", {
      username: "sarah_growth",
      fullName: "Sarah Jenkins",
      interestTags: ["Enterprise", "15+ Seats", "Agency Onboarding"],
      totalMessages: 4,
      firstSeenAt: now - 35 * 60 * 1000,
      lastSeenAt: now - 24 * 60 * 1000,
      leadScore: 92,
      stage: "QUALIFIED",
    });

    // Marcus's thread (Human assistance request)
    conversationStore.set("marcus_agency", [
      {
        id: "msg_m1",
        sender: "user",
        text: "Does OpenReply support migrating 20+ client accounts from ManyChat?",
        timestamp: now - 2 * 3600 * 1000 - 15 * 60 * 1000,
        intent: "INTEGRATION",
      },
      {
        id: "msg_m2",
        sender: "bot",
        text: "Yes! OpenReply supports bulk CSV contact import and ManyChat campaign mapping.",
        timestamp: now - 2 * 3600 * 1000 - 14 * 60 * 1000,
      },
      {
        id: "msg_m3",
        sender: "user",
        text: "Can someone from your support team contact me? I have a client migration question.",
        timestamp: now - 2 * 3600 * 1000,
        intent: "HOT_LEAD",
      },
      {
        id: "msg_m4",
        sender: "bot",
        text: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
        timestamp: now - 2 * 3600 * 1000 + 30 * 1000,
      },
    ]);

    userProfileStore.set("marcus_agency", {
      username: "marcus_agency",
      fullName: "Marcus Vance",
      interestTags: ["Agency", "ManyChat Migration", "Client Multi-Account"],
      totalMessages: 4,
      firstSeenAt: now - 3 * 3600 * 1000,
      lastSeenAt: now - 2 * 3600 * 1000,
      leadScore: 88,
      stage: "ESCALATED",
    });

    // Elena's thread (Resolved integration query)
    conversationStore.set("elena_realtor", [
      {
        id: "msg_e1",
        sender: "user",
        text: "Is there a webhook for Zapier integration with Real Estate CRM?",
        timestamp: now - 24 * 3600 * 1000,
        intent: "INTEGRATION",
      },
      {
        id: "msg_e2",
        sender: "bot",
        text: "I've forwarded your question to our team! A member will review this and message you directly here shortly.",
        timestamp: now - 24 * 3600 * 1000 + 45 * 1000,
      },
      {
        id: "msg_e3",
        sender: "admin",
        text: "Hi Elena! Yes, we offer Zapier webhooks and direct FollowUpBoss integration. You can find our webhook settings under Settings > Webhooks.",
        timestamp: now - 10 * 3600 * 1000,
      },
      {
        id: "msg_e4",
        sender: "user",
        text: "Perfect, that solved it! Setting it up now.",
        timestamp: now - 9 * 3600 * 1000,
      },
    ]);

    userProfileStore.set("elena_realtor", {
      username: "elena_realtor",
      fullName: "Elena Rostova",
      interestTags: ["Zapier", "Real Estate CRM", "FollowUpBoss"],
      totalMessages: 4,
      firstSeenAt: now - 24 * 3600 * 1000,
      lastSeenAt: now - 9 * 3600 * 1000,
      leadScore: 75,
      stage: "CONVERTED",
    });
  }
}

export function getConversationHistory(rawUsername: string): ChatMessage[] {
  ensureSeedConversations();
  const username = rawUsername.trim().toLowerCase().replace(/^@/, "");
  return conversationStore.get(username) || [];
}

export function appendChatMessage(
  rawUsername: string,
  message: { sender: "user" | "bot" | "admin"; text: string; intent?: string }
): ChatMessage {
  ensureSeedConversations();
  const username = rawUsername.trim().toLowerCase().replace(/^@/, "");
  const current = conversationStore.get(username) || [];

  const newMsg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sender: message.sender,
    text: message.text,
    timestamp: Date.now(),
    intent: message.intent,
  };

  const updated = [...current, newMsg];
  // Retain up to 25 messages per conversation buffer
  if (updated.length > 25) {
    updated.shift();
  }
  conversationStore.set(username, updated);

  // Update profile
  updateProfileOnNewMessage(username, message.sender, message.text, message.intent);

  return newMsg;
}

export function getUserProfile(rawUsername: string): UserProfile {
  ensureSeedConversations();
  const username = rawUsername.trim().toLowerCase().replace(/^@/, "");
  let profile = userProfileStore.get(username);

  if (!profile) {
    profile = {
      username,
      interestTags: [],
      totalMessages: 0,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      leadScore: 50,
      stage: "DISCOVERY",
    };
    userProfileStore.set(username, profile);
  }

  return profile;
}

function updateProfileOnNewMessage(
  username: string,
  sender: "user" | "bot" | "admin",
  text: string,
  intent?: string
) {
  const profile = getUserProfile(username);
  profile.totalMessages += 1;
  profile.lastSeenAt = Date.now();

  const lower = text.toLowerCase();
  const newTags = new Set(profile.interestTags);

  if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
    newTags.add("Pricing");
  }
  if (lower.includes("enterprise") || lower.includes("team") || lower.includes("custom")) {
    newTags.add("Enterprise");
    profile.leadScore = Math.min(100, profile.leadScore + 25);
    profile.stage = "QUALIFIED";
  }
  if (lower.includes("api") || lower.includes("webhook") || lower.includes("zapier")) {
    newTags.add("Integrations");
  }
  if (lower.includes("call") || lower.includes("demo") || lower.includes("buy")) {
    newTags.add("Hot Lead");
    profile.leadScore = Math.min(100, profile.leadScore + 30);
    profile.stage = "QUALIFIED";
  }
  if (intent === "HOT_LEAD") {
    profile.leadScore = Math.min(100, profile.leadScore + 20);
  }

  // Extract email address if present in user message
  if (sender === "user") {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !profile.email) {
      profile.email = emailMatch[0];
      newTags.add("Email Captured");
      profile.leadScore = Math.min(100, profile.leadScore + 35);
      void dispatchOutboundEvent("LEAD_EMAIL_CAPTURED", {
        username,
        email: profile.email,
        leadScore: profile.leadScore,
        lastMessage: text,
      });
    }

    // Extract phone number (e.g., +1-555-123-4567 or 10-digit number)
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch && !profile.phone && phoneMatch[0].replace(/\D/g, "").length >= 10) {
      profile.phone = phoneMatch[0];
      newTags.add("Phone Captured");
      profile.leadScore = Math.min(100, profile.leadScore + 35);
      void dispatchOutboundEvent("LEAD_PHONE_CAPTURED", {
        username,
        phone: profile.phone,
        leadScore: profile.leadScore,
        lastMessage: text,
      });
    }
  }

  profile.interestTags = Array.from(newTags);
  userProfileStore.set(username, profile);
}

export function clearConversationHistory(rawUsername: string): void {
  const username = rawUsername.trim().toLowerCase().replace(/^@/, "");
  conversationStore.delete(username);
}
