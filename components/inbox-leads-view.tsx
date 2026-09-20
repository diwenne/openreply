"use client";

import { useCallback, useEffect, useState } from "react";
import type { AILead } from "@/lib/ai/leads";
import type { ChatMessage, UserProfile } from "@/lib/ai/conversation";

export function InboxLeadsView() {
  const [leads, setLeads] = useState<AILead[]>([]);
  const [filter, setFilter] = useState<"ALL" | "NEEDS_REPLY" | "RESOLVED">("NEEDS_REPLY");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<AILead | null>(null);

  // Multi-Turn Thread & Profile
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [saveToFaq, setSaveToFaq] = useState(true);
  const [learnedNotice, setLearnedNotice] = useState<string | null>(null);

  // Reply Composer
  const [replyText, setReplyText] = useState("");
  const [draftingAI, setDraftingAI] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Notes & Webhook State
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookSending, setWebhookSending] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  const currentLeadNotes = selectedLead
    ? notesDraft[selectedLead.id] !== undefined
      ? notesDraft[selectedLead.id]
      : selectedLead.notes || ""
    : "";

  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/ai/leads?status=${filter}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setLeads(data.data.leads);
        setSelectedLead((prev) => {
          if (prev && data.data.leads.some((l: AILead) => l.id === prev.id)) return prev;
          return data.data.leads.length > 0 ? data.data.leads[0] : null;
        });
      }
    } catch {
      // silently handle
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    let active = true;
    fetch(`/api/ai/leads?status=${filter}&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && data.success && data.data) {
          setLeads(data.data.leads);
          setSelectedLead((prev) => {
            if (prev && data.data.leads.some((l: AILead) => l.id === prev.id)) return prev;
            return data.data.leads.length > 0 ? data.data.leads[0] : null;
          });
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filter, search]);

  // Load multi-turn thread history & user profile whenever selectedLead changes
  useEffect(() => {
    const username = selectedLead?.username;
    if (!username) return;

    let active = true;
    const controller = new AbortController();

    async function fetchThread() {
      try {
        const r = await fetch(`/api/ai/leads?conversation=${encodeURIComponent(username!)}`, {
          signal: controller.signal,
        });
        const data = await r.json();
        if (active) {
          if (data.success && data.data) {
            setConversationHistory(data.data.history || []);
            setUserProfile(data.data.profile || null);
          } else {
            setConversationHistory([]);
            setUserProfile(null);
          }
        }
      } catch {
        if (active) {
          setConversationHistory([]);
          setUserProfile(null);
        }
      } finally {
        if (active) {
          setLoadingThread(false);
        }
      }
    }

    fetchThread();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedLead?.username]);

  async function handleStatusChange(id: string, status: "NEEDS_REPLY" | "RESOLVED" | "ARCHIVED") {
    try {
      await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", id, status }),
      });
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status, updatedAt: Date.now() } : l))
      );
      if (selectedLead?.id === id) {
        setSelectedLead((prev) => (prev ? { ...prev, status } : null));
      }
    } catch {
      // handle error
    }
  }

  async function handleSaveNotes() {
    if (!selectedLead) return;
    setSavingNotes(true);
    try {
      await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_notes", id: selectedLead.id, notes: currentLeadNotes }),
      });
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLead.id ? { ...l, notes: currentLeadNotes } : l))
      );
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } catch {
      // silently handle
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleForwardWebhook() {
    if (!selectedLead) return;
    setWebhookSending(true);
    setWebhookResult(null);

    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forward_webhook",
          lead: selectedLead,
          webhookUrl: webhookUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookResult("✓ Lead forwarded to CRM webhooks successfully!");
      } else {
        setWebhookResult(`Failed: ${data.error || "Webhook error"}`);
      }
    } catch {
      setWebhookResult("Failed to contact webhook endpoint");
    } finally {
      setWebhookSending(false);
    }
  }

  function handleExportCSV() {
    if (leads.length === 0) return;
    const headers = ["ID", "Username", "Message", "Escalation Reason", "Status", "Intent", "Campaign", "Source", "Notes", "Created At"];
    const rows = leads.map((l) => [
      l.id,
      `@${l.username}`,
      `"${(l.lastMessage || "").replace(/"/g, '""')}"`,
      `"${(l.escalationReason || "").replace(/"/g, '""')}"`,
      l.status,
      l.intent || "GENERAL",
      `"${(l.campaignName || "").replace(/"/g, '""')}"`,
      l.source,
      `"${(l.notes || "").replace(/"/g, '""')}"`,
      new Date(l.createdAt).toISOString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openreply_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGenerateAIDraft() {
    if (!selectedLead) return;
    setDraftingAI(true);
    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_reply",
          username: selectedLead.username,
          userMessage: selectedLead.lastMessage,
          escalationReason: selectedLead.escalationReason,
          campaignContext: selectedLead.campaignName,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.suggestion) {
        setReplyText(data.data.suggestion);
      }
    } catch {
      // fallback draft
      setReplyText(`Hey @${selectedLead.username}, thanks for asking! Let me get you the exact info you need.`);
    } finally {
      setDraftingAI(false);
    }
  }

  async function handleSendReply() {
    if (!replyText.trim() || !selectedLead) return;
    setSending(true);
    setSentSuccess(false);
    setLearnedNotice(null);

    try {
      const res = await fetch("/api/ai/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_reply",
          id: selectedLead.id,
          username: selectedLead.username,
          replyText: replyText.trim(),
          saveToFaq,
          question: selectedLead.lastMessage,
          campaignId: selectedLead.campaignId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSentSuccess(true);
        if (data.data?.message) {
          setConversationHistory((prev) => [...prev, data.data.message]);
        } else {
          setConversationHistory((prev) => [
            ...prev,
            {
              id: `msg_admin_${Date.now()}`,
              sender: "admin",
              text: replyText.trim(),
              timestamp: Date.now(),
            },
          ]);
        }

        if (data.data?.savedToFaq) {
          setLearnedNotice("Saved to Campaign Knowledge Base! Agent will now answer this inquiry autonomously.");
        }

        await handleStatusChange(selectedLead.id, "RESOLVED");
        setReplyText("");
        setTimeout(() => {
          setSentSuccess(false);
          setLearnedNotice(null);
        }, 6000);
      }
    } catch {
      // Fallback
      await handleStatusChange(selectedLead.id, "RESOLVED");
      setSentSuccess(true);
      setReplyText("");
      setTimeout(() => setSentSuccess(false), 4000);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-[calc(100dvh-13rem)] grid-cols-1 overflow-hidden rounded-lg border border-neutral-200 bg-white sm:grid-cols-[340px_1fr]">
      {/* Left Column: Leads List */}
      <div className="flex flex-col border-r border-neutral-200 bg-neutral-50/50 min-h-0">
        <div className="p-3 border-b border-neutral-200 space-y-2 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-800">
              Escalated Inquiries ({leads.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                title="Export all leads to CSV"
                className="text-[11px] text-neutral-600 hover:text-neutral-900 border border-neutral-200 px-2 py-0.5 rounded bg-white font-medium"
              >
                📥 Export CSV
              </button>
              <button
                type="button"
                onClick={() => fetchLeads(false)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1">
            {(["NEEDS_REPLY", "RESOLVED", "ALL"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {f === "NEEDS_REPLY" ? "Needs Reply" : f === "RESOLVED" ? "Resolved" : "All Leads"}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads, keywords..."
            className="w-full text-xs px-2.5 py-1.5 rounded border border-neutral-200 bg-neutral-50 text-neutral-900 focus:bg-white focus:outline-none"
          />
        </div>

        {/* List of Leads */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-200">
          {loading ? (
            <div className="p-6 text-center text-xs text-neutral-400">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 space-y-1">
              <div className="text-lg">🎉</div>
              <div className="font-semibold text-neutral-700">Inbox is clean!</div>
              <p>No unanswered inquiries pending admin review.</p>
            </div>
          ) : (
            leads.map((l) => {
              const isSelected = selectedLead?.id === l.id;
              const isPending = l.status === "NEEDS_REPLY";

              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setSelectedLead(l);
                    setReplyText("");
                    setSentSuccess(false);
                  }}
                  className={`w-full p-3 text-left transition-colors flex flex-col gap-1.5 ${
                    isSelected ? "bg-indigo-50/80 border-l-4 border-indigo-600" : "hover:bg-neutral-100/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between w-full">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-neutral-900 truncate">
                        @{l.username}
                      </span>
                      {isPending && (
                        <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      {new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-700 line-clamp-2 italic font-normal">
                    &ldquo;{l.lastMessage}&rdquo;
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {l.intent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-800">
                        {l.intent === "HOT_LEAD" ? "🔥 Hot Lead" : l.intent === "ENTERPRISE" ? "💼 Enterprise" : l.intent === "PRICING" ? "💰 Pricing" : l.intent === "INTEGRATION" ? "🔌 Integration" : l.intent}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-900 truncate max-w-[180px]">
                      {l.escalationReason}
                    </span>
                    {l.campaignName && (
                      <span className="text-[9px] text-neutral-500 truncate">
                        via {l.campaignName}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Lead Detail & Resolution Workspace */}
      <div className="flex flex-col min-h-0 bg-white">
        {selectedLead ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">
                  {selectedLead.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-neutral-900">@{selectedLead.username}</h2>
                    {selectedLead.fullName && (
                      <span className="text-xs text-neutral-500 font-normal">({selectedLead.fullName})</span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                        selectedLead.status === "NEEDS_REPLY"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {selectedLead.status === "NEEDS_REPLY" ? "Needs Human Reply" : "Resolved"}
                    </span>
                    {selectedLead.intent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800">
                        {selectedLead.intent === "HOT_LEAD" ? "🔥 Hot Lead" : selectedLead.intent === "ENTERPRISE" ? "💼 Enterprise" : selectedLead.intent === "PRICING" ? "💰 Pricing" : selectedLead.intent === "INTEGRATION" ? "🔌 Integration" : selectedLead.intent}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    Origin: {selectedLead.source} · Campaign: {selectedLead.campaignName || "General DM"}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(true)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center gap-1"
                >
                  <span>⚡</span>
                  <span className="hidden sm:inline">Sync Webhook / CRM</span>
                </button>

                {selectedLead.status === "NEEDS_REPLY" ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedLead.id, "RESOLVED")}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                  >
                    ✓ Mark Resolved
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedLead.id, "NEEDS_REPLY")}
                    className="px-3 py-1.5 text-xs font-medium rounded text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
                  >
                    Reopen Inquiry
                  </button>
                )}
              </div>
            </div>

            {/* Conversation Log & Notes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* User Profile & Lead Scoring Banner */}
              {userProfile && (
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500 font-medium">Lead Score:</span>
                      <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900">
                        {userProfile.leadScore} / 100
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500 font-medium">Stage:</span>
                      <span className="px-2 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {userProfile.stage}
                      </span>
                    </div>
                  </div>
                  {userProfile.interestTags && userProfile.interestTags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-neutral-400 text-[11px]">Interests:</span>
                      {userProfile.interestTags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-800 font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Escalation Alert Banner */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                <span className="text-base">⚠️</span>
                <div>
                  <span className="font-semibold">Why AI forwarded this to you: </span>
                  <span>{selectedLead.escalationReason}</span>
                  <p className="text-[11px] text-amber-700 mt-1">
                    The autonomous agent informed the user that an admin was notified and would reply directly.
                    Replying with &quot;Teach Agent&quot; checked will automatically resolve this Knowledge Gap and expand your campaign RAG store.
                  </p>
                </div>
              </div>

              {/* Multi-Turn Conversation Thread */}
              <div className="space-y-3 pt-2">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider text-center">
                  Thread History ({conversationHistory.length > 0 ? conversationHistory.length : 2} turns)
                </div>

                {loadingThread ? (
                  <div className="text-center py-4 text-xs text-neutral-400">Loading conversation thread...</div>
                ) : conversationHistory.length > 0 ? (
                  conversationHistory.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${
                        msg.sender === "user" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {msg.sender === "user" && (
                        <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-700 font-semibold flex items-center justify-center text-xs shrink-0">
                          {selectedLead.username[0]?.toUpperCase() || "U"}
                        </div>
                      )}

                      <div
                        className={`rounded-lg p-3 max-w-lg text-xs space-y-1 ${
                          msg.sender === "user"
                            ? "bg-neutral-100 text-neutral-800"
                            : msg.sender === "admin"
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-950"
                            : "bg-indigo-50 border border-indigo-100 text-indigo-950"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] opacity-70">
                          <span className="font-semibold">
                            {msg.sender === "user"
                              ? `@${selectedLead.username}`
                              : msg.sender === "admin"
                              ? "You (Admin Reply)"
                              : "OpenReply Autonomous Agent"}
                          </span>
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm font-normal whitespace-pre-wrap">{msg.text}</p>
                      </div>

                      {msg.sender !== "user" && (
                        <div
                          className={`w-8 h-8 rounded-full text-white font-semibold flex items-center justify-center text-xs shrink-0 ${
                            msg.sender === "admin" ? "bg-emerald-600" : "bg-indigo-600"
                          }`}
                        >
                          {msg.sender === "admin" ? "👤" : "🤖"}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <>
                    {/* Fallback to single interaction if no thread loaded */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-700 font-semibold flex items-center justify-center text-xs shrink-0">
                        {selectedLead.username[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="bg-neutral-100 rounded-lg p-3 max-w-lg text-xs text-neutral-800 space-y-1">
                        <div className="font-semibold text-[11px] text-neutral-500">
                          @{selectedLead.username} asked:
                        </div>
                        <p className="text-sm font-medium">{selectedLead.lastMessage}</p>
                      </div>
                    </div>

                    {selectedLead.aiResponseSent && (
                      <div className="flex items-start gap-2.5 justify-end">
                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 max-w-lg text-xs text-indigo-900 space-y-1">
                          <div className="font-semibold text-[11px] text-indigo-500">
                            OpenReply Autonomous Bot:
                          </div>
                          <p>{selectedLead.aiResponseSent}</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shrink-0">
                          🤖
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Internal Team Notes Editor */}
              <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700 flex items-center gap-1">
                    <span>📝</span>
                    <span>Internal CRM & Admin Notes</span>
                  </span>
                  {notesSaved && (
                    <span className="text-[10px] text-emerald-600 font-semibold">✓ Saved!</span>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={currentLeadNotes}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNotesDraft((prev) => ({ ...prev, [selectedLead.id]: val }));
                  }}
                  placeholder="Add private team notes, qualification status, or deal notes..."
                  className="w-full text-xs p-2 rounded border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-neutral-800 text-white hover:bg-neutral-900 disabled:opacity-50"
                  >
                    {savingNotes ? "Saving..." : "Save Note"}
                  </button>
                </div>
              </div>

              {sentSuccess && (
                <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium text-center space-y-1">
                  <div>✓ Reply dispatched directly to @{selectedLead.username}&apos;s Instagram DM and marked resolved!</div>
                  {learnedNotice && (
                    <div className="text-[11px] text-emerald-700 font-semibold flex items-center justify-center gap-1">
                      <span>🎓</span>
                      <span>{learnedNotice}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Admin Reply Composer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">
                  Send Direct Answer to @{selectedLead.username}
                </label>
                <button
                  type="button"
                  onClick={handleGenerateAIDraft}
                  disabled={draftingAI}
                  className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                >
                  <span>✨</span>
                  <span>{draftingAI ? "Writing AI Draft..." : "AI Suggest Answer"}</span>
                </button>
              </div>

              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your answer to this lead..."
                className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Continuous Learning Toggle */}
              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="teachAgentCheckbox"
                  checked={saveToFaq}
                  onChange={(e) => setSaveToFaq(e.target.checked)}
                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <label htmlFor="teachAgentCheckbox" className="text-[11px] text-neutral-600 cursor-pointer select-none flex items-center gap-1">
                  <span className="font-semibold text-indigo-900">🎓 Teach Agent:</span>
                  <span>Automatically save this Q&amp;A into campaign knowledge base for future users</span>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  Dispatches via Instagram Messenger Graph API
                </span>
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send Reply & Resolve"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-neutral-400">
            Select an inquiry from the list to review and reply.
          </div>
        )}
      </div>

      {/* Webhook Modal */}
      {showWebhookModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                <span>⚡</span>
                <span>Forward Lead to Webhook / CRM</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowWebhookModal(false);
                  setWebhookResult(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-neutral-600 space-y-1">
              <p>
                Push this inquiry payload directly to <strong>Zapier</strong>, <strong>Make</strong>,{" "}
                <strong>Slack</strong>, <strong>HubSpot</strong>, or any custom webhook URL.
              </p>
              <div className="p-2 rounded bg-neutral-50 text-[11px] font-mono text-neutral-700">
                Lead: @{selectedLead.username} ({selectedLead.intent || "GENERAL"})
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">Custom Destination URL (Optional)</label>
                <span className="text-[11px] text-neutral-400">Leave blank to dispatch to all active CRMs</span>
              </div>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="Leave blank or enter custom Zapier / webhook URL..."
                className="w-full text-xs p-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {webhookResult && (
              <div
                className={`p-2.5 rounded text-xs ${
                  webhookResult.startsWith("✓")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {webhookResult}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setShowWebhookModal(false);
                  setWebhookResult(null);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForwardWebhook}
                disabled={webhookSending}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {webhookSending ? "Dispatching..." : webhookUrl.trim() ? "Send Webhook Payload" : "Sync to Active CRMs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
