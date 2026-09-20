/**
 * Outbound Webhook & CRM Integration Engine
 * Handles event dispatching to Zapier, Make.com, GoHighLevel, HubSpot, or custom webhook URLs.
 */

export type OutboundWebhookTrigger =
  | "LEAD_HOT"
  | "LEAD_EMAIL_CAPTURED"
  | "LEAD_PHONE_CAPTURED"
  | "CONVERSATION_ESCALATED"
  | "LINK_CLICKED"
  | "KNOWLEDGE_GAP_DETECTED";

export type CRMProviderPreset = "CUSTOM" | "ZAPIER" | "MAKE" | "GOHIGHLEVEL" | "HUBSPOT";

export interface OutboundWebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string;
  preset: CRMProviderPreset;
  triggers: OutboundWebhookTrigger[];
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  lastStatusCode?: number;
  successCount: number;
  failureCount: number;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  webhookName: string;
  trigger: OutboundWebhookTrigger;
  url: string;
  statusCode: number;
  requestPayload: Record<string, unknown>;
  responseBody?: string;
  durationMs: number;
  timestamp: number;
  success: boolean;
}

// In-memory store for active webhooks and delivery logs
const webhooksStore = new Map<string, OutboundWebhookConfig>();
const deliveryLogs: WebhookDeliveryLog[] = [];

function ensureSeedWebhooks() {
  if (webhooksStore.size === 0) {
    const defaultZapier: OutboundWebhookConfig = {
      id: "wh_zapier_hot_leads",
      name: "Zapier: Hot Leads & CRM Sync",
      url: "https://hooks.zapier.com/hooks/catch/1948281/openreply_leads",
      preset: "ZAPIER",
      triggers: ["LEAD_HOT", "LEAD_EMAIL_CAPTURED", "LEAD_PHONE_CAPTURED"],
      enabled: true,
      createdAt: Date.now() - 7 * 86400 * 1000,
      lastTriggeredAt: Date.now() - 32 * 60 * 1000,
      lastStatusCode: 200,
      successCount: 42,
      failureCount: 0,
    };

    const defaultGHL: OutboundWebhookConfig = {
      id: "wh_ghl_agency",
      name: "GoHighLevel: Pipeline Ingestion",
      url: "https://services.leadconnectorhq.com/hooks/d0f91ab/openreply",
      preset: "GOHIGHLEVEL",
      triggers: ["LEAD_HOT", "CONVERSATION_ESCALATED"],
      enabled: true,
      createdAt: Date.now() - 14 * 86400 * 1000,
      lastTriggeredAt: Date.now() - 120 * 60 * 1000,
      lastStatusCode: 200,
      successCount: 19,
      failureCount: 1,
    };

    webhooksStore.set(defaultZapier.id, defaultZapier);
    webhooksStore.set(defaultGHL.id, defaultGHL);

    // Add recent simulated delivery logs
    deliveryLogs.push(
      {
        id: "log_1",
        webhookId: defaultZapier.id,
        webhookName: defaultZapier.name,
        trigger: "LEAD_HOT",
        url: defaultZapier.url,
        statusCode: 200,
        requestPayload: {
          event: "LEAD_HOT",
          timestamp: new Date().toISOString(),
          lead: {
            username: "sarah_growth",
            intent: "HOT",
            confidenceScore: 0.94,
            email: "sarah@growthwave.io",
            campaign: "Scaling Reel",
          },
        },
        responseBody: '{"status":"success","id":"zap_99214"}',
        durationMs: 142,
        timestamp: Date.now() - 32 * 60 * 1000,
        success: true,
      },
      {
        id: "log_2",
        webhookId: defaultGHL.id,
        webhookName: defaultGHL.name,
        trigger: "CONVERSATION_ESCALATED",
        url: defaultGHL.url,
        statusCode: 200,
        requestPayload: {
          event: "CONVERSATION_ESCALATED",
          timestamp: new Date().toISOString(),
          lead: {
            username: "marcus_agency",
            escalationReason: "Requested custom SLA and pooled seat pricing",
            campaign: "Launch Guide Reel",
          },
        },
        responseBody: '{"contact_id":"ghl_88291","synced":true}',
        durationMs: 215,
        timestamp: Date.now() - 120 * 60 * 1000,
        success: true,
      }
    );
  }
}

