import { generateAICompletion } from "./gateway";
import { getWorkspaceAISettings } from "./gateway";

export interface DocumentSnippet {
  id: string;
  source: string;
  text: string;
}

export interface CampaignRAGContext {
  campaignId?: string;
  postId?: string;
  documentName?: string;
  rawText: string;
  postCaption?: string;
  faqNotes?: string;
  brandTone?: string;
  aiModeEnabled?: boolean;
  aiPublicReplyEnabled?: boolean;
  autoTranslate?: boolean;
  autoEscalateUnsure?: boolean;
  followUpCondition?: "ALWAYS" | "IF_NOT_CLICKED" | "IF_NOT_REPLIED";
  followUpType?: "CUSTOM_MESSAGE" | "AI_SMART_REENGAGE";
  storyMentionEnabled?: boolean;
  storyMentionMessage?: string;
  storyReplyEnabled?: boolean;
  storyReplyMessage?: string;
  updatedAt: number;
}

// In-memory store for campaign & post knowledge bases (instant access in workers & routes)
const campaignRagStore = new Map<string, CampaignRAGContext>();
const postRagStore = new Map<string, CampaignRAGContext>();

/**
 * Split text into overlapping semantic chunks
 */
export function chunkText(text: string, chunkSize = 400, overlap = 60): string[] {
  if (!text || text.trim().length === 0) return [];
  const clean = text.replace(/\r\n/g, "\n");
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];

  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((currentChunk + "\n\n" + trimmed).length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      if (trimmed.length > chunkSize) {
        // Break large single paragraphs by sentences
        const sentences = trimmed.split(/(?<=[.?!])\s+/);
        let subChunk = "";
        for (const s of sentences) {
          if ((subChunk + " " + s).length <= chunkSize) {
            subChunk = subChunk ? subChunk + " " + s : s;
          } else {
            if (subChunk) chunks.push(subChunk);
            subChunk = s;
          }
        }
        if (subChunk) currentChunk = subChunk;
      } else {
        // Keep slight overlap from prior chunk
        const words = currentChunk.split(/\s+/);
        const overlapText = words.slice(-Math.min(words.length, 12)).join(" ");
        currentChunk = overlap ? `${overlapText}\n\n${trimmed}` : trimmed;
      }
    }
  }

  if (currentChunk && !chunks.includes(currentChunk)) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text.slice(0, chunkSize)];
}

/**
 * Retrieve top relevant chunks based on token/keyword overlap and semantic scoring
 */
