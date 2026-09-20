"use client";

import { useState } from "react";
import Link from "next/link";
import type { SimulationResult, SimulationStep } from "@/app/api/ai/simulate/route";

const PRESET_SCENARIOS = [
  {
    title: "Pricing Inquiry",
    desc: "Answers from document RAG knowledge base",
    eventType: "DM" as const,
    text: "How much does the Pro plan cost and does it support multiple Instagram accounts?",
  },
  {
    title: "Multi-Turn Follow-Up (Memory)",
    desc: "Resolves pronouns & remembers earlier questions in thread",
    eventType: "DM" as const,
    text: "Can you give me a discount on that if we pay annually?",
  },
  {
    title: "Human Escalation Request",
    desc: "Triggers admin forward notice & logs lead",
    eventType: "DM" as const,
    text: "Can someone from your support team call me? I have an enterprise migration question.",
  },
  {
    title: "Public Comment on Reel",
    desc: "Generates natural, non-robotic public reply",
    eventType: "COMMENT" as const,
    text: "Does this work for personal creator accounts too or only business accounts?",
  },
  {
    title: "Keyword DM Trigger",
    desc: "Recognizes high-intent keyword for delivery",
    eventType: "COMMENT" as const,
    text: "GUIDE please! 🙌",
  },
  {
    title: "Story Mention Trigger",
    desc: "Autonomous thank-you & link delivery when user tags your handle in their Story",
    eventType: "DM" as const,
    text: "mentioned you in their story: @my_company check out this awesome tool!",
  },
  {
    title: "Story Quick Reply",
    desc: "Instant DM response triggered when lead replies to an Instagram Story sticker",
    eventType: "DM" as const,
    text: "I want the scaling blueprint from your story! 🔥",
  },
  {
    title: "CRM Outbound Webhook & Contact Capture",
    desc: "Captures lead email & phone in DM and dispatches real-time payload to Zapier/GoHighLevel",
    eventType: "DM" as const,
    text: "Here is my work email: alex.rivera@venturegrowth.co and mobile +1 (555) 234-8901. Please sync my agency to the enterprise trial.",
  },
  {
    title: "Knowledge Gap: Unanswered Inquiry",
    desc: "Demonstrates gap detection and escalation when query isn't in document",
    eventType: "DM" as const,
    text: "Do you offer a money back guarantee or 14-day trial if our team tests it out?",
  },
  {
    title: "Crypto / Spam Prevention",
    desc: "Safely detects and neutralizes spam comments",
    eventType: "COMMENT" as const,
    text: "Earn 500% daily with crypto signals! DM @crypto_wealth on telegram immediately",
  },
];

const DEFAULT_SAMPLE_DOC = `OpenReply Pricing & Features Knowledge Base:
- Starter Plan: $29/month. Includes 1 Instagram account, up to 1,000 automated DMs per month, and keyword automation.
- Pro Plan: $79/month. Includes 3 Instagram accounts, unlimited DMs, autonomous AI response agent, RAG document knowledge base, and human escalation inbox.
- Enterprise Plan: Custom pricing. Includes 10+ accounts, dedicated proxy IPs, white-label client portal, custom SLA, and Zapier/webhook CRM sync.
- Account Requirements: Requires an Instagram Professional (Creator or Business) account connected to a Facebook Page. Personal profiles are not supported by Instagram's API.
- Support: Standard support via email. Priority live support available for Enterprise customers.`;

