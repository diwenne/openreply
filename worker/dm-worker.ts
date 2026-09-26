import { createDMWorker } from "@/lib/queue/dm-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";
import { reconcileComments } from "@/lib/polling/comment-reconciler";
import { attachPendingNextReels } from "@/lib/automation/attach-next-reel";
import { isTikTokConfigured } from "@/lib/env";
import { pollTikTokComments } from "@/lib/tiktok/poller";
import { createTikTokWorker } from "@/lib/tiktok/worker";
import os from "node:os";

const worker = createDMWorker();
const startedAt = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 30_000;
// Polling safety net for comments that webhooks miss. Runs in the worker because
// it must fire every few minutes and Vercel's free crons only run once a day.
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);

// TikTok comment replies run on their own queue, and only when the TikTok app
// credentials are set.
const tiktokEnabled = isTikTokConfigured();
const tiktokWorker = tiktokEnabled ? createTikTokWorker() : null;
const TIKTOK_POLL_INTERVAL_MS = Number(
  process.env.TIKTOK_POLL_INTERVAL_MS ?? 5 * 60_000
);

console.log("[DM Worker] Started");
if (tiktokEnabled) console.log("[DM Worker] TikTok comment replies enabled");

async function heartbeat() {
  try {
    await recordWorkerHeartbeat({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Heartbeat failed:", message);
  }
}

void heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

async function poll() {
  try {
    const attached = await attachPendingNextReels();
    if (attached.bound > 0 || attached.failedAccounts > 0) {
      console.log("[DM Worker] Next-reel attachment:", attached);
    }
    await reconcileComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Comment reconciliation failed:", message);
  }
}

// Kick off one sweep shortly after boot, then on a fixed interval.
setTimeout(() => void poll(), 10_000);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

async function pollTikTok() {
  try {
    await pollTikTokComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] TikTok comment polling failed:", message);
  }
}

if (tiktokEnabled) setTimeout(() => void pollTikTok(), 20_000);
const tiktokPollTimer = tiktokEnabled
  ? setInterval(() => void pollTikTok(), TIKTOK_POLL_INTERVAL_MS)
  : null;

async function shutdown(signal: string) {
  console.log(`[DM Worker] ${signal} received, closing worker`);
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  if (tiktokPollTimer) clearInterval(tiktokPollTimer);
  await Promise.all([worker.close(), tiktokWorker?.close()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