export function retrieveRelevantContext(
  context: CampaignRAGContext,
  query: string,
  topK = 3
): string {
  const allText = [
    context.postCaption ? `[Post Caption]: ${context.postCaption}` : "",
    context.faqNotes ? `[Creator Notes / FAQ]: ${context.faqNotes}` : "",
    context.rawText ? `[Knowledge Base]: ${context.rawText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!allText.trim()) return "";

  const chunks = chunkText(allText, 350, 40);
  if (chunks.length <= topK) {
    return chunks.join("\n\n---\n\n");
  }

  // Tokenize query words (removing stopwords)
  const stopwords = new Set([
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "in", "to", "for", "with",
    "can", "you", "i", "me", "my", "please", "tell", "what", "how", "where", "when",
  ]);

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));

  if (queryTerms.length === 0) {
    return chunks.slice(0, topK).join("\n\n---\n\n");
  }

  // Score each chunk
  const scored = chunks.map((chunk) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const occurrences = (chunkLower.match(new RegExp(`\\b${term}`, "g")) || []).length;
      score += occurrences * 2;
    }
    // Boost chunks that match complete phrases
    if (chunkLower.includes(query.toLowerCase().trim())) {
      score += 5;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .slice(0, topK)
    .map((s) => s.chunk)
    .join("\n\n---\n\n");
}

export function saveCampaignRAGContext(
  campaignId: string,
  context: Partial<CampaignRAGContext>
): CampaignRAGContext {
  const existing = campaignRagStore.get(campaignId) || {
    campaignId,
    rawText: "",
    updatedAt: Date.now(),
  };

  const updated: CampaignRAGContext = {
    ...existing,
    ...context,
    campaignId,
    updatedAt: Date.now(),
  };

  campaignRagStore.set(campaignId, updated);
  if (updated.postId) {
    postRagStore.set(updated.postId, updated);
  }
  return updated;
}

export function getCampaignRAGContext(campaignIdOrPostId: string): CampaignRAGContext | null {
  return (
    campaignRagStore.get(campaignIdOrPostId) ||
    postRagStore.get(campaignIdOrPostId) ||
    null
  );
}

/**
 * 1-Click Continuous Learning: Append an admin Q&A directly into campaign/post knowledge base
 */
export function appendQAToKnowledgeBase(params: {
  campaignId?: string;
  postId?: string;
  question: string;
  answer: string;
}): boolean {
  const id = params.campaignId || params.postId;
  if (!id) return false;

  const existing = getCampaignRAGContext(id) || {
    campaignId: id,
    rawText: "",
    updatedAt: Date.now(),
  };

  const newFaqEntry = `Q: ${params.question.trim()}\nA: ${params.answer.trim()}`;
  const currentFaq = existing.faqNotes?.trim() || "";
  const updatedFaq = currentFaq ? `${currentFaq}\n\n${newFaqEntry}` : newFaqEntry;

  saveCampaignRAGContext(id, {
    ...existing,
    faqNotes: updatedFaq,
  });

  return true;
}

/**
 * Intelligent Intent & Spam Evaluator for Webhook Comments
 */
export async function evaluateCommentIntent(params: {
  commentText: string;
  postCaption?: string;
  keywords: string[];
  ragContext?: CampaignRAGContext | null;
}): Promise<{
  isSpam: boolean;
  spamReason?: string;
  matchedIntent: boolean;
  intentCategory: "WANTS_RESOURCE" | "QUESTION_NEEDING_ANSWER" | "GENERAL_APPRECIATION" | "SPAM";
  confidence: number;
}> {
  const { commentText, postCaption, keywords, ragContext } = params;
  const workspaceSettings = getWorkspaceAISettings();
  const additionalContext = ragContext?.faqNotes ? `\nPost FAQ: ${ragContext.faqNotes}` : "";

  // Fast rule-based pre-filter for crypto/scam bots
  const textLower = commentText.toLowerCase();
  const spamTriggers = [
    "dm me for promo",
    "whatsapp me",
    "crypto",
    "forex",
    "telegram @",
    "invest with",
    "profit guaranteed",
    "promote it on",
    "send pic on",
  ];
  if (spamTriggers.some((t) => textLower.includes(t))) {
    return {
      isSpam: true,
      spamReason: "Spam keyword trigger matched",
      matchedIntent: false,
      intentCategory: "SPAM",
      confidence: 1.0,
    };
  }

  // Fast check if user typed one of the exact keywords
  const hasExactKeyword = keywords.some((k) =>
    new RegExp(`\\b${k.trim()}\\b`, "i").test(commentText)
  );
  if (hasExactKeyword) {
    return {
      isSpam: false,
      matchedIntent: true,
      intentCategory: "WANTS_RESOURCE",
      confidence: 0.99,
    };
  }

  const prompt = `
Evaluate this Instagram comment for an automated creator response workflow.
Post Context/Caption: "${postCaption || "No caption available"}"${additionalContext}
Target Campaign Trigger Goal: Sending link/resource for keywords: ${JSON.stringify(keywords)}
Comment Text: "${commentText}"

Analyze whether:
1. Is it spam, crypto, hate, bot promo, or irrelevant noise?
2. Did the commenter show intent to receive the resource, link, guide, discount, or information?
3. Or are they asking a genuine question about the post?

Return ONLY valid JSON in this exact structure:
{
  "isSpam": boolean,
  "matchedIntent": boolean,
  "intentCategory": "WANTS_RESOURCE" | "QUESTION_NEEDING_ANSWER" | "GENERAL_APPRECIATION" | "SPAM",
  "confidence": number,
  "reason": string
}
`;

  try {
    const result = await generateAICompletion({
      systemPrompt: "You are a high-speed Instagram intent classifier. Output ONLY JSON.",
      userPrompt: prompt,
      jsonMode: true,
      temperature: 0.1,
      settings: workspaceSettings,
    });

    const parsed = JSON.parse(result.text);
    return {
      isSpam: Boolean(parsed.isSpam),
      spamReason: parsed.reason,
      matchedIntent: Boolean(parsed.matchedIntent),
      intentCategory: parsed.intentCategory || "GENERAL_APPRECIATION",
      confidence: parsed.confidence || 0.8,
    };
  } catch (err: unknown) {
    console.warn("[RAG] Fallback evaluating intent:", err);
    // Fallback heuristic
    const wantsResource =
      textLower.includes("link") ||
      textLower.includes("send") ||
      textLower.includes("where") ||
      textLower.includes("how") ||
      textLower.includes("info") ||
      textLower.includes("price") ||
      textLower.includes("need");

    return {
      isSpam: false,
      matchedIntent: wantsResource,
      intentCategory: wantsResource ? "WANTS_RESOURCE" : "GENERAL_APPRECIATION",
      confidence: wantsResource ? 0.85 : 0.4,
    };
  }
}

/**
 * Generate a Contextual, Anti-Spam Public Reply using Post Caption & RAG
 */
export async function generateContextualPublicReply(params: {
  commenterName?: string;
  commentText: string;
  postCaption?: string;
  ragContext?: CampaignRAGContext | null;
  brandTone?: string;
}): Promise<string> {
  const { commenterName, commentText, postCaption, ragContext, brandTone } = params;
  const workspaceSettings = getWorkspaceAISettings();

  const retrievedDocs = ragContext ? retrieveRelevantContext(ragContext, commentText, 2) : "";
  const tone = brandTone || ragContext?.brandTone || workspaceSettings.defaultBrandTone;

  const prompt = `
Generate a natural, unique, and warm public reply to this Instagram comment.
The user will also receive a private DM with the requested link or resource.

Commenter: @${commenterName || "user"}
Comment: "${commentText}"
Post Caption Context: "${postCaption || ""}"
Knowledge Base Context: "${retrievedDocs || ""}"
Brand Tone: ${tone}

Rules:
1. Max 1-2 short sentences.
2. Be genuine and conversational. Avoid repetitive robotic phrases like "Check your DMs! 📩".
3. Acknowledge what they asked or said.
4. Let them know you've sent them a direct message with the details.
5. If they commented in another language (e.g. Spanish, French, German), reply in that SAME language.
6. Do NOT include quotation marks around your reply.
`;

  try {
    const result = await generateAICompletion({
      systemPrompt: "You are a creator responding authentically to comments on your Instagram posts.",
      userPrompt: prompt,
      temperature: 0.7,
      maxTokens: 100,
      settings: workspaceSettings,
    });

    let clean = result.text.trim().replace(/^["']|["']$/g, "");
    if (!clean) {
      clean = "Just sent that over to your private messages! Check your inbox 📩";
    }
    return clean;
  } catch {
    return "Sent you the details directly in private messages! Hope it helps!";
  }
}

/**
 * Answer an incoming DM or query using RAG Context or Escalate to Creator
 */
export async function answerWithRAGOrEscalate(params: {
  senderName?: string;
  incomingMessage: string;
  campaignContext?: CampaignRAGContext | null;
  fallbackDmMessage: string;
  trackedUrl?: string;
  conversationHistory?: Array<{ sender: "user" | "bot" | "admin"; text: string }>;
}): Promise<{
  replyText: string;
  needsEscalation: boolean;
  confidence: number;
  reason: string;
}> {
  const { senderName, incomingMessage, campaignContext, fallbackDmMessage, trackedUrl, conversationHistory } = params;
  const workspaceSettings = getWorkspaceAISettings();

  // If no document or FAQ is attached, deliver standard campaign message with link
  if (!campaignContext || (!campaignContext.rawText && !campaignContext.faqNotes)) {
    let msg = fallbackDmMessage;
    if (trackedUrl && !msg.includes(trackedUrl)) {
      msg = `${msg}\n\n${trackedUrl}`;
    }
    return {
      replyText: msg,
      needsEscalation: false,
      confidence: 1.0,
      reason: "Standard campaign payload",
    };
  }

  // Format multi-turn conversation memory
  let conversationContextSection = "";
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-6);
    conversationContextSection = `
Recent Conversation History (Rolling Thread):
${recent.map((m) => `${m.sender.toUpperCase()}: "${m.text}"`).join("\n")}
`;
  }

  // Retrieve relevant snippets
  const relevantDocs = retrieveRelevantContext(campaignContext, incomingMessage, 3);
  const escalationNotice =
    workspaceSettings.escalationNotice ||
    "I've forwarded your question to our team! A member will review this and message you directly here shortly.";

  const prompt = `
You are the AI Assistant for an Instagram creator/brand.
A user (@${senderName || "user"}) has sent the following question via DM or comment inquiry:
${conversationContextSection}
Current User Message: "${incomingMessage}"

Here is the official Knowledge Base & FAQ context for this post/campaign:
${relevantDocs || "No additional document context found."}

Primary campaign link (if relevant): ${trackedUrl || "None"}

Evaluate whether the knowledge context contains the answer to the user's specific question:
- Take into account the conversation history above to resolve references, follow-up questions, and pronouns like "that", "it", or "the higher plan".
- If the knowledge context clearly answers it: compose a friendly, accurate, and concise answer. Include the link if relevant.
- If the question asks for a human, asks about custom billing/refunds not covered in the doc, complains, or the answer is NOT in the knowledge base: set needsEscalation to true and use the escalation notice.
- If the user wrote in a language other than English, match their language.

Return ONLY valid JSON:
{
  "canAnswerAccurately": boolean,
  "needsEscalation": boolean,
  "confidence": number,
  "replyText": string,
  "reason": string
}
`;

  try {
    const result = await generateAICompletion({
      systemPrompt: "You are an autonomous Instagram DM copilot. Output JSON only.",
      userPrompt: prompt,
      jsonMode: true,
      temperature: 0.3,
      settings: workspaceSettings,
    });

    const parsed = JSON.parse(result.text);

    if (parsed.needsEscalation || !parsed.canAnswerAccurately || parsed.confidence < 0.6) {
      return {
        replyText: `${escalationNotice}`,
        needsEscalation: true,
        confidence: parsed.confidence || 0.4,
        reason: parsed.reason || "Unsure or user requested human attention",
      };
    }

    return {
      replyText: parsed.replyText || fallbackDmMessage,
      needsEscalation: false,
      confidence: parsed.confidence || 0.9,
      reason: parsed.reason || "Answered from RAG knowledge base",
    };
  } catch (err: unknown) {
    console.warn("[RAG] Exception answering query:", err);
    return {
      replyText: fallbackDmMessage,
      needsEscalation: false,
      confidence: 0.7,
      reason: "Fallback to campaign DM",
    };
  }
}
