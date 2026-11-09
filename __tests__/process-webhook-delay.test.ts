import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockQueueAdd, mockEvents } = vi.hoisted(() => ({
  mockPrisma: {
    instagramAccount: { findMany: vi.fn() },
    webhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
    },
    dmLog: { findMany: vi.fn() },
  },
  mockQueueAdd: vi.fn(),
  mockEvents: {
    comments: [] as Array<Record<string, unknown>>,
    messages: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: mockQueueAdd }),
  POSTBACK_JOB_NAME: "process-postback",
  MESSAGE_JOB_NAME: "process-message",
}));

vi.mock("@/lib/meta/webhook", () => ({
  parseCommentEvents: () => mockEvents.comments,
  parseMessageEvents: () => mockEvents.messages,
  parsePostbackEvents: () => [],
  parseReadEvents: () => [],
}));

import { processInstagramWebhook } from "../lib/queue/process-webhook";

const baseAccount = {
  id: "acct_row_1",
  instagramId: "ig_123",
  workspaceId: "ws_1",
  publicReplyDelayMinSeconds: 0,
  publicReplyDelayMaxSeconds: 0,
  dmDelayMinSeconds: 0,
  dmDelayMaxSeconds: 0,
};

const commentEvent = {
  instagramAccountId: "ig_123",
  commentId: "comment_1",
  commentText: "LINK",
  commenterId: "user_1",
  commenterName: "someone",
  mediaId: "media_1",
};

const messageEvent = {
  instagramAccountId: "ig_123",
  messageId: "mid_1",
  messageText: "LINK",
  senderId: "user_1",
};

const payload = {
  object: "instagram",
  entry: [{ id: "ig_123" }],
};

function run(account: Record<string, unknown> = baseAccount) {
  mockPrisma.instagramAccount.findMany.mockResolvedValue([account]);
  return processInstagramWebhook({
    payload: payload as never,
    provider: "META",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEvents.comments = [];
  mockEvents.messages = [];
  mockPrisma.webhookEvent.create.mockResolvedValue({ id: "event_1" });
  mockPrisma.webhookEvent.update.mockResolvedValue({});
  mockPrisma.dmLog.findMany.mockResolvedValue([]);
  mockQueueAdd.mockResolvedValue({ id: "job" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhook reply pacing", () => {
  it("queues one job per comment when no delay is configured", async () => {
    mockEvents.comments = [commentEvent];

    await run();

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({ commentId: "comment_1" }),
      { jobId: "comment_ig_123_comment_1" }
    );
    expect(mockQueueAdd.mock.calls[0][1]).not.toHaveProperty("leg");
  });

  it("splits a comment into two delayed legs with distinct job ids", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mockEvents.comments = [commentEvent];

    await run({
      ...baseAccount,
      publicReplyDelayMinSeconds: 10,
      publicReplyDelayMaxSeconds: 20,
    });

    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      1,
      "process-comment",
      expect.objectContaining({ commentId: "comment_1", leg: "reply" }),
      { jobId: "comment_ig_123_comment_1_reply", delay: 15_000 }
    );
    expect(mockQueueAdd).toHaveBeenNthCalledWith(
      2,
      "process-comment",
      expect.objectContaining({ commentId: "comment_1", leg: "dm" }),
      { jobId: "comment_ig_123_comment_1_dm", delay: 0 }
    );
  });

  it("gives the DM leg its own draw from the DM range", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockEvents.comments = [commentEvent];

    await run({ ...baseAccount, dmDelayMinSeconds: 30, dmDelayMaxSeconds: 90 });

    const dmCall = mockQueueAdd.mock.calls.find(
      (call) => call[1]?.leg === "dm"
    );
    expect(dmCall?.[2]).toEqual({
      jobId: "comment_ig_123_comment_1_dm",
      delay: 30_000,
    });
  });

  it("delays an inbound-DM auto reply from the same DM range", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mockEvents.messages = [messageEvent];

    await run({ ...baseAccount, dmDelayMinSeconds: 0, dmDelayMaxSeconds: 60 });

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [name, data, options] = mockQueueAdd.mock.calls[0];
    expect(name).toBe("process-message");
    expect(data).toMatchObject({ messageId: "mid_1" });
    expect(options.delay).toBe(30_000);
  });

  it("leaves the inbound-DM reply immediate when no range is set", async () => {
    mockEvents.messages = [messageEvent];

    await run();

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd.mock.calls[0][2]).not.toHaveProperty("delay");
  });
});
