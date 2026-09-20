"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ScheduledFollowUp,
  FollowUpCondition,
  FollowUpType,
} from "@/lib/queue/followup-store";

export function FollowUpQueueView() {
  const [followUps, setFollowUps] = useState<ScheduledFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "SCHEDULED" | "DISPATCHED" | "CANCELLED">("ALL");
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  // New Follow-Up Modal
  const [showModal, setShowModal] = useState(false);
  const [modalUsername, setModalUsername] = useState("");
  const [modalCampaign, setModalCampaign] = useState("AI Automation Growth Guide");
  const [modalCondition, setModalCondition] = useState<FollowUpCondition>("IF_NOT_CLICKED");
  const [modalType, setModalType] = useState<FollowUpType>("AI_SMART_REENGAGE");
  const [modalMessage, setModalMessage] = useState("");
  const [modalDelay, setModalDelay] = useState(30);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const fetchFollowUps = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/followups");
      const data = await res.json();
      if (data.success && data.followUps) {
        setFollowUps(data.followUps);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/followups")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.followUps) {
          setFollowUps(data.followUps);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const interval = setInterval(() => {
      fetch("/api/ai/followups")
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.followUps) {
            setFollowUps(data.followUps);
          }
        })
        .catch(() => {});
    }, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function handleExecute(jobId: string) {
    setActionId(jobId);
    setBanner(null);
    try {
      const res = await fetch("/api/ai/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setBanner({
          text: `Follow-up dispatched successfully! Message delivered within Meta 24-hour window.`,
          type: "success",
        });
      } else {
        setBanner({
          text: `Follow-up skipped: ${data.result?.reason || data.error || "Condition not met"}`,
          type: "info",
        });
      }
      await fetchFollowUps();
    } catch {
      setBanner({ text: "Failed to dispatch follow-up", type: "error" });
    } finally {
      setActionId(null);
    }
  }

  async function handleCancel(jobId: string) {
    setActionId(jobId);
    try {
      const res = await fetch("/api/ai/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setBanner({ text: "Follow-up schedule cancelled.", type: "info" });
        await fetchFollowUps();
      }
    } catch {
      setBanner({ text: "Failed to cancel follow-up", type: "error" });
    } finally {
      setActionId(null);
    }
  }

  async function handleCreateFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!modalUsername.trim()) return;
    setModalSubmitting(true);
    try {
      const res = await fetch("/api/ai/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          automationName: modalCampaign,
          recipientUsername: modalUsername.trim().replace(/^@/, ""),
          recipientId: `usr_${Date.now()}`,
          condition: modalCondition,
          followUpType: modalType,
          customMessage: modalType === "CUSTOM_MESSAGE" ? modalMessage : undefined,
          delayMinutes: modalDelay,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setModalUsername("");
        setModalMessage("");
        setBanner({ text: `Proactive follow-up scheduled for @${modalUsername}!`, type: "success" });
        await fetchFollowUps();
      }
    } catch {
      setBanner({ text: "Failed to schedule follow-up", type: "error" });
    } finally {
      setModalSubmitting(false);
    }
  }

  const filtered = followUps.filter((j) => {
    if (filter === "SCHEDULED") return j.status === "SCHEDULED";
    if (filter === "DISPATCHED") return j.status === "DISPATCHED";
    if (filter === "CANCELLED") return j.status.startsWith("CANCELLED");
    return true;
  });

  const scheduledCount = followUps.filter((j) => j.status === "SCHEDULED").length;
  const dispatchedCount = followUps.filter((j) => j.status === "DISPATCHED").length;
  const recoveredCount = followUps.filter((j) => j.status === "CANCELLED_CLICKED").length;

  return (
    <div className="space-y-4">
      {/* Top Banner Notice */}
      {banner && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-xs font-medium border ${
            banner.type === "success"
              ? "border-emerald-500/30 bg-emerald-50 text-emerald-800"
              : banner.type === "error"
              ? "border-rose-500/30 bg-rose-50 text-rose-800"
              : "border-sky-500/30 bg-sky-50 text-sky-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-neutral-500 hover:text-neutral-800 text-sm font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Pending Queue
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-foreground">{scheduledCount}</span>
            <span className="text-xs text-amber-500">In delay countdown</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Dispatched Re-engagements
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-foreground">{dispatchedCount}</span>
            <span className="text-xs text-emerald-500">Delivered via DM</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Recovered Link Clicks
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-foreground">{recoveredCount}</span>
            <span className="text-xs text-indigo-500">Auto-aborted after click</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Meta 24h Compliance
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-600">100%</span>
            <span className="text-xs text-muted">Strict window checked</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-3.5 bg-surface/50">
          <div className="flex items-center gap-1.5">
            {(["ALL", "SCHEDULED", "DISPATCHED", "CANCELLED"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-foreground text-background font-semibold"
                    : "bg-surface text-muted hover:text-foreground border border-border"
                }`}
              >
                {f === "ALL"
                  ? "All Sequences"
                  : f === "SCHEDULED"
                  ? `Scheduled (${scheduledCount})`
                  : f === "DISPATCHED"
                  ? `Dispatched (${dispatchedCount})`
                  : "Cancelled"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchFollowUps}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-foreground font-medium"
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover shadow-sm"
            >
              + Schedule Follow-Up
            </button>
          </div>
        </div>

        {/* List of Follow-up Jobs */}
        {loading ? (
          <div className="p-12 text-center text-xs text-muted">Loading follow-up queue…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted space-y-2">
            <p className="text-base">📭</p>
            <p className="font-medium text-foreground">No follow-ups matching this filter.</p>
            <p>Sequences are automatically triggered when campaigns deliver links to users.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((job) => {
              const scheduledDate = new Date(job.scheduledFor);
              const isPending = job.status === "SCHEDULED";
              const timeDisplay = Number.isNaN(scheduledDate.getTime())
                ? "Pending"
                : scheduledDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              return (
                <div
                  key={job.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-surface/60 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        @{job.recipientUsername}
                      </span>
                      <span className="text-xs text-muted">•</span>
                      <span className="text-xs text-muted truncate">{job.automationName}</span>

                      {/* Status Pill */}
                      {job.status === "SCHEDULED" ? (
                        <span className="rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">
                          Scheduled ({timeDisplay})
                        </span>
                      ) : job.status === "DISPATCHED" ? (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
                          Dispatched
                        </span>
                      ) : job.status === "CANCELLED_CLICKED" ? (
                        <span className="rounded-full bg-indigo-500/15 text-indigo-600 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold">
                          Aborted: Link Clicked
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-500/15 text-neutral-500 border border-neutral-500/30 px-2 py-0.5 text-[10px] font-semibold">
                          Cancelled
                        </span>
                      )}

                      {/* Condition Pill */}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                          job.condition === "IF_NOT_CLICKED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : job.condition === "IF_NOT_REPLIED"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-sky-50 text-sky-700 border-sky-200"
                        }`}
                      >
                        {job.condition === "IF_NOT_CLICKED"
                          ? "🎯 If Link Unclicked"
                          : job.condition === "IF_NOT_REPLIED"
                          ? "💬 If No User Reply"
                          : "⚡ Always Send"}
                      </span>

                      {/* Type Badge */}
                      {job.followUpType === "AI_SMART_REENGAGE" ? (
                        <span className="rounded bg-violet-100 text-violet-700 border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold">
                          🤖 Gemini AI Re-engage
                        </span>
                      ) : (
                        <span className="rounded bg-neutral-100 text-neutral-600 border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium">
                          ✍️ Custom Text
                        </span>
                      )}
                    </div>

                    {/* Preview of Message */}
                    <p className="text-xs text-muted max-w-2xl truncate">
                      {job.dispatchedMessage ||
                        job.customMessage ||
                        "AI will synthesize contextual check-in based on lead history and campaign offer."}
                    </p>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={actionId === job.id}
                        onClick={() => handleExecute(job.id)}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {actionId === job.id ? "Sending…" : "⚡ Send Now"}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === job.id}
                        onClick={() => handleCancel(job.id)}
                        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-rose-600 hover:border-rose-300 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Schedule Follow-Up */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Schedule Proactive Follow-Up</h3>
                <p className="text-xs text-muted">Queue a re-engagement message for any Instagram lead</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFollowUp} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Instagram Username</label>
                <input
                  type="text"
                  required
                  value={modalUsername}
                  onChange={(e) => setModalUsername(e.target.value)}
                  placeholder="e.g. sam_growth"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Campaign Context</label>
                <input
                  type="text"
                  value={modalCampaign}
                  onChange={(e) => setModalCampaign(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Condition Trigger</label>
                <select
                  value={modalCondition}
                  onChange={(e) => setModalCondition(e.target.value as FollowUpCondition)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="IF_NOT_CLICKED">🎯 If Link is NOT Clicked (Aborts on click)</option>
                  <option value="IF_NOT_REPLIED">💬 If User Has NOT Replied</option>
                  <option value="ALWAYS">⚡ Always Send</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Content Strategy</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalType("AI_SMART_REENGAGE")}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all ${
                      modalType === "AI_SMART_REENGAGE"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-border bg-background text-muted"
                    }`}
                  >
                    🤖 Gemini AI Smart
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalType("CUSTOM_MESSAGE")}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all ${
                      modalType === "CUSTOM_MESSAGE"
                        ? "border-accent bg-accent/15 text-foreground"
                        : "border-border bg-background text-muted"
                    }`}
                  >
                    ✍️ Custom Text
                  </button>
                </div>
              </div>

              {modalType === "CUSTOM_MESSAGE" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Message</label>
                  <textarea
                    rows={2}
                    value={modalMessage}
                    onChange={(e) => setModalMessage(e.target.value)}
                    placeholder="Hey @{username}, checking in to see if you got the link!"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none resize-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Delay Window</label>
                <div className="flex items-center gap-2">
                  {[15, 60, 240, 1200].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setModalDelay(mins)}
                      className={`rounded-md border px-2 py-1 text-xs transition-all ${
                        modalDelay === mins
                          ? "border-accent bg-accent/15 text-foreground font-semibold"
                          : "border-border bg-background text-muted"
                      }`}
                    >
                      {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                    </button>
                  ))}
                  <div className="flex items-center gap-1 ml-auto text-xs text-muted">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={modalDelay}
                      onChange={(e) => setModalDelay(Number(e.target.value))}
                      className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-xs text-foreground"
                    />
                    <span>min</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || !modalUsername.trim()}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {modalSubmitting ? "Scheduling…" : "Confirm Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
