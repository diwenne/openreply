"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  OutboundWebhookConfig,
  WebhookDeliveryLog,
  CRMProviderPreset,
  OutboundWebhookTrigger,
} from "@/lib/crm/webhooks";

const AVAILABLE_TRIGGERS: { id: OutboundWebhookTrigger; label: string; desc: string }[] = [
  {
    id: "LEAD_HOT",
    label: "🔥 Hot Lead Identified",
    desc: "Dispatched when AI classifies a customer DM as high-intent or purchase-ready",
  },
  {
    id: "LEAD_EMAIL_CAPTURED",
    label: "✉️ Email Captured",
    desc: "Dispatched when customer shares an email address in the DM chat",
  },
  {
    id: "LEAD_PHONE_CAPTURED",
    label: "📞 Phone Captured",
    desc: "Dispatched when customer shares a valid phone number",
  },
  {
    id: "CONVERSATION_ESCALATED",
    label: "🙋 Escalation to Human",
    desc: "Dispatched when an unanswerable question or explicit request requires agent intervention",
  },
  {
    id: "LINK_CLICKED",
    label: "🔗 Shortlink Clicked",
    desc: "Dispatched when a recipient clicks a tracked automation link",
  },
  {
    id: "KNOWLEDGE_GAP_DETECTED",
    label: "🎓 Knowledge Gap Discovered",
    desc: "Dispatched when the continuous learning system identifies recurring missing FAQ content",
  },
];

const PRESETS: { id: CRMProviderPreset; name: string; icon: string; placeholder: string }[] = [
  {
    id: "ZAPIER",
    name: "Zapier Webhook",
    icon: "⚡",
    placeholder: "https://hooks.zapier.com/hooks/catch/...",
  },
  {
    id: "GOHIGHLEVEL",
    name: "GoHighLevel (LeadConnector)",
    icon: "🚀",
    placeholder: "https://services.leadconnectorhq.com/hooks/...",
  },
  {
    id: "MAKE",
    name: "Make.com (Integromat)",
    icon: "🟣",
    placeholder: "https://hook.eu1.make.com/...",
  },
  {
    id: "HUBSPOT",
    name: "HubSpot Custom API",
    icon: "🧡",
    placeholder: "https://api.hubapi.com/crm/v3/objects/contacts/...",
  },
  {
    id: "CUSTOM",
    name: "Custom REST Webhook",
    icon: "🌐",
    placeholder: "https://api.yourcompany.com/webhooks/openreply",
  },
];

