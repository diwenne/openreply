import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockReserveRateSlot, mockReleaseRateSlot, mockEnqueue } =
  vi.hoisted(() => ({
    mockPrisma: {
      tikTokAccount: { findUnique: vi.fn(), update: vi.fn() },
      tikTokCampaign: { findMany: vi.fn() },
      tikTokReplyLog: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      operationalEvent: { create: vi.fn() },
    },
    mockReserveRateSlot: vi.fn(),
    mockReleaseRateSlot: vi.fn(),
    mockEnqueue: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => value.replace(/^enc:/, ""),
  encryptToken: (value: string) => `enc:${value}`,
}));
vi.mock("@/lib/utils/rate-limiter", () => ({
  reserveRateSlot: mockReserveRateSlot,
  releaseRateSlot: mockReleaseRateSlot,
}));
vi.mock("@/lib/tiktok/queue", () => ({
  TIKTOK_QUEUE_NAME: "tiktok-processing",
  enqueueTikTokComment: mockEnqueue,
}));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: vi.fn() }));

import { processTikTokComment } from "../lib/tiktok/worker";
import type { TikTokCommentJob } from "../lib/tiktok/queue";

const OPEN_ID = "_000account";
const COMMENT_ID = "7247303576418566913";
const VIDEO_ID = "7203946942097902849";
const REPLY_ID = "7250000000000000001";

const account = {
  id: "acct_1",
  workspaceId: "ws_1",
  openId: OPEN_ID,
  username: "tryhachi",
  accessToken: "enc:act.valid",
  tokenExpiresAt: new Date(Date.now() + 12 * 3600_000),
  refreshToken: "enc:rft.valid",
};

const activeCampaign = {
  id: "camp_1",
  keywords: ["IRAQ"],
  matchAnyWord: false,
  wholeWordMatch: true,
  matchAnyVideo: true,
  videoId: null,
  isActive: true,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  replyMessages: ["Sent you the link 🫡"],
};

const webhookJob: TikTokCommentJob = {
  tiktokAccountId: account.id,
  commentId: COMMENT_ID,
  videoId: VIDEO_ID,
  text: "IRAQ",
  source: "WEBHOOK",
};

const pollingJob: TikTokCommentJob = { ...webhookJob, owner: false, source: "POLLING" };

function envelope(code: number, data: unknown = {}, message = "OK") {
  return new Response(JSON.stringify({ code, message, request_id: "req", data }));
}

// The comment/list lookup, with the id as TikTok may send it: a bare number.
function commentLookup({ owner = false, text = "IRAQ", parent = "" } = {}) {
  return new Response(
    `{"code":0,"message":"OK","data":{"comments":[{"comment_id":${COMMENT_ID},"video_id":${VIDEO_ID},` +
      `"text":${JSON.stringify(text)},"owner":${owner},"status":"PUBLIC","username":"fan","create_time":"1790000000"` +
      `${parent ? `,"parent_comment_id":${parent}` : ""}}]}}`
  );
}

const fetchMock = vi.fn();

function calls(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TIKTOK_APP_ID", "app");
  vi.stubEnv("TIKTOK_APP_SECRET", "secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();

  mockPrisma.tikTokAccount.findUnique.mockResolvedValue(account);
  mockPrisma.tikTokReplyLog.findFirst.mockResolvedValue(null);
  mockPrisma.tikTokCampaign.findMany.mockResolvedValue([activeCampaign]);
  mockPrisma.tikTokReplyLog.create.mockResolvedValue({ id: "log_1" });
  mockPrisma.tikTokReplyLog.update.mockResolvedValue({});
  mockPrisma.operationalEvent.create.mockResolvedValue({});
  mockReserveRateSlot.mockResolvedValue({ allowed: true, currentCount: 1 });
  mockReleaseRateSlot.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue(undefined);
});

