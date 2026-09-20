"use client";

import { useState, useEffect, useCallback } from "react";
import type { KnowledgeGap } from "@/lib/ai/knowledge-gaps";

interface KnowledgeGapsCardProps {
  campaignId?: string;
  onGapApproved?: (updatedFaqNotes: string) => void;
  title?: string;
  compact?: boolean;
}

export function KnowledgeGapsCard({
  campaignId,
  onGapApproved,
  title = "Automated Knowledge Gap Learning",
  compact = false,
}: KnowledgeGapsCardProps) {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [stats, setStats] = useState<{
    totalGaps: number;
    pendingReview: number;
    approvedCount: number;
    coverageScore: number;
    totalInquiriesImpacted: number;
  }>({
    totalGaps: 0,
    pendingReview: 0,
    approvedCount: 0,
    coverageScore: 85,
    totalInquiriesImpacted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionGapId, setActionGapId] = useState<string | null>(null);
  const [editingGapId, setEditingGapId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"PENDING" | "APPROVED">("PENDING");

  const fetchGaps = useCallback(async () => {
    try {
      const url = campaignId
        ? `/api/ai/knowledge-gaps?campaignId=${campaignId}`
        : "/api/ai/knowledge-gaps";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setGaps(json.data.gaps || []);
        if (json.data.stats) setStats(json.data.stats);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGaps();
  }, [fetchGaps]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/knowledge-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setGaps(json.data.gaps || []);
        if (json.data.stats) setStats(json.data.stats);
        const count = json.data.newGapsCount || 0;
        setSuccessToast(
          count > 0
            ? `Discovered ${count} new knowledge gap${count > 1 ? "s" : ""} from recent inquiries!`
            : "Clustering complete: Current inquiries are up-to-date with existing topics."
        );
        setTimeout(() => setSuccessToast(null), 4500);
      }
    } catch {
      // Fallback
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleApprove(gap: KnowledgeGap, isCustom = false) {
    setActionGapId(gap.id);
    try {
      const payload: {
        action: string;
        gapId: string;
        targetCampaignId?: string;
        customQuestion?: string;
        customAnswer?: string;
      } = {
        action: "approve",
        gapId: gap.id,
        targetCampaignId: campaignId,
      };

      if (isCustom) {
        payload.customQuestion = editQuestion;
        payload.customAnswer = editAnswer;
      }

      const res = await fetch("/api/ai/knowledge-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setGaps((prev) =>
          prev.map((g) =>
            g.id === gap.id
              ? {
                  ...g,
                  status: "APPROVED",
                  suggestedQuestion: payload.customQuestion || g.suggestedQuestion,
                  suggestedAnswer: payload.customAnswer || g.suggestedAnswer,
                }
              : g
          )
        );
        if (json.data?.stats) setStats(json.data.stats);
        if (json.data?.updatedFaqNotes && onGapApproved) {
          onGapApproved(json.data.updatedFaqNotes);
        }
        setEditingGapId(null);
        setSuccessToast(`✓ "${gap.topic}" approved & added to knowledge base!`);
        setTimeout(() => setSuccessToast(null), 4000);
      }
    } catch {
      // Fallback
    } finally {
      setActionGapId(null);
    }
  }

  async function handleDismiss(gapId: string) {
    setActionGapId(gapId);
    try {
      const res = await fetch("/api/ai/knowledge-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", gapId }),
      });
      const json = await res.json();
      if (json.success) {
        setGaps((prev) => prev.filter((g) => g.id !== gapId));
        if (json.data?.stats) setStats(json.data.stats);
      }
    } catch {
      // Fallback
    } finally {
      setActionGapId(null);
    }
  }

  async function handleBatchApprove() {
    setActionGapId("batch");
    try {
      const res = await fetch("/api/ai/knowledge-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_approve",
          targetCampaignId: campaignId,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setGaps(json.data.gaps || []);
        if (json.data.stats) setStats(json.data.stats);
        setSuccessToast(`✓ Successfully approved ${json.data.approvedCount} knowledge gaps!`);
        setTimeout(() => setSuccessToast(null), 4000);
      }
    } catch {
      // Fallback
    } finally {
      setActionGapId(null);
    }
  }

  const pendingGaps = gaps.filter((g) => g.status === "DETECTED");
  const approvedGaps = gaps.filter((g) => g.status === "APPROVED");
  const displayedGaps = activeTab === "PENDING" ? pendingGaps : approvedGaps;

  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white shadow-xs ${
        compact ? "p-3 space-y-3" : "p-5 space-y-4"
      }`}
      id="knowledge-gaps-card"
    >
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base">🎓</span>
            <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
            {pendingGaps.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900">
                {pendingGaps.length} New Gap{pendingGaps.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            Automatically clusters recurring unanswerable questions from human escalations and synthesizes verified Q&amp;A pairs to expand your knowledge base.
          </p>
        </div>

        {/* Scan & Batch Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span>{analyzing ? "⚡" : "✨"}</span>
            <span>{analyzing ? "Clustering..." : "Scan Inquiries"}</span>
          </button>

          {pendingGaps.length > 1 && (
            <button
              type="button"
              onClick={handleBatchApprove}
              disabled={actionGapId === "batch"}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {actionGapId === "batch" ? "Approving..." : "Approve All Gaps"}
            </button>
          )}
        </div>
      </div>

      {/* Coverage & Velocity Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-md bg-neutral-50 border border-neutral-200/80 text-xs">
        <div>
          <div className="text-[10px] uppercase font-semibold text-neutral-400">
            Knowledge Coverage
          </div>
          <div className="text-sm font-bold text-indigo-700 mt-0.5">
            {stats.coverageScore}%
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-semibold text-neutral-400">
            Pending Gaps
          </div>
          <div className="text-sm font-bold text-amber-700 mt-0.5">
            {stats.pendingReview} topics
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-semibold text-neutral-400">
            Auto-Learned Q&amp;As
          </div>
          <div className="text-sm font-bold text-emerald-700 mt-0.5">
            {stats.approvedCount} pairs
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase font-semibold text-neutral-400">
            Impacted Leads
          </div>
          <div className="text-sm font-bold text-neutral-800 mt-0.5">
            {stats.totalInquiriesImpacted} inquiries
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-fadeIn">
          <span>{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Filter */}
      <div className="flex gap-2 border-b border-neutral-100 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("PENDING")}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            activeTab === "PENDING"
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Discovered Gaps ({pendingGaps.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("APPROVED")}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            activeTab === "APPROVED"
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Learned Knowledge ({approvedGaps.length})
        </button>
      </div>

      {/* Gaps List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-xs text-neutral-400">
            Scanning inquiries &amp; knowledge gaps...
          </div>
        ) : displayedGaps.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500 space-y-1 bg-neutral-50/50 rounded-lg border border-dashed border-neutral-200 p-6">
            <div className="text-xl">✨</div>
            <div className="font-semibold text-neutral-800">
              {activeTab === "PENDING"
                ? "No Unresolved Knowledge Gaps"
                : "No Auto-Learned Q&As Yet"}
            </div>
            <p className="max-w-md mx-auto text-neutral-500">
              {activeTab === "PENDING"
                ? "Your RAG knowledge base answers current customer inquiries without gaps. Click 'Scan Inquiries' anytime to re-cluster newly escalated messages."
                : "Approve detected gaps above to automatically integrate Q&A pairs into your campaign."}
            </p>
          </div>
        ) : (
          displayedGaps.map((gap) => {
            const isEditing = editingGapId === gap.id;
            const isActing = actionGapId === gap.id;

            return (
              <div
                key={gap.id}
                className={`p-4 rounded-lg border transition-all space-y-3 ${
                  gap.status === "APPROVED"
                    ? "border-emerald-200 bg-emerald-50/20"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                {/* Topic Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900">{gap.topic}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        gap.category === "ENTERPRISE"
                          ? "bg-purple-100 text-purple-800"
                          : gap.category === "INTEGRATION"
                          ? "bg-blue-100 text-blue-800"
                          : gap.category === "PRICING"
                          ? "bg-emerald-100 text-emerald-800"
                          : gap.category === "REFUND_POLICY"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-neutral-100 text-neutral-800"
                      }`}
                    >
                      {gap.category}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-medium">
                      Asked {gap.frequency}x
                    </span>
                  </div>

                  {gap.status === "APPROVED" ? (
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <span>✓ Active in Knowledge Base</span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingGapId(null);
                          } else {
                            setEditingGapId(gap.id);
                            setEditQuestion(gap.suggestedQuestion);
                            setEditAnswer(gap.suggestedAnswer);
                          }
                        }}
                        className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1 rounded border border-neutral-200 bg-white font-medium cursor-pointer"
                      >
                        {isEditing ? "Cancel" : "Edit Draft"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(gap.id)}
                        disabled={isActing}
                        className="text-xs text-neutral-400 hover:text-red-600 px-2 py-1 font-medium cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(gap, isEditing)}
                        disabled={isActing}
                        className="text-xs font-semibold px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isActing ? "Adding..." : "✓ Approve & Learn"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Sample Lead Inquiries */}
                {gap.sampleQuestions.length > 0 && (
                  <div className="bg-neutral-50 p-2.5 rounded-md border border-neutral-200/70 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span className="font-semibold">Recent Customer Inquiries:</span>
                      {gap.impactedUsers.length > 0 && (
                        <span>
                          Users: {gap.impactedUsers.map((u) => `@${u}`).join(", ")}
                        </span>
                      )}
                    </div>
                    <ul className="list-disc list-inside text-neutral-700 space-y-0.5 italic">
                      {gap.sampleQuestions.slice(0, 3).map((sq, i) => (
                        <li key={i} className="truncate">
                          &ldquo;{sq}&rdquo;
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Q&A Pair Preview / Edit Mode */}
                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-0.5">
                        FAQ Question:
                      </label>
                      <input
                        type="text"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        className="w-full text-xs p-2 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-0.5">
                        Brand Answer (Context for AI):
                      </label>
                      <textarea
                        rows={3}
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        className="w-full text-xs p-2 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingGapId(null)}
                        className="px-2.5 py-1 text-xs text-neutral-600 hover:text-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(gap, true)}
                        className="px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Save &amp; Add to Knowledge Base
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-indigo-100 bg-indigo-50/30 p-3 rounded-md text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 text-neutral-900 font-semibold">
                      <span className="text-indigo-600">Q:</span>
                      <span>{gap.suggestedQuestion}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-neutral-700">
                      <span className="text-indigo-600 font-semibold shrink-0">A:</span>
                      <p className="text-neutral-800 leading-relaxed">{gap.suggestedAnswer}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
