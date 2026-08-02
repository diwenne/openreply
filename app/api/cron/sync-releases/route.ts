import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  deriveInstoreEvents,
  deriveReleaseEvents,
  type DerivedEvent,
  type ShopFeed,
} from "@/lib/release-sync/shop-feed";
import { buildCampaignCopy } from "@/lib/copy/yoyaku-patterns";
import { lintCampaignCopy } from "@/lib/copy/copy-linter";
import { missingFacts } from "@/lib/copy/release-facts";
import { createGeneratedCampaign } from "@/lib/automations/create-generated";

/**
 * Release-to-campaign sync.
 *
 * Pulls the shop's release feed (new exclusive preorders, releases going
 * live, restocks, published instore sessions), derives typed events by
 * diffing stock statuses against the last seen state, and turns each fresh
 * event into an INACTIVE campaign built from the hand-written YOYAKU
 * patterns. Guardrails: RELEASE_SYNC_ENABLED kill switch (default off),
 * MAX_CAMPAIGNS_PER_RUN cap, structural idempotence via the
 * (sku, eventType) unique in ReleaseSyncEvent, and the copy linter as a
 * hard gate — rejected copy never becomes a campaign.
 */

const MAX_CAMPAIGNS_PER_RUN = 5;

async function recordOutcome(
  event: DerivedEvent,
  outcome: string,
  detail: string | null,
  automationId: string | null
) {
  await prisma.releaseSyncEvent.create({
    data: {
      sku: event.sku,
      eventType: event.facts.eventType,
      outcome,
      detail,
      automationId,
    },
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (process.env.RELEASE_SYNC_ENABLED !== "true") {
    return NextResponse.json({
      success: true,
      data: { enabled: false, created: 0 },
    });
  }

  const feedUrl = process.env.RELEASE_EVENTS_URL;
  const feedKey = process.env.RELEASE_EVENTS_KEY;
  if (!feedUrl || !feedKey) {
    return NextResponse.json(
      { success: false, error: "RELEASE_EVENTS_URL / RELEASE_EVENTS_KEY not configured" },
      { status: 500 }
    );
  }

  const username = process.env.RELEASE_SYNC_IG_USERNAME ?? "yoyakurecordstore";
  const account = await prisma.instagramAccount.findFirst({
    where: { username },
    select: { id: true, workspaceId: true },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: `Instagram account ${username} is not connected` },
      { status: 500 }
    );
  }

  let feed: ShopFeed;
  try {
    const response = await fetch(`${feedUrl}?key=${encodeURIComponent(feedKey)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`feed responded ${response.status}`);
    }
    feed = (await response.json()) as ShopFeed;
  } catch (err) {
    console.error("[sync-releases] feed fetch failed", err);
    return NextResponse.json(
      { success: false, error: "Release feed unreachable" },
      { status: 502 }
    );
  }

  const products = Array.isArray(feed.products) ? feed.products : [];
  const instore = Array.isArray(feed.instore) ? feed.instore : [];

  const knownStates = await prisma.releaseProductState.findMany({
    where: { sku: { in: products.map((p) => p.sku) } },
  });
  const lastStatusBySku = new Map(knownStates.map((s) => [s.sku, s.lastStatus]));

  const events = [
    ...deriveReleaseEvents(products, lastStatusBySku),
    ...deriveInstoreEvents(instore),
  ];

  let created = 0;
  let skipped = 0;
  let rejected = 0;

  for (const event of events) {
    if (created >= MAX_CAMPAIGNS_PER_RUN) break;

    const alreadyProcessed = await prisma.releaseSyncEvent.findUnique({
      where: {
        sku_eventType: { sku: event.sku, eventType: event.facts.eventType },
      },
    });
    if (alreadyProcessed) {
      skipped += 1;
      continue;
    }

    const missing = missingFacts(event.facts);
    if (missing.length > 0) {
      await recordOutcome(event, "incomplete", `missing: ${missing.join(", ")}`, null);
      rejected += 1;
      continue;
    }

    const copy = buildCampaignCopy(event.facts);
    const lint = lintCampaignCopy(copy, event.facts);
    if (!lint.ok) {
      await recordOutcome(
        event,
        "lint_rejected",
        lint.violations.map((v) => `${v.rule}: ${v.detail}`).join(" | "),
        null
      );
      rejected += 1;
      continue;
    }

    const automation = await createGeneratedCampaign({
      copy,
      catnoTag:
        event.facts.eventType === "instore_published" ? null : event.facts.catno,
      workspaceId: account.workspaceId,
      instagramAccountId: account.id,
      isActive: process.env.RELEASE_SYNC_AUTO_ACTIVATE === "true",
    });

    await recordOutcome(event, "created", null, automation.id);
    created += 1;
  }

  // Persist the freshly observed statuses so the next run diffs against them.
  for (const product of products) {
    await prisma.releaseProductState.upsert({
      where: { sku: product.sku },
      create: { sku: product.sku, lastStatus: product.stock_status },
      update: { lastStatus: product.stock_status },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      enabled: true,
      products: products.length,
      instore: instore.length,
      events: events.length,
      created,
      skipped,
      rejected,
    },
  });
}