/**
 * Retrieve all registered outbound webhooks
 */
export function getOutboundWebhooks(): OutboundWebhookConfig[] {
  ensureSeedWebhooks();
  return Array.from(webhooksStore.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Create or update an outbound webhook endpoint
 */
export function saveOutboundWebhook(config: {
  id?: string;
  name: string;
  url: string;
  secret?: string;
  preset?: CRMProviderPreset;
  triggers: OutboundWebhookTrigger[];
  enabled?: boolean;
}): OutboundWebhookConfig {
  ensureSeedWebhooks();
  const id = config.id || `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const existing = webhooksStore.get(id);

  const updated: OutboundWebhookConfig = {
    id,
    name: config.name.trim(),
    url: config.url.trim(),
    secret: config.secret?.trim() || undefined,
    preset: config.preset || "CUSTOM",
    triggers: config.triggers,
    enabled: config.enabled !== undefined ? config.enabled : existing ? existing.enabled : true,
    createdAt: existing ? existing.createdAt : Date.now(),
    lastTriggeredAt: existing?.lastTriggeredAt,
    lastStatusCode: existing?.lastStatusCode,
    successCount: existing?.successCount || 0,
    failureCount: existing?.failureCount || 0,
  };

  webhooksStore.set(id, updated);
  return updated;
}

/**
 * Delete an outbound webhook
 */
export function deleteOutboundWebhook(id: string): boolean {
  ensureSeedWebhooks();
  return webhooksStore.delete(id);
}

/**
 * Toggle active state of a webhook
 */
export function toggleOutboundWebhook(id: string, enabled: boolean): boolean {
  ensureSeedWebhooks();
  const wh = webhooksStore.get(id);
  if (!wh) return false;
  wh.enabled = enabled;
  webhooksStore.set(id, wh);
  return true;
}

/**
 * Retrieve recent delivery logs
 */
export function getWebhookDeliveryLogs(limit = 25): WebhookDeliveryLog[] {
  ensureSeedWebhooks();
  return deliveryLogs.slice(0, limit);
}

/**
 * Format payload according to preset (HubSpot, GoHighLevel, Zapier, Custom)
 */
function formatPayloadForPreset(
  preset: CRMProviderPreset,
  trigger: OutboundWebhookTrigger,
  data: Record<string, unknown>
): Record<string, unknown> {
  const base = {
    event: trigger,
    timestamp: new Date().toISOString(),
    source: "OpenReply AI",
    ...data,
  };

  switch (preset) {
    case "GOHIGHLEVEL":
      return {
        event: trigger,
        contact: {
          first_name: (data.firstName as string) || (data.name as string) || "",
          username: (data.username as string) || "",
          email: (data.email as string) || "",
          phone: (data.phone as string) || "",
          tags: ["openreply", trigger.toLowerCase(), (data.intent as string)?.toLowerCase() || ""].filter(Boolean),
          customFields: {
            instagram_handle: data.username,
            qualification: data.intent,
            campaign_name: data.campaignName,
            last_message: data.lastMessage,
          },
        },
      };

    case "HUBSPOT":
      return {
        event: trigger,
        properties: {
          email: data.email || "",
          phone: data.phone || "",
          instagram_username: data.username || "",
          lead_status: data.intent === "HOT" ? "HOT_LEAD" : "QUALIFIED",
          source_campaign: data.campaignName || "",
        },
      };

    case "ZAPIER":
    case "MAKE":
    case "CUSTOM":
    default:
      return base;
  }
}

/**
 * Dispatch an outbound webhook event asynchronously
 */
export async function dispatchOutboundEvent(
  trigger: OutboundWebhookTrigger,
  data: Record<string, unknown>
): Promise<{ dispatchedCount: number; errors: string[] }> {
  ensureSeedWebhooks();
  const activeWebhooks = Array.from(webhooksStore.values()).filter(
    (wh) => wh.enabled && wh.triggers.includes(trigger)
  );

  if (activeWebhooks.length === 0) {
    return { dispatchedCount: 0, errors: [] };
  }

  let dispatchedCount = 0;
  const errors: string[] = [];

  for (const wh of activeWebhooks) {
    const startTime = Date.now();
    const payload = formatPayloadForPreset(wh.preset, trigger, data);

    try {
      // In development / preview, we handle simulated or live webhooks gracefully
      const isMockUrl = wh.url.includes("example.com") || wh.url.includes("zapier.com/hooks/catch/1948281");
      let statusCode = 200;
      let responseBody = '{"success":true,"message":"Webhook received"}';

      if (!isMockUrl && wh.url.startsWith("http")) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "OpenReply-Webhook-Dispatcher/1.0",
          "X-OpenReply-Event": trigger,
        };

        if (wh.secret) {
          headers["X-OpenReply-Signature"] = wh.secret;
        }

        const res = await fetch(wh.url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000),
        });

        statusCode = res.status;
        try {
          responseBody = await res.text();
        } catch {
          responseBody = `Status ${statusCode}`;
        }
      }

      const durationMs = Date.now() - startTime;
      const success = statusCode >= 200 && statusCode < 300;

      if (success) {
        wh.successCount++;
      } else {
        wh.failureCount++;
      }

      wh.lastStatusCode = statusCode;
      wh.lastTriggeredAt = Date.now();
      webhooksStore.set(wh.id, wh);

      // Record delivery log
      deliveryLogs.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        webhookId: wh.id,
        webhookName: wh.name,
        trigger,
        url: wh.url,
        statusCode,
        requestPayload: payload,
        responseBody: responseBody.substring(0, 300),
        durationMs,
        timestamp: Date.now(),
        success,
      });

      // Keep log length manageable
      if (deliveryLogs.length > 50) {
        deliveryLogs.pop();
      }

      dispatchedCount++;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      wh.failureCount++;
      wh.lastStatusCode = 500;
      wh.lastTriggeredAt = Date.now();
      webhooksStore.set(wh.id, wh);

      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`Webhook ${wh.name} failed: ${errorMessage}`);

      deliveryLogs.unshift({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        webhookId: wh.id,
        webhookName: wh.name,
        trigger,
        url: wh.url,
        statusCode: 500,
        requestPayload: payload,
        responseBody: errorMessage,
        durationMs,
        timestamp: Date.now(),
        success: false,
      });
    }
  }

  return { dispatchedCount, errors };
}

/**
 * Send a test ping for a specific webhook endpoint
 */
export async function sendTestWebhookPing(webhookId: string): Promise<{
  success: boolean;
  statusCode: number;
  durationMs: number;
  error?: string;
}> {
  ensureSeedWebhooks();
  const wh = webhooksStore.get(webhookId);
  if (!wh) {
    return { success: false, statusCode: 404, durationMs: 0, error: "Webhook not found" };
  }

  const sampleLead = {
    username: "test_creator",
    name: "Alex Rivera",
    email: "alex.rivera@example.com",
    phone: "+1 555-0199",
    intent: "HOT",
    confidenceScore: 0.96,
    campaignName: "Test Automation Reel",
    lastMessage: "Send me the scaling doc ASAP!",
  };

  const startTime = Date.now();
  try {
    const res = await dispatchOutboundEvent("LEAD_HOT", sampleLead);
    return {
      success: res.errors.length === 0,
      statusCode: wh.lastStatusCode || 200,
      durationMs: Date.now() - startTime,
      error: res.errors.join("; ") || undefined,
    };
  } catch (err: unknown) {
    return {
      success: false,
      statusCode: 500,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
