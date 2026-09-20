import { NextRequest, NextResponse } from "next/server";
import {
  getOutboundWebhooks,
  saveOutboundWebhook,
  deleteOutboundWebhook,
  toggleOutboundWebhook,
  getWebhookDeliveryLogs,
  sendTestWebhookPing,
  type CRMProviderPreset,
  type OutboundWebhookTrigger,
} from "@/lib/crm/webhooks";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "logs") {
      const logs = getWebhookDeliveryLogs(30);
      return NextResponse.json({ success: true, data: logs });
    }

    const webhooks = getOutboundWebhooks();
    const logs = getWebhookDeliveryLogs(10);

    return NextResponse.json({
      success: true,
      data: {
        webhooks,
        recentLogs: logs,
      },
    });
  } catch (err: unknown) {
    console.error("[API /api/crm/webhooks GET] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch outbound webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || "save";

    if (action === "save") {
      const { id, name, url, secret, preset, triggers, enabled } = body;
      if (!name || !url || !triggers || triggers.length === 0) {
        return NextResponse.json(
          { success: false, error: "Name, valid URL, and at least one trigger are required" },
          { status: 400 }
        );
      }

      const webhook = saveOutboundWebhook({
        id,
        name,
        url,
        secret,
        preset: preset as CRMProviderPreset,
        triggers: triggers as OutboundWebhookTrigger[],
        enabled,
      });

      return NextResponse.json({ success: true, data: webhook });
    }

    if (action === "toggle") {
      const { id, enabled } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: "Missing webhook id" }, { status: 400 });
      }

      const ok = toggleOutboundWebhook(id, Boolean(enabled));
      return NextResponse.json({ success: ok });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: "Missing webhook id" }, { status: 400 });
      }

      const ok = deleteOutboundWebhook(id);
      return NextResponse.json({ success: ok });
    }

    if (action === "test") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: "Missing webhook id" }, { status: 400 });
      }

      const result = await sendTestWebhookPing(id);
      return NextResponse.json({ success: result.success, data: result });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[API /api/crm/webhooks POST] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process webhook request" },
      { status: 500 }
    );
  }
}