export function WebhooksSettingsCard() {
  const [webhooks, setWebhooks] = useState<OutboundWebhookConfig[]>([]);
  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<OutboundWebhookConfig | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formPreset, setFormPreset] = useState<CRMProviderPreset>("ZAPIER");
  const [formTriggers, setFormTriggers] = useState<OutboundWebhookTrigger[]>([
    "LEAD_HOT",
    "LEAD_EMAIL_CAPTURED",
    "LEAD_PHONE_CAPTURED",
  ]);

  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"webhooks" | "logs">("webhooks");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/webhooks");
      const json = await res.json();
      if (json.success && json.data) {
        setWebhooks(json.data.webhooks || []);
        setLogs(json.data.recentLogs || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  function showToast(text: string, type: "success" | "error" = "success") {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  function openCreateModal(preset: CRMProviderPreset = "ZAPIER") {
    const defaultPreset = PRESETS.find((p) => p.id === preset) || PRESETS[0];
    setFormName(`${defaultPreset.name} Ingestion`);
    setFormUrl("");
    setFormSecret("");
    setFormPreset(preset);
    setFormTriggers(["LEAD_HOT", "LEAD_EMAIL_CAPTURED", "LEAD_PHONE_CAPTURED"]);
    setEditingWebhook(null);
    setShowAddModal(true);
  }

  function openEditModal(wh: OutboundWebhookConfig) {
    setEditingWebhook(wh);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormSecret(wh.secret || "");
    setFormPreset(wh.preset);
    setFormTriggers(wh.triggers);
    setShowAddModal(true);
  }

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim() || formTriggers.length === 0) {
      showToast("Please fill in a name, valid URL, and select at least one trigger.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/crm/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: editingWebhook?.id,
          name: formName,
          url: formUrl,
          secret: formSecret,
          preset: formPreset,
          triggers: formTriggers,
          enabled: editingWebhook ? editingWebhook.enabled : true,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (editingWebhook) {
          setWebhooks((prev) => prev.map((w) => (w.id === json.data.id ? json.data : w)));
          showToast(`✓ Updated webhook "${json.data.name}"`);
        } else {
          setWebhooks((prev) => [json.data, ...prev]);
          showToast(`✓ Created webhook "${json.data.name}"`);
        }
        setShowAddModal(false);
      } else {
        showToast(json.error || "Failed to save webhook", "error");
      }
    } catch {
      showToast("Network error while saving webhook", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(wh: OutboundWebhookConfig) {
    try {
      const updated = !wh.enabled;
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, enabled: updated } : w))
      );
      const res = await fetch("/api/crm/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id: wh.id, enabled: updated }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(updated ? `Webhook activated` : `Webhook paused`);
      }
    } catch {
      // Revert on error
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, enabled: wh.enabled } : w))
      );
    }
  }

  async function handleDelete(wh: OutboundWebhookConfig) {
    if (!confirm(`Delete webhook "${wh.name}"?`)) return;
    try {
      setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
      const res = await fetch("/api/crm/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: wh.id }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Webhook removed`);
      }
    } catch {
      showToast("Failed to delete webhook", "error");
    }
  }

  async function handleTestPing(wh: OutboundWebhookConfig) {
    setTestingId(wh.id);
    try {
      const res = await fetch("/api/crm/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: wh.id }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        showToast(`✓ Test ping delivered! HTTP ${json.data.statusCode} (${json.data.durationMs}ms)`);
        loadData();
      } else {
        showToast(`Test ping failed: ${json.data?.error || json.error || "Unknown"}`, "error");
      }
    } catch {
      showToast("Network failure during test ping", "error");
    } finally {
      setTestingId(null);
    }
  }

  function toggleTrigger(trigger: OutboundWebhookTrigger) {
    if (formTriggers.includes(trigger)) {
      if (formTriggers.length === 1) return; // Keep at least one
      setFormTriggers(formTriggers.filter((t) => t !== trigger));
    } else {
      setFormTriggers([...formTriggers, trigger]);
    }
  }

  return (
    <section className="panel rounded p-4 sm:p-6 space-y-5 border border-border" id="crm-webhooks-card">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔌</span>
            <h2 className="text-base font-semibold text-foreground">Outbound CRM &amp; Webhook Integrations</h2>
          </div>
          <p className="text-xs text-muted mt-1 max-w-xl">
            Stream qualified Instagram leads, captured emails, and human escalations in real-time into your CRM, Zapier, GoHighLevel, or custom API endpoints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreateModal("ZAPIER")}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-accent text-white hover:bg-accent-hover transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ Add Webhook</span>
          </button>
        </div>
      </div>

      {/* Preset Quick-Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted mr-1">Quick Presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openCreateModal(p.id)}
            className="px-2.5 py-1 text-xs rounded border border-border bg-surface hover:bg-surface-hover text-foreground flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>{p.icon}</span>
            <span>{p.name.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-2.5 rounded text-xs font-medium flex items-center justify-between animate-fadeIn ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-Tabs: Active Endpoints vs Delivery Logs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("webhooks")}
          className={`text-xs font-semibold px-3 py-1 rounded transition-colors cursor-pointer ${
            activeTab === "webhooks"
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          Connected Endpoints ({webhooks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`text-xs font-semibold px-3 py-1 rounded transition-colors cursor-pointer ${
            activeTab === "logs"
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          Recent Delivery Logs ({logs.length})
        </button>
      </div>

      {/* Tab 1: Webhook List */}
      {activeTab === "webhooks" && (
        <div className="space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted">Loading webhooks...</div>
          ) : webhooks.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted border border-dashed border-border rounded p-6">
              No webhook endpoints configured yet. Click <strong>&quot;+ Add Webhook&quot;</strong> to connect your CRM or Zapier.
            </div>
          ) : (
            webhooks.map((wh) => {
              const presetObj = PRESETS.find((p) => p.id === wh.preset) || PRESETS[4];
              const isTesting = testingId === wh.id;

              return (
                <div
                  key={wh.id}
                  className={`p-4 rounded border transition-all space-y-2.5 ${
                    wh.enabled ? "border-border bg-surface" : "border-border/60 bg-surface/50 opacity-75"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{presetObj.icon}</span>
                      <span className="text-sm font-semibold text-foreground">{wh.name}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-muted/10 text-muted">
                        {wh.preset}
                      </span>
                      {!wh.enabled && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Paused
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestPing(wh)}
                        disabled={isTesting || !wh.enabled}
                        className="px-2.5 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-surface-hover text-foreground transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        {isTesting ? "Pinging..." : "Test Ping"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggle(wh)}
                        className="text-xs px-2.5 py-1 rounded border border-border text-muted hover:text-foreground cursor-pointer font-medium"
                      >
                        {wh.enabled ? "Pause" : "Resume"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(wh)}
                        className="text-xs px-2 py-1 text-muted hover:text-foreground cursor-pointer"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(wh)}
                        className="text-xs px-2 py-1 text-muted hover:text-red-600 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* URL */}
                  <div className="text-xs font-mono text-muted bg-surface/80 p-2 rounded border border-border/60 truncate">
                    {wh.url}
                  </div>

                  {/* Subscribed Triggers & Delivery Counts */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted">
                    <div className="flex flex-wrap gap-1">
                      {wh.triggers.map((t) => {
                        const trg = AVAILABLE_TRIGGERS.find((at) => at.id === t);
                        return (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded bg-surface border border-border text-foreground text-[10px]"
                          >
                            {trg?.label.split(" ")[0]} {t.replace(/_/g, " ")}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-3">
                      <span>
                        Deliveries: <strong className="text-foreground">{wh.successCount}</strong> ok /{" "}
                        <strong className="text-error">{wh.failureCount}</strong> err
                      </span>
                      {wh.lastTriggeredAt && (
                        <span>
                          Last: {new Date(wh.lastTriggeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Delivery Logs */}
      {activeTab === "logs" && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">No webhook deliveries recorded yet.</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded border border-border bg-surface text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        log.success ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      HTTP {log.statusCode}
                    </span>
                    <strong className="text-foreground">{log.webhookName}</strong>
                    <span className="text-muted text-[11px]">({log.trigger})</span>
                  </div>
                  <div className="text-muted text-[11px] flex items-center gap-2">
                    <span>{log.durationMs}ms</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="bg-surface/90 p-2 rounded font-mono text-[11px] text-muted overflow-x-auto border border-border/50">
                  <span className="text-foreground font-semibold">Payload: </span>
                  {JSON.stringify(log.requestPayload)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Create or Edit Webhook */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="bg-surface border border-border rounded-lg max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">
                {editingWebhook ? "Edit Outbound Webhook" : "Connect Outbound Webhook"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted hover:text-foreground text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWebhook} className="space-y-3.5">
              {/* Preset Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">CRM / Tool Preset</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFormPreset(p.id);
                        if (!formUrl || formUrl.includes("zapier") || formUrl.includes("leadconnector")) {
                          setFormUrl("");
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-medium border text-left flex items-center gap-1.5 transition-colors cursor-pointer ${
                        formPreset === p.id
                          ? "border-accent bg-accent/10 text-accent font-semibold"
                          : "border-border bg-surface hover:bg-surface-hover text-muted"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span className="truncate">{p.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Endpoint Name */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Webhook Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Zapier: High Intent Real Estate Leads"
                  className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground focus:outline-none focus:border-accent"
                  required
                />
              </div>

              {/* Destination URL */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Destination Webhook URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder={PRESETS.find((p) => p.id === formPreset)?.placeholder || "https://..."}
                  className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground font-mono focus:outline-none focus:border-accent"
                  required
                />
              </div>

              {/* Optional Secret Token */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Secret Token / Header (Optional)
                </label>
                <input
                  type="text"
                  value={formSecret}
                  onChange={(e) => setFormSecret(e.target.value)}
                  placeholder="Optional secret passed via X-OpenReply-Signature"
                  className="w-full text-xs p-2 rounded border border-border bg-surface text-foreground font-mono focus:outline-none focus:border-accent"
                />
              </div>

              {/* Trigger Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Subscribed Events</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 rounded border border-border/70 bg-surface/50">
                  {AVAILABLE_TRIGGERS.map((t) => {
                    const checked = formTriggers.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-start gap-2 text-xs text-foreground cursor-pointer hover:bg-surface/80 p-1.5 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTrigger(t.id)}
                          className="mt-0.5 rounded border-border"
                        />
                        <div>
                          <div className="font-semibold">{t.label}</div>
                          <div className="text-[11px] text-muted">{t.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-muted hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold rounded bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving..." : editingWebhook ? "Save Changes" : "Create Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
