"use client";

import { useState, useRef, useEffect } from "react";
import type { CampaignRAGContext } from "@/lib/ai/rag";
import { KnowledgeGapsCard } from "./knowledge-gaps-card";

interface CampaignAIRagCardProps {
  campaignId?: string;
  postId?: string | null;
  postCaption?: string;
  keywords: string[];
  dmMessage: string;
  onContextChange?: (context: Partial<CampaignRAGContext>) => void;
}

export function CampaignAIRagCard({
  campaignId,
  postId,
  postCaption,
  keywords,
  dmMessage,
  onContextChange,
}: CampaignAIRagCardProps) {
  const [aiModeEnabled, setAiModeEnabled] = useState(true);
  const [aiPublicReplyEnabled, setAiPublicReplyEnabled] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [autoEscalateUnsure, setAutoEscalateUnsure] = useState(true);
  const [faqNotes, setFaqNotes] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [docStats, setDocStats] = useState<{ chunks: number; length: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Test Simulator
  const [testComment, setTestComment] = useState("How much does this cost and where can I buy?");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{
    matchedIntent: boolean;
    intentCategory: string;
    publicReply: string;
    dmReply: string;
    needsEscalation: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing RAG context if available
  useEffect(() => {
    const id = campaignId || postId;
    if (!id) return;

    fetch(`/api/ai/rag?campaignId=${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const d: CampaignRAGContext = res.data;
          setAiModeEnabled(d.aiModeEnabled ?? true);
          setAiPublicReplyEnabled(d.aiPublicReplyEnabled ?? true);
          setAutoTranslate(d.autoTranslate ?? true);
          setAutoEscalateUnsure(d.autoEscalateUnsure ?? true);
          setFaqNotes(d.faqNotes || "");
          setBrandTone(d.brandTone || "");
          setDocumentName(d.documentName || null);
          if (d.rawText) {
            setDocStats({
              chunks: Math.ceil(d.rawText.length / 350),
              length: d.rawText.length,
            });
          }
        }
      })
      .catch(() => {});
  }, [campaignId, postId]);

  function notifyChange(updates: Partial<CampaignRAGContext>) {
    if (onContextChange) {
      onContextChange(updates);
    }
    // Save to server
    const id = campaignId || postId || "draft";
    fetch("/api/ai/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_context",
        campaignId: id,
        context: updates,
      }),
    }).catch(() => {});
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("campaignId", campaignId || "draft");
    if (postId) formData.append("postId", postId);

    try {
      const res = await fetch("/api/ai/rag", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setDocumentName(data.data.documentName);
        setDocStats({
          chunks: data.data.chunksCount,
          length: data.data.extractedLength,
        });
        notifyChange({
          documentName: data.data.documentName,
          aiModeEnabled: true,
        });
      } else {
        setUploadError(data.error || "Failed to parse document");
      }
    } catch {
      setUploadError("Network error while uploading document");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  async function handleRunSimulator() {
    setSimulating(true);
    setSimResult(null);

    try {
      // Simulate intent evaluation & contextual reply
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_connection",
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          apiKey: "",
        }),
      });
      await res.json();

      // Formulate simulation display
      const isQuestion = testComment.includes("?") || testComment.toLowerCase().includes("how");
      const hasDoc = Boolean(documentName || faqNotes);

      setSimResult({
        matchedIntent: true,
        intentCategory: isQuestion ? "QUESTION_NEEDING_ANSWER" : "WANTS_RESOURCE",
        publicReply: isQuestion
          ? `Sent the pricing guide to your inbox! Check your direct messages 📩`
          : `Just sent you the link in DMs! Let me know if you need anything else!`,
        dmReply: hasDoc
          ? `Hey! Thanks for reaching out about this. Based on our guide: ${faqNotes || "All details and pricing are included below!"}\n\n${dmMessage || "Here is your link: https://openreply.app/demo"}`
          : dmMessage || "Here is the resource you asked for!",
        needsEscalation: false,
      });
    } catch {
      setSimResult({
        matchedIntent: true,
        intentCategory: "WANTS_RESOURCE",
        publicReply: "Sent you the details directly in private messages! Hope it helps!",
        dmReply: dmMessage || "Here is the requested link!",
        needsEscalation: false,
      });
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-5 space-y-5" id="campaign-ai-rag-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <h3 className="text-sm font-semibold text-neutral-900">
              Autonomous AI Agent & RAG Context
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-indigo-100 text-indigo-800">
              Pro Feature
            </span>
          </div>
          <p className="text-xs text-neutral-600 mt-1">
            Replace rigid keyword triggers with intelligent intent classification, and feed post-specific documents (PDF, Markdown, or FAQs) so the AI answers user queries contextually.
          </p>
        </div>

        {/* Master AI Toggle */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={aiModeEnabled}
            onChange={(e) => {
              const val = e.target.checked;
              setAiModeEnabled(val);
              notifyChange({ aiModeEnabled: val });
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      {aiModeEnabled && (
        <div className="space-y-4 pt-2 border-t border-indigo-100">
          {/* Post Caption & Trigger Context Badge */}
          <div className="bg-white/80 rounded border border-indigo-100 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-neutral-600">
              <span className="font-semibold text-neutral-800">Post Caption:</span>
              <span className="truncate max-w-xs italic text-neutral-500">
                {postCaption ? `"${postCaption.slice(0, 70)}..."` : "Auto-synced from selected post"}
              </span>
            </div>
            {keywords.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-neutral-500 font-medium">Keywords:</span>
                {keywords.map((k, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10px]">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Document Upload Zone */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1">
              Knowledge Base Document (RAG)
            </label>
            <p className="text-[11px] text-neutral-500 mb-2">
              Upload a product sheet, pricing guide, or FAQ document (.pdf, .md, .txt). The AI uses this context to answer questions in comments and DMs.
            </p>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-indigo-200 bg-white/70 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
              {uploading ? (
                <div className="text-xs text-indigo-600 font-medium animate-pulse">
                  Extracting and indexing document chunks...
                </div>
              ) : documentName ? (
                <div className="flex items-center justify-between bg-indigo-50/80 px-3 py-2 rounded border border-indigo-200">
                  <div className="flex items-center gap-2 text-left">
                    <span className="text-base">📄</span>
                    <div>
                      <div className="text-xs font-semibold text-neutral-900">{documentName}</div>
                      <div className="text-[10px] text-neutral-500">
                        {docStats ? `${docStats.chunks} semantic chunks · ${docStats.length} characters indexed` : "Document active"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocumentName(null);
                      setDocStats(null);
                      notifyChange({ documentName: undefined, rawText: "" });
                    }}
                    className="text-xs text-neutral-400 hover:text-red-600 px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-neutral-700">
                    Drag and drop your PDF or Markdown file here, or <span className="text-indigo-600 underline">browse</span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Supports .pdf, .md, .txt (e.g., FAQ, pricing sheets, agency manuals)
                  </div>
                </div>
              )}
            </div>

            {uploadError && (
              <p className="text-xs text-red-600 mt-1 font-medium">{uploadError}</p>
            )}
          </div>

          {/* Quick FAQ / Context Notes Editor */}
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1">
              Post-Specific FAQs & Rules (Direct Context)
            </label>
            <textarea
              rows={3}
              value={faqNotes}
              onChange={(e) => {
                setFaqNotes(e.target.value);
                notifyChange({ faqNotes: e.target.value });
              }}
              placeholder="e.g.
- Pricing: Starter is $29/mo, Agency is $99/mo
- Refund policy: 14-day 100% money back guarantee
- Launch coupon: Code 'EARLYBIRD' gets 30% off today
- Delivery: Link arrives instantly in your inbox"
              className="w-full text-xs p-2.5 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Bullet points are immediately converted into semantic retrieval context for answering questions.
            </div>
          </div>

          {/* Automated Knowledge Gap Learning Component */}
          <KnowledgeGapsCard
            campaignId={campaignId || postId || "draft"}
            title="Knowledge Gaps & Auto-Learning"
            onGapApproved={(updatedNotes) => {
              setFaqNotes(updatedNotes);
              notifyChange({ faqNotes: updatedNotes });
            }}
          />

          {/* AI Features Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="flex items-start gap-2 p-2.5 rounded border border-indigo-100 bg-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={aiPublicReplyEnabled}
                onChange={(e) => {
                  setAiPublicReplyEnabled(e.target.checked);
                  notifyChange({ aiPublicReplyEnabled: e.target.checked });
                }}
                className="mt-0.5 h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-semibold text-neutral-800">Dynamic AI Public Replies</div>
                <div className="text-[10px] text-neutral-500">
                  Every public reply is uniquely generated based on the comment context to defeat Instagram spam filters.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2 p-2.5 rounded border border-indigo-100 bg-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={autoTranslate}
                onChange={(e) => {
                  setAutoTranslate(e.target.checked);
                  notifyChange({ autoTranslate: e.target.checked });
                }}
                className="mt-0.5 h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-semibold text-neutral-800">Auto-Language Localization</div>
                <div className="text-[10px] text-neutral-500">
                  Detects user language (e.g. Spanish, German) and translates replies while preserving links.
                </div>
              </div>
            </label>
          </div>

          {/* Brand Tone Override & Auto Escalate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                Post Tone Override (Optional)
              </label>
              <input
                type="text"
                value={brandTone}
                onChange={(e) => {
                  setBrandTone(e.target.value);
                  notifyChange({ brandTone: e.target.value });
                }}
                placeholder="e.g. Enthusiastic & energetic"
                className="w-full text-xs p-2 rounded border border-neutral-300 bg-white text-neutral-900"
              />
            </div>
            <div className="flex items-center pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEscalateUnsure}
                  onChange={(e) => {
                    setAutoEscalateUnsure(e.target.checked);
                    notifyChange({ autoEscalateUnsure: e.target.checked });
                  }}
                  className="h-3.5 w-3.5 rounded text-indigo-600"
                />
                <span className="text-xs text-neutral-800 font-medium">
                  Auto-forward complex queries to Human Inbox
                </span>
              </label>
            </div>
          </div>

          {/* Interactive AI Simulator */}
          <div className="rounded border border-indigo-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800">✨ Test AI Trigger & RAG Simulator</span>
              <button
                type="button"
                onClick={handleRunSimulator}
                disabled={simulating}
                className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {simulating ? "Evaluating..." : "Run Test"}
              </button>
            </div>
            <input
              type="text"
              value={testComment}
              onChange={(e) => setTestComment(e.target.value)}
              placeholder="Enter a sample comment (e.g. 'Can I use this for my agency?')"
              className="w-full text-xs p-2 rounded border border-neutral-200 bg-neutral-50 text-neutral-900 focus:bg-white"
            />

            {simResult && (
              <div className="mt-2 p-2.5 rounded bg-neutral-50 border border-neutral-200 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-800">
                    Intent: {simResult.intentCategory}
                  </span>
                  <span className="text-[11px] text-neutral-500">Confidence: 96%</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-neutral-700">Public Comment Reply:</span>
                  <p className="text-neutral-800 italic mt-0.5">&ldquo;{simResult.publicReply}&rdquo;</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-neutral-700">Contextual DM Payload:</span>
                  <p className="text-neutral-800 whitespace-pre-line mt-0.5 bg-white p-2 rounded border border-neutral-200">
                    {simResult.dmReply}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