describe("TikTok comment worker", () => {
  it("looks up a webhook comment, claims it, then replies once", async () => {
    fetchMock
      .mockResolvedValueOnce(commentLookup())
      .mockResolvedValueOnce(envelope(0, { comment_id: REPLY_ID }));

    await expect(processTikTokComment(webhookJob)).resolves.toBe("replied");

    const [replyUrl, replyInit] = calls("comment/reply/create")[0];
    expect(String(replyUrl)).toContain("business-api.tiktok.com/open_api/v1.3/business/comment/reply/create/");
    expect(replyInit.headers["Access-Token"]).toBe("act.valid");
    expect(JSON.parse(replyInit.body)).toEqual({
      business_id: OPEN_ID,
      video_id: VIDEO_ID,
      comment_id: COMMENT_ID,
      text: "Sent you the link 🫡",
    });

    // The claim is written before the reply goes out.
    const claimOrder = mockPrisma.tikTokReplyLog.create.mock.invocationCallOrder[0];
    const replyOrder = fetchMock.mock.invocationCallOrder[1];
    expect(claimOrder).toBeLessThan(replyOrder);
    expect(mockPrisma.tikTokReplyLog.create.mock.calls[0][0].data).toMatchObject({
      commentId: COMMENT_ID,
      status: "PENDING",
      campaignId: "camp_1",
      commenterName: "fan",
    });
    expect(mockPrisma.tikTokReplyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REPLIED", replyCommentId: REPLY_ID }),
      })
    );
  });

  it("skips a comment the account wrote itself, and records it", async () => {
    fetchMock.mockResolvedValueOnce(commentLookup({ owner: true }));

    await expect(processTikTokComment(webhookJob)).resolves.toBe("skipped");
    expect(calls("comment/reply/create")).toHaveLength(0);
    expect(mockPrisma.tikTokReplyLog.create.mock.calls[0][0].data).toMatchObject({
      status: "SKIPPED",
      errorMessage: "Own comment",
    });
  });

  it("ignores a comment id that is one of our own replies", async () => {
    mockPrisma.tikTokReplyLog.findFirst.mockResolvedValue({ id: "log_0" });
    await expect(processTikTokComment({ ...webhookJob, commentId: REPLY_ID })).resolves.toBe("ignored");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not look anything up when no campaign matches the text", async () => {
    await expect(processTikTokComment({ ...webhookJob, text: "nice video" })).resolves.toBe("no_match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses polling data directly, without a lookup", async () => {
    fetchMock.mockResolvedValueOnce(envelope(0, { comment_id: REPLY_ID }));
    await expect(processTikTokComment(pollingJob)).resolves.toBe("replied");
    expect(calls("comment/list")).toHaveLength(0);
  });

  it("does nothing when another job already claimed the comment", async () => {
    mockPrisma.tikTokReplyLog.create.mockRejectedValue({ code: "P2002" });
    await expect(processTikTokComment(pollingJob)).resolves.toBe("duplicate");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReleaseRateSlot).toHaveBeenCalledTimes(1);
  });

  it("marks a timed-out reply unconfirmed and never sends it again", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(processTikTokComment(pollingJob)).resolves.toBe("unconfirmed");
    expect(calls("comment/reply/create")).toHaveLength(1);
    expect(mockPrisma.tikTokReplyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "UNCONFIRMED" }) })
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("treats a TikTok 5xxxx error as unconfirmed, not failed", async () => {
    fetchMock.mockResolvedValueOnce(envelope(50002, {}, "Internal error"));
    await expect(processTikTokComment(pollingJob)).resolves.toBe("unconfirmed");
    expect(calls("comment/reply/create")).toHaveLength(1);
  });

  it("fails on a non-zero code even though the HTTP status is 200", async () => {
    fetchMock.mockResolvedValueOnce(envelope(40002, {}, "text too long"));
    await expect(processTikTokComment(pollingJob)).resolves.toBe("failed");
    expect(mockPrisma.tikTokReplyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "FAILED", errorMessage: "TikTok 40002: text too long" },
      })
    );
  });

  it("flags permission errors for reconnection", async () => {
    fetchMock.mockResolvedValueOnce(envelope(40001, {}, "No permission"));
    await expect(processTikTokComment(pollingJob)).resolves.toBe("failed");
    expect(mockPrisma.operationalEvent.create.mock.calls[0][0].data.message).toContain("needs to be reconnected");
  });

  it("refreshes an expired token once and retries the rejected reply", async () => {
    fetchMock
      .mockResolvedValueOnce(envelope(40102, {}, "access_token_expired"))
      .mockResolvedValueOnce(
        envelope(0, {
          access_token: "act.new",
          refresh_token: "rft.new",
          open_id: OPEN_ID,
          expires_in: 86400,
          refresh_token_expires_in: 31536000,
          scope: "comment.list,comment.list.manage",
        })
      )
      .mockResolvedValueOnce(envelope(0, { comment_id: REPLY_ID }));

    await expect(processTikTokComment(pollingJob)).resolves.toBe("replied");
    const replies = calls("comment/reply/create");
    expect(replies).toHaveLength(2);
    expect(replies[1][1].headers["Access-Token"]).toBe("act.new");
    expect(mockPrisma.tikTokAccount.update.mock.calls[0][0].data).toMatchObject({
      accessToken: "enc:act.new",
      refreshToken: "enc:rft.new",
    });
  });

  it("releases the claim and waits when TikTok throttles the reply", async () => {
    fetchMock.mockResolvedValueOnce(envelope(40100, {}, "rate_limit_exceeded"));
    await expect(processTikTokComment(pollingJob)).resolves.toBe("requeued");
    expect(calls("comment/reply/create")).toHaveLength(1);
    expect(mockPrisma.tikTokReplyLog.delete).toHaveBeenCalledWith({ where: { id: "log_1" } });
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ requeueAttempt: 1 }),
      5 * 60 * 1000
    );
  });

  it("waits for our own reply rate limit before claiming", async () => {
    mockReserveRateSlot.mockResolvedValue({ allowed: false, currentCount: 10 });
    await expect(processTikTokComment(pollingJob)).resolves.toBe("requeued");
    expect(mockPrisma.tikTokReplyLog.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a looked-up comment that turns out to be a reply", async () => {
    fetchMock.mockResolvedValueOnce(commentLookup({ parent: "7247303576418566000" }));
    await expect(processTikTokComment(webhookJob)).resolves.toBe("no_match");
    expect(calls("comment/reply/create")).toHaveLength(0);
  });
});
