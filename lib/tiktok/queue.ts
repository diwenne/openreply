import { Queue } from "bullmq";
import { getRedisConnection, type CommentSource } from "@/lib/queue/client";

export const TIKTOK_QUEUE_NAME = "tiktok-processing";

export interface TikTokCommentJob {
  /** TikTokAccount.id */
  tiktokAccountId: string;
  commentId: string;
  videoId: string;
  /** Present when the source already had it; the worker looks it up otherwise. */
  text?: string;
  commenterName?: string;
  /**
   * Whether the account itself wrote the comment. Known from polling; unknown
   * from the webhook, which carries no author, so the worker looks it up.
   */
  owner?: boolean;
  source: CommentSource;
  requeueAttempt?: number;
}

let queue: Queue<TikTokCommentJob> | null = null;

/**
 * A queue of its own so the Instagram queue's retry policy never applies here.
 * Every job runs once: the reply endpoint is not idempotent, and a retry after
 * an unknown outcome could post the same reply twice.
 */
export function getTikTokQueue(): Queue<TikTokCommentJob> {
  if (!queue) {
    queue = new Queue<TikTokCommentJob>(TIKTOK_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { age: 3600, count: 1000 },
      },
    });
  }
  return queue;
}

/**
 * Webhook and polling jobs for one comment share a job id, so a comment seen
 * by both is only queued once while the first job is retained. The database
 * claim in the worker is the real guard.
 */
export async function enqueueTikTokComment(
  job: TikTokCommentJob,
  delayMs?: number
): Promise<void> {
  const attempt = job.requeueAttempt ?? 0;
  await getTikTokQueue().add("tiktok-comment", job, {
    jobId: `tiktok_${job.tiktokAccountId}_${job.commentId}${attempt ? `_r${attempt}` : ""}`,
    ...(delayMs ? { delay: delayMs } : {}),
  });
}
