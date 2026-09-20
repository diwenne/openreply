/**
 * BullMQ Queue Client
 *
 * Provides the DM processing queue and Redis connection for BullMQ.
 */

import { Queue } from "bullmq";
import Redis from "ioredis";

let connection: Redis | null = null;

const inMemoryStore = new Map<string, string>();
const inMemoryLists = new Map<string, string[]>();

export function createMockRedis(): Redis {
  console.warn("[AI Studio] Redis not connected — using in-memory mock");
  const mock = {
    get: async (k: string) => inMemoryStore.get(k) ?? null,
    set: async (k: string, v: string | number | boolean) => {
      inMemoryStore.set(k, String(v));
      return "OK";
    },
    del: async (k: string) => {
      inMemoryStore.delete(k);
      inMemoryLists.delete(k);
      return 1;
    },
    incr: async (k: string) => {
      const n = Number(inMemoryStore.get(k) || 0) + 1;
      inMemoryStore.set(k, String(n));
      return n;
    },
    expire: async () => 1,
    ttl: async () => 3600,
    ping: async () => "PONG",
    lpush: async (k: string, v: string) => {
      const list = inMemoryLists.get(k) ?? [];
      list.unshift(v);
      inMemoryLists.set(k, list);
      return list.length;
    },
    lrange: async (k: string, start: number, stop: number) => {
      const list = inMemoryLists.get(k) ?? [];
      const end = stop === -1 ? undefined : stop + 1;
      return list.slice(start, end);
    },
    ltrim: async (k: string, start: number, stop: number) => {
      const list = inMemoryLists.get(k) ?? [];
      const end = stop === -1 ? undefined : stop + 1;
      inMemoryLists.set(k, list.slice(start, end));
      return "OK";
    },
    pipeline: () => ({
      exec: async () => [],
    }),
    defineCommand: () => {},
    eval: async () => [1, 1, 749],
    on: () => mock,
    once: () => mock,
    disconnect: () => {},
    quit: async () => "OK",
  };
  return mock as unknown as Redis;
}

export function getRedisConnection(): Redis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.includes("localhost:6379") || redisUrl.includes("127.0.0.1:6379")) {
      connection = createMockRedis();
    } else {
      try {
        connection = new Redis(redisUrl, {
          maxRetriesPerRequest: null, // Required by BullMQ
          lazyConnect: true,
        });
      } catch {
        connection = createMockRedis();
      }
    }
  }
  return connection;
}

// ─── DM Queue ───────────────────────────────────────────────────────────────────

export type CommentSource = "WEBHOOK" | "POLLING";

export interface ProcessCommentJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  // Set when the comment came from an ad: the organic post the ad was made
  // from. Campaigns are bound to that post, so both ids have to be matched.
  originalMediaId?: string;
  requeueAttempt?: number;
  // Which path enqueued this comment. It is not copied to ProcessedComment or
  // used for reconciliation dedup.
  source?: CommentSource;
}

// Delivered when a user taps an opening DM's button — carries the reveal target.
export interface ProcessPostbackJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
  fallback?: boolean;
}

// Scheduled after the link is delivered, to send the appreciation follow-up.
// Enqueued with a delay (followUpDelayMinutes) so it can fire later, not just
// immediately.
export interface ProcessFollowUpJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  userId: string;
  automationId: string;
  commenterName?: string | null;
}

// An inbound DM from a user. Campaigns with `dmTriggerEnabled` whose keywords
// match the text reply to the sender.
export interface ProcessMessageJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
  isStoryMention?: boolean;
  isStoryReply?: boolean;
}

export type DmQueueJob =
  | ProcessCommentJob
  | ProcessPostbackJob
  | ProcessFollowUpJob
  | ProcessMessageJob;

export const POSTBACK_JOB_NAME = "process-postback";
export const FOLLOWUP_JOB_NAME = "process-followup";
export const MESSAGE_JOB_NAME = "process-message";

let dmQueue: Queue<DmQueueJob> | null = null;

function createMockQueue(): Queue<DmQueueJob> {
  const mockQueue = {
    add: async (name: string, data: DmQueueJob) => {
      console.log(`[AI Studio Mock Queue] Job enqueued: ${name}`);
      return { id: "mock-job-" + Date.now(), name, data };
    },
    getJobCounts: async () => {
      return { waiting: 0, active: 0, delayed: 0, failed: 0 };
    },
    close: async () => {},
  };
  return mockQueue as unknown as Queue<DmQueueJob>;
}

export function getDMQueue(): Queue<DmQueueJob> {
  if (!dmQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.includes("localhost:6379") || redisUrl.includes("127.0.0.1:6379")) {
      dmQueue = createMockQueue();
    } else {
      try {
        dmQueue = new Queue<DmQueueJob>("dm-processing", {
          connection: getRedisConnection(),
          defaultJobOptions: {
            removeOnComplete: { count: 1000 },
            removeOnFail: { age: 300, count: 2000 },
            attempts: 3,
            backoff: {
              type: "custom",
            },
          },
        });
      } catch {
        dmQueue = createMockQueue();
      }
    }
  }
  return dmQueue;
}
