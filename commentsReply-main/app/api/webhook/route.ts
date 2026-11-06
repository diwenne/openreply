import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  describeSignatureFailure,
  parseCommentEvents,
  verifyWebhookSignature,
} from "@/lib/meta/webhook";
import { processInstagramWebhook } from "@/lib/queue/process-webhook";


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { success: false, error: "Verification failed" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Record the attempt so a signature mismatch is visible rather than a
    // silent 401. This is the common symptom of FACEBOOK_APP_SECRET being
    // set to the wrong app's secret for the webhook's signing key, or of a
    // second Meta app posting to this URL. The details say which.
    const details = describeSignatureFailure(rawBody, signature);
    console.warn(
      "[Webhook] Signature verification failed",
      JSON.stringify({ ...details, userAgent: request.headers.get("user-agent") })
    );
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "WARNING",
          message: "Webhook signature verification failed",
          payload: {
            ...details,
            userAgent: request.headers.get("user-agent"),
            bodyPreview: rawBody.slice(0, 200),
          },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  try {
    await processInstagramWebhook({ payload: payload as Parameters<typeof parseCommentEvents>[0], provider: 'META' });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