export default function SimulatorPage() {
  const [eventType, setEventType] = useState<"COMMENT" | "DM">("DM");
  const [username, setUsername] = useState("alex_growth");
  const [text, setText] = useState(PRESET_SCENARIOS[0].text);
  const [postCaption, setPostCaption] = useState("🚀 The all-new OpenReply AI is live! Drop a comment or DM us any questions about our automated lead agent.");
  const [contextDoc, setContextDoc] = useState(DEFAULT_SAMPLE_DOC);
  const [brandTone, setBrandTone] = useState("friendly");
  const [pushToInbox, setPushToInbox] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRunSimulation() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          username,
          text,
          postCaption,
          contextDoc,
          brandTone,
          pushToInbox,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || "Simulation encountered an issue");
      }
    } catch {
      setError("Network or server connection error");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearThread() {
    try {
      await fetch("/api/ai/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_thread", username }),
      });
      if (result) {
        setResult((prev) => (prev ? { ...prev, conversationHistory: [] } : null));
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-neutral-900">Live Agent Testing Studio</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-indigo-100 text-indigo-800 uppercase">
              Interactive Simulator
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Simulate incoming Instagram comments and DMs in real time to test intent classification, RAG retrieval, and human escalations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface border border-border text-foreground hover:bg-surface-hover flex items-center gap-1.5"
          >
            <span>🎯 View Escalated Leads</span>
          </Link>
          <Link
            href="/settings"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            ⚙️ AI Settings
          </Link>
        </div>
      </div>

      {/* Quick Scenario Preset Chips */}
      <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
        <span className="text-xs font-semibold text-neutral-700">1-Click Test Scenarios:</span>
        <div className="flex flex-wrap gap-2">
          {PRESET_SCENARIOS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              onClick={() => {
                setEventType(preset.eventType);
                setText(preset.text);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 bg-neutral-50 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-900 transition-all text-left"
            >
              <div className="font-semibold text-neutral-800">{preset.title}</div>
              <div className="text-[10px] text-neutral-400">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Config vs Execution Trace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Setup (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-4">
            <h2 className="text-sm font-bold text-neutral-900">Simulation Parameters</h2>

            {/* Event Type Switch */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">Trigger Event Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEventType("COMMENT")}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    eventType === "COMMENT"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                  }`}
                >
                  💬 Post Comment
                </button>
                <button
                  type="button"
                  onClick={() => setEventType("DM")}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    eventType === "DM"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                  }`}
                >
                  📩 Direct Message
                </button>
              </div>
            </div>

            {/* User Handle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">Simulated Instagram Username</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-neutral-400">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full text-xs pl-7 pr-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Message Text */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">
                {eventType === "COMMENT" ? "Comment Text" : "User DM Inquiry"}
              </label>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What does the user ask or comment?"
                className="w-full text-xs p-3 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-normal"
              />
            </div>

            {eventType === "COMMENT" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700">Post Caption Context</label>
                <input
                  type="text"
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  placeholder="Caption of the post being commented on..."
                  className="w-full text-xs p-2.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-normal"
                />
              </div>
            )}

            {/* Knowledge Document Preview / Edit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700">RAG Document Knowledge Base</label>
                <span className="text-[10px] text-indigo-600 font-medium">Editable in real-time</span>
              </div>
              <textarea
                rows={4}
                value={contextDoc}
                onChange={(e) => setContextDoc(e.target.value)}
                placeholder="Paste pricing, policies, or product FAQs..."
                className="w-full text-[11px] p-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-800 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Brand Tone Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">Agent Brand Tone</label>
              <select
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="friendly">Friendly & Warm (Recommended)</option>
                <option value="professional">Professional & Direct</option>
                <option value="punchy">Short & Punchy</option>
                <option value="casual">Casual & Conversational</option>
                <option value="hype">Energetic / Creator Hype</option>
              </select>
            </div>

            {/* Push to real inbox checkbox */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={pushToInbox}
                onChange={(e) => setPushToInbox(e.target.checked)}
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-neutral-700">
                Log to real <strong>Leads & Escalations Inbox</strong> if human intervention is needed
              </span>
            </label>

            {/* Run Button */}
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={loading || !text.trim()}
              className="w-full py-2.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{loading ? "⚙️ Processing Webhook & AI..." : "⚡ Execute Agent Simulation"}</span>
            </button>

            {error && (
              <div className="p-3 text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution Trace & Visual Output (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {result ? (
            <>
              {/* Telemetry Bar */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-white grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-neutral-400 font-semibold uppercase">Execution Time</div>
                  <div className="text-sm font-bold text-neutral-900">{result.totalDurationMs} ms</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-semibold uppercase">AI Provider</div>
                  <div className="text-sm font-bold text-indigo-600 capitalize">{result.providerUsed}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-semibold uppercase">Intent / Safety</div>
                  <div className="text-sm font-bold text-neutral-900">
                    {result.isSpam ? "🚨 Spam Blocked" : result.intent}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-semibold uppercase">Action Taken</div>
                  <div
                    className={`text-sm font-bold ${
                      result.escalatedToAdmin
                        ? "text-amber-600"
                        : result.isSpam
                        ? "text-rose-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {result.escalatedToAdmin ? "Admin Escalated" : result.isSpam ? "Ignored (Spam)" : "AI Answered"}
                  </div>
                </div>
              </div>

              {/* Instagram Message Preview Card */}
              <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-800">
                      {result.eventType === "COMMENT" ? "Instagram Public Post Thread" : "Instagram Direct Message"}
                    </span>
                    {result.conversationHistory && result.conversationHistory.length > 1 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                        {result.conversationHistory.length} Turns In Thread
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {result.conversationHistory && result.conversationHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearThread}
                        className="text-[10px] text-neutral-500 hover:text-rose-600 underline font-medium"
                      >
                        Clear Memory
                      </button>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                      Live Preview
                    </span>
                  </div>
                </div>

                {/* User Profile & Scoring Banner */}
                {result.userProfile && (
                  <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500 font-medium">Lead Score:</span>
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900">
                          {result.userProfile.leadScore} / 100
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500 font-medium">Stage:</span>
                        <span className="px-2 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {result.userProfile.stage}
                        </span>
                      </div>
                    </div>
                    {result.userProfile.interestTags && result.userProfile.interestTags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-neutral-400 text-[11px]">Interests:</span>
                        {result.userProfile.interestTags.map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-800 font-medium">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 bg-neutral-50/70 p-4 rounded-lg border border-neutral-100">
                  {/* Multi-turn thread if present */}
                  {result.conversationHistory && result.conversationHistory.length > 0 ? (
                    result.conversationHistory.map((turn, i) => (
                      <div
                        key={turn.id || i}
                        className={`flex items-start gap-2 ${
                          turn.sender === "user" ? "justify-start" : "justify-end"
                        }`}
                      >
                        {turn.sender === "user" && (
                          <div className="w-7 h-7 rounded-full bg-neutral-300 text-neutral-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {result.username[0]?.toUpperCase() || "U"}
                          </div>
                        )}
                        <div
                          className={`rounded-lg p-3 max-w-md text-xs shadow-sm ${
                            turn.sender === "user"
                              ? "bg-white border border-neutral-200 text-neutral-800"
                              : turn.sender === "admin"
                              ? "bg-emerald-600 text-white"
                              : result.escalatedToAdmin && i === (result.conversationHistory?.length ?? 0) - 1
                              ? "bg-amber-50 text-amber-900 border border-amber-200"
                              : "bg-indigo-600 text-white"
                          }`}
                        >
                          <div
                            className={`font-semibold mb-0.5 text-[10px] ${
                              turn.sender === "user"
                                ? "text-neutral-500"
                                : turn.sender === "admin"
                                ? "text-emerald-100"
                                : result.escalatedToAdmin && i === (result.conversationHistory?.length ?? 0) - 1
                                ? "text-amber-800"
                                : "text-indigo-100"
                            }`}
                          >
                            {turn.sender === "user"
                              ? `@${result.username}`
                              : turn.sender === "admin"
                              ? "Team Admin Reply"
                              : "OpenReply Bot (DM)"}
                          </div>
                          <p className="whitespace-pre-wrap">{turn.text}</p>
                        </div>
                        {turn.sender !== "user" && (
                          <div
                            className={`w-7 h-7 rounded-full text-white font-bold flex items-center justify-center text-xs shrink-0 ${
                              turn.sender === "admin" ? "bg-emerald-600" : "bg-indigo-600"
                            }`}
                          >
                            {turn.sender === "admin" ? "👤" : "🤖"}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <>
                      {/* Incoming user message fallback */}
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full bg-neutral-300 text-neutral-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {result.username[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="bg-white border border-neutral-200 rounded-lg p-3 max-w-md text-xs shadow-sm">
                          <div className="font-semibold text-neutral-900 mb-0.5">@{result.username}</div>
                          <p className="text-neutral-700">{result.inputMessage}</p>
                        </div>
                      </div>

                      {/* Outgoing agent response */}
                      {result.publicReply && (
                        <div className="flex items-start gap-2 justify-end">
                          <div className="bg-indigo-600 text-white rounded-lg p-3 max-w-md text-xs shadow-sm">
                            <div className="font-semibold text-indigo-100 mb-0.5">OpenReply Bot (Public Reply)</div>
                            <p>{result.publicReply}</p>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            🤖
                          </div>
                        </div>
                      )}

                      {result.dmReply && (
                        <div className="flex items-start gap-2 justify-end">
                          <div
                            className={`rounded-lg p-3 max-w-md text-xs shadow-sm ${
                              result.escalatedToAdmin
                                ? "bg-amber-50 text-amber-900 border border-amber-200"
                                : "bg-indigo-600 text-white"
                            }`}
                          >
                            <div
                              className={`font-semibold mb-0.5 ${
                                result.escalatedToAdmin ? "text-amber-800" : "text-indigo-100"
                              }`}
                            >
                              {result.escalatedToAdmin ? "⚠️ Bot Hold & Forward Notice" : "OpenReply Bot (DM)"}
                            </div>
                            <p>{result.dmReply}</p>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-indigo-700 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            🤖
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {result.leadCreatedId && (
                    <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center justify-between">
                      <span>✓ Saved to your <strong>Leads & Escalations Inbox</strong>!</span>
                      <Link href="/inbox" className="underline font-semibold">
                        Open in Inbox →
                      </Link>
                    </div>
                  )}

                  {result.escalatedToAdmin && (
                    <div className="p-2.5 rounded bg-purple-50 border border-purple-200 text-purple-900 text-[11px] flex items-center justify-between">
                      <span>🎓 Potential Knowledge Gap detected: Human escalation triggered.</span>
                      <Link href="/inbox" className="underline font-semibold hover:text-purple-950">
                        Review Knowledge Gaps →
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Step-by-Step Execution Graph */}
              <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Pipeline Execution Trace
                </h3>

                <div className="space-y-2.5">
                  {result.steps.map((step: SimulationStep, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs space-y-1 transition-all ${
                        step.status === "success"
                          ? "bg-emerald-50/50 border-emerald-200 text-emerald-950"
                          : step.status === "warning"
                          ? "bg-amber-50/60 border-amber-200 text-amber-950"
                          : "bg-rose-50/60 border-rose-200 text-rose-950"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1.5">
                          <span>{step.status === "success" ? "✓" : step.status === "warning" ? "⚠️" : "✗"}</span>
                          <span>{step.name}</span>
                        </span>
                        <span className="text-[10px] opacity-70 font-mono">{step.durationMs}ms</span>
                      </div>
                      <p className="text-[11px] opacity-90 pl-5">{step.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-center text-neutral-400 space-y-2">
              <div className="text-4xl">🔬</div>
              <div className="font-semibold text-neutral-700">No Simulation Executed Yet</div>
              <p className="text-xs max-w-sm">
                Pick a scenario or enter a custom user comment, then click &ldquo;Execute Agent Simulation&rdquo; to watch the real-time reasoning trace.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
