"use client";

import { useEffect, useState } from "react";
import type {
  AIProviderId,
  AIProviderConfig,
  WorkspaceAISettings,
} from "@/lib/ai/types";

export function AISettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    text: string;
    isMock?: boolean;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [providers, setProviders] = useState<Record<AIProviderId, AIProviderConfig> | null>(null);
  const [settings, setSettings] = useState<WorkspaceAISettings | null>(null);

  const [activeProvider, setActiveProvider] = useState<AIProviderId>("groq");
  const [activeModel, setActiveModel] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [enableSpamFilter, setEnableSpamFilter] = useState(true);
  const [enableHumanizedDelay, setEnableHumanizedDelay] = useState(true);
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [autoEscalate, setAutoEscalate] = useState(true);
  const [escalationNotice, setEscationNotice] = useState("");

  useEffect(() => {
    fetch("/api/ai/settings")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const s: WorkspaceAISettings = payload.data.settings;
          setSettings(s);
          setProviders(payload.data.providers);
          setActiveProvider(s.provider);
          setActiveModel(s.model);
          setBrandTone(s.defaultBrandTone);
          setEnableSpamFilter(s.enableSpamFilter);
          setEnableHumanizedDelay(s.enableHumanizedDelay);
          setMinDelay(s.minDelaySeconds);
          setMaxDelay(s.maxDelaySeconds);
          setAutoEscalate(s.autoEscalateUnsure);
          setEscationNotice(s.escalationNotice);

          // Populate initial key input if available
          if (s.provider === "groq") setApiKeyInput(s.groqApiKey || "");
          if (s.provider === "openrouter") setApiKeyInput(s.openrouterApiKey || "");
          if (s.provider === "nvidia") setApiKeyInput(s.nvidiaApiKey || "");
          if (s.provider === "gemini") setApiKeyInput(s.geminiApiKey || "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function handleProviderChange(newProvider: AIProviderId) {
    setActiveProvider(newProvider);
    if (providers && providers[newProvider]) {
      setActiveModel(providers[newProvider].defaultModel);
    }
    if (settings) {
      if (newProvider === "groq") setApiKeyInput(settings.groqApiKey || "");
      if (newProvider === "openrouter") setApiKeyInput(settings.openrouterApiKey || "");
      if (newProvider === "nvidia") setApiKeyInput(settings.nvidiaApiKey || "");
      if (newProvider === "gemini") setApiKeyInput(settings.geminiApiKey || "");
    }
    setTestResult(null);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_connection",
          provider: activeProvider,
          model: activeModel,
          apiKey: apiKeyInput,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          text: data.data.reply,
          isMock: data.data.isMockFallback,
        });
      } else {
        setTestResult({
          success: false,
          text: data.error || "Connection test failed",
        });
      }
    } catch {
      setTestResult({ success: false, text: "Network error during test." });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setSaveSuccess(false);

    const updates: Partial<WorkspaceAISettings> = {
      provider: activeProvider,
      model: activeModel,
      defaultBrandTone: brandTone,
      enableSpamFilter,
      enableHumanizedDelay,
      minDelaySeconds: Number(minDelay),
      maxDelaySeconds: Number(maxDelay),
      autoEscalateUnsure: autoEscalate,
      escalationNotice,
    };

    if (activeProvider === "groq") updates.groqApiKey = apiKeyInput;
    if (activeProvider === "openrouter") updates.openrouterApiKey = apiKeyInput;
    if (activeProvider === "nvidia") updates.nvidiaApiKey = apiKeyInput;
    if (activeProvider === "gemini") updates.geminiApiKey = apiKeyInput;

    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          updates,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="panel p-6 animate-pulse rounded-lg border border-neutral-200">Loading AI settings...</div>;
  }

  const currentProviderConfig = providers?.[activeProvider];

  return (
    <div className="panel p-6 rounded-lg border border-neutral-200 bg-white space-y-6 shadow-sm" id="ai-settings-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">🤖 OpenReply AI Engine</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
              Free & Open Weights Ready
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Connect high-speed, free-tier models (Groq, OpenRouter, NVIDIA NIM, or Gemini) to power smart comment replies, intent classification, and document RAG.
          </p>
        </div>
      </div>

      {/* Provider Selector */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700">
          AI Provider
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {providers &&
            Object.values(providers).map((p) => {
              const isSelected = p.id === activeProvider;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`p-3 rounded-lg text-left text-xs font-medium border transition-all ${
                    isSelected
                      ? "border-neutral-900 bg-neutral-900 text-white shadow-sm"
                      : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <div className="font-semibold">{p.name.split(" ")[0]}</div>
                  <div className={`text-[10px] mt-0.5 ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                    {p.id === "groq" && "Ultra-fast / Free"}
                    {p.id === "openrouter" && "Free tier models"}
                    {p.id === "nvidia" && "1,000 Free credits"}
                    {p.id === "gemini" && "Multimodal context"}
                  </div>
                </button>
              );
            })}
        </div>

        {currentProviderConfig && (
          <div className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded border border-neutral-200">
            <span className="font-medium text-neutral-800">Provider Note:</span> {currentProviderConfig.freeTierNote}{" "}
            <a
              href={currentProviderConfig.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline ml-1 inline-flex items-center gap-0.5"
            >
              Get free API key ↗
            </a>
          </div>
        )}
      </div>

      {/* Model & API Key */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            Model Selection
          </label>
          <select
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value)}
            className="w-full text-xs p-2.5 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          >
            {currentProviderConfig?.availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.description ? `— ${m.description}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            {currentProviderConfig?.name} API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder={`Enter ${currentProviderConfig?.apiKeyEnvName || "API Key"}`}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-2 text-xs font-medium rounded border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-800 whitespace-nowrap"
            >
              {testing ? "Testing..." : "Test"}
            </button>
          </div>
        </div>
      </div>

      {testResult && (
        <div
          className={`p-3 rounded text-xs border ${
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <div className="font-semibold">{testResult.success ? "✓ Test Passed" : "✕ Test Failed"}</div>
          <div className="mt-0.5 text-[11px] opacity-90">{testResult.text}</div>
          {testResult.isMock && (
            <div className="mt-1 text-[10px] text-amber-700 font-medium">
              Notice: Running in simulated local mode until an active key is entered.
            </div>
          )}
        </div>
      )}

      {/* Safety & Humanization Defaults */}
      <div className="border-t border-neutral-200 pt-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700">
          Anti-Spam & Humanization Safeguards
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-start gap-2.5 p-3 rounded border border-neutral-200 bg-neutral-50 cursor-pointer">
            <input
              type="checkbox"
              checked={enableSpamFilter}
              onChange={(e) => setEnableSpamFilter(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <div>
              <div className="text-xs font-semibold text-neutral-900">Filter Bots & Toxic Spam</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Automatically drops crypto bots and promotional spam before sending DMs or consuming limits.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded border border-neutral-200 bg-neutral-50 cursor-pointer">
            <input
              type="checkbox"
              checked={enableHumanizedDelay}
              onChange={(e) => setEnableHumanizedDelay(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <div>
              <div className="text-xs font-semibold text-neutral-900">Humanized Jitter Delay</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Randomizes response intervals between {minDelay}s and {maxDelay}s to satisfy Meta rate-limit heuristics.
              </div>
            </div>
          </label>
        </div>

        {/* Global Creator Brand Tone */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            Global Creator Voice / Tone
          </label>
          <textarea
            rows={2}
            value={brandTone}
            onChange={(e) => setBrandTone(e.target.value)}
            placeholder="e.g. Enthusiastic, helpful, friendly creator. Keep responses under 2 sentences."
            className="w-full text-xs p-2.5 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>

        {/* Human Escalation Notice */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1">
            Auto-Escalation Reply (When AI is unsure or user requests human)
          </label>
          <input
            type="text"
            value={escalationNotice}
            onChange={(e) => setEscationNotice(e.target.value)}
            className="w-full text-xs p-2.5 rounded border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {saveSuccess ? (
          <span className="text-xs text-emerald-600 font-medium">✓ AI settings saved successfully</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className="px-4 py-2 text-xs font-medium rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save AI Settings"}
        </button>
      </div>
    </div>
  );
}
