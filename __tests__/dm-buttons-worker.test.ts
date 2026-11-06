import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrisma,
  mockSendPrivateReply,
  mockSendPrivateReplyWithLinkButton,
  mockSendPrivateReplyWithButton,
  mockGetUserFollowStatus,
  mockSendDirectMessageWithButton,
  mockSendDirectMessage,
  mockSendDirectMessageWithLinkButton,
  mockSendMessagePayload,
  mockDecryptToken,
  mockMatchKeywords,
  mockReserveDMSlot,
  mockReleaseDMSlot,
  mockQueueAdd,
  mockReserveWorkspaceDMSend,
  mockReleaseWorkspaceDMReservation,
} = vi.hoisted(() => ({
  mockPrisma: {
    zernioConnection: { findUnique: vi.fn() },
    postbackDelivery: { create: vi.fn(), delete: vi.fn() },
    automation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    dmLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    instagramAccount: {
      findUnique: vi.fn(),
    },
    operationalEvent: {
      create: vi.fn(),
    },
  },
  mockSendPrivateReply: vi.fn(),
  mockSendPrivateReplyWithLinkButton: vi.fn(),
  mockSendPrivateReplyWithButton: vi.fn(),
  mockGetUserFollowStatus: vi.fn(),
  mockSendDirectMessageWithButton: vi.fn(),
  mockSendDirectMessage: vi.fn(),
  mockSendDirectMessageWithLinkButton: vi.fn(),
  mockSendMessagePayload: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockMatchKeywords: vi.fn(),
  mockReserveDMSlot: vi.fn(),
  mockReleaseDMSlot: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockReserveWorkspaceDMSend: vi.fn(),
  mockReleaseWorkspaceDMReservation: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/meta/client", () => ({
  sendPrivateReply: mockSendPrivateReply,
  sendPrivateReplyWithLinkButton: mockSendPrivateReplyWithLinkButton,
  sendPrivateReplyWithButton: mockSendPrivateReplyWithButton,
  getUserFollowStatus: mockGetUserFollowStatus,
  sendDirectMessageWithButton: mockSendDirectMessageWithButton,
  sendDirectMessage: mockSendDirectMessage,
  sendDirectMessageWithLinkButton: mockSendDirectMessageWithLinkButton,
  sendMessagePayload: mockSendMessagePayload,
  sendCommentReply: vi.fn(),
  MetaApiError: class MetaApiError extends Error {
    code: number;
    constructor(
      code: number,
      _subcode: number | undefined,
      _fbTraceId: string | undefined,
      message: string
    ) {
      super(message);
      this.code = code;
      this.name = "MetaApiError";
    }
  },
  TokenExpiredError: class TokenExpiredError extends Error {
    name = "TokenExpiredError";
  },
  RateLimitError: class RateLimitError extends Error {
    name = "RateLimitError";
  },
}));

vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: mockDecryptToken,
}));

vi.mock("@/lib/utils/keyword-matcher", () => ({
  matchKeywords: mockMatchKeywords,
}));

vi.mock("@/lib/utils/rate-limiter", () => ({
  reserveDMSlot: mockReserveDMSlot,
  releaseDMSlot: mockReleaseDMSlot,
}));

vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: mockReserveWorkspaceDMSend,
  releaseWorkspaceDMReservation: mockReleaseWorkspaceDMReservation,
}));

vi.mock("@/lib/ops/worker-health", () => ({
  recordWorkerAlert: vi.fn(),
}));

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({
    add: mockQueueAdd,
  }),
  getRedisConnection: vi.fn(),
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
}));

vi.mock("bullmq", () => {
  function MockWorker(_name: string, processor: unknown) {
    (global as Record<string, unknown>).__dmWorkerProcessor = processor;
    return {
      on: vi.fn(),
      close: vi.fn(),
    };
  }
  return {
    Worker: MockWorker,
    UnrecoverableError: class UnrecoverableError extends Error {
      name = "UnrecoverableError";
    },
  };
});

import { createDMWorker } from "../lib/queue/dm-worker";
import { hashRecipientId } from "@/lib/tracking/server";

const usagePeriodStart = new Date("2026-05-01T00:00:00.000Z");

const mockAutomation = {
  id: "auto_789",
  workspaceId: "workspace_123",
  instagramAccountId: "ig_account_row_1",
  postId: "media_101",
  keywords: ["LINK", "PRICE"],
  dmMessage: "Hey {username}! Here is the link: https://example.com",
  isActive: true,
  wholeWordMatch: true,
  matchAnyPost: false,
  matchAnyWord: false,
  openingDmEnabled: false,
  openingDmMessage: null,
  openingDmButtonLabel: null,
  linkButtonLabel: null,
  publicReplyEnabled: false,
  publicReplyMessage: null,
  publicReplyMessages: [],
  instagramAccount: {
    id: "ig_account_row_1",
    instagramId: "ig_456",
    accessToken: "encrypted_token_abc",
  },
  workspace: {
    id: "workspace_123",
  },
  trackedLinks: [],
};

const mockJobData = {
  instagramAccountId: "ig_456",
  commentId: "comment_555",
  commentText: "I want the LINK!",
  commenterId: "commenter_999",
  commenterName: "commenter_user",
  mediaId: "media_101",
};

function getProcessor(): (job: {
  name?: string;
  data: typeof mockJobData | Record<string, unknown>;
  id: string;
  attemptsMade: number;
}) => Promise<void> {
  createDMWorker();
  return (global as Record<string, unknown>).__dmWorkerProcessor as (job: {
    name?: string;
    data: typeof mockJobData | Record<string, unknown>;
    id: string;
    attemptsMade: number;
  }) => Promise<void>;
}

function createMockJob(data: Record<string, unknown> = mockJobData) {
  return {
    data,
    id: "job_001",
    attemptsMade: 0,
  };
}

function createMockPostbackJob(
  data: Record<string, unknown> = {
    instagramAccountId: "ig_456",
    userId: "commenter_999",
    payload: "reveal:auto_789",
  }
) {
  return {
    name: "process-postback",
    data,
    id: "postback_job_001",
    attemptsMade: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.postbackDelivery.create.mockReset().mockResolvedValue({});
  mockPrisma.postbackDelivery.delete.mockReset().mockResolvedValue({});

  mockPrisma.automation.findMany.mockResolvedValue([mockAutomation]);
  mockPrisma.automation.findFirst.mockResolvedValue(null);
  mockPrisma.dmLog.findUnique.mockResolvedValue(null);
  mockPrisma.dmLog.create.mockResolvedValue({});
  // Two different lookups share findFirst: the cross-campaign private-reply
  // check (keyed on status SENT) and the postback's name lookup. Only the
  // latter should resolve by default, or every comment would look like a
  // duplicate of an already-answered one.
  mockPrisma.dmLog.findFirst.mockImplementation(
    async (args: { where?: { status?: string } } = {}) =>
      args.where?.status === "SENT" ? null : { commenterName: "commenter_user" }
  );
  mockPrisma.dmLog.upsert.mockResolvedValue({});
  mockPrisma.dmLog.update.mockReset().mockResolvedValue({});
  mockPrisma.dmLog.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mockPrisma.instagramAccount.findUnique.mockResolvedValue({
    workspaceId: "workspace_123",
  });
  mockPrisma.operationalEvent.create.mockResolvedValue({});
  mockDecryptToken.mockReturnValue("decrypted_token");
  mockMatchKeywords.mockReturnValue({ matched: true, matchedKeyword: "LINK" });
  mockReserveWorkspaceDMSend.mockResolvedValue({
    allowed: true,
    reserved: true,
    remaining: 100,
    limit: 2000,
    periodStart: usagePeriodStart,
  });
  mockReserveDMSlot.mockResolvedValue({
    allowed: true,
    currentCount: 11,
    remainingDMs: 179,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: true,
  });
  mockReleaseDMSlot.mockResolvedValue(0);
  mockReleaseWorkspaceDMReservation.mockResolvedValue({ count: 1 });
  mockSendPrivateReply.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_001",
  });
  mockSendPrivateReplyWithLinkButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_002",
  });
  mockSendPrivateReplyWithButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_003",
  });
  mockSendDirectMessageWithButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_004",
  });
  mockSendDirectMessage.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_005",
  });
  mockSendDirectMessageWithLinkButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_006",
  });
  mockGetUserFollowStatus.mockResolvedValue(true);
  mockSendMessagePayload.mockResolvedValue({ recipient_id: "commenter_999", message_id: "msg_100" });
});


// ─── Custom DM buttons ──────────────────────────────────────────────────────

const buttonConfig = {
  version: 1,
  opening: [
    { id: "b_profile", type: "visit_profile", label: "Visit My Profile", enabled: true, url: "https://www.instagram.com/the_cinesuggest/" },
    { id: "b_follow", type: "follow_confirm", label: "I'm Following", enabled: true },
    { id: "b_off", type: "url", label: "Hidden", enabled: false, url: "https://example.com/off" },
  ],
  followPrompt: [
    { id: "b_profile2", type: "visit_profile", label: "Visit My Profile", enabled: true, url: "https://www.instagram.com/the_cinesuggest/" },
    { id: "b_follow2", type: "follow_confirm", label: "I've Followed", enabled: true },
  ],
  reveal: [
    { id: "b_movie", type: "url", label: "Watch Movie", enabled: true, url: "https://movies.example.com/1", track: true, trackedLinkSlug: "slug_movie" },
    { id: "b_tg", type: "url", label: "Join Telegram", enabled: true, url: "https://t.me/example", track: false },
  ],
};

const customAutomation = {
  ...mockAutomation,
  dmMessage: "Thanks for following! Here's your movie link 🎬",
  openingDmEnabled: true,
  openingDmMessage: "Hey! Follow us to unlock your movie link ❤️",
  openingDmButtonLabel: "I'm Following",
  requireFollow: true,
  followPromptMessage: "Oops! You're not following us yet. Please follow our profile first.",
  followPromptButtonLabel: "I've Followed",
  dmButtons: buttonConfig,
  trackedLinks: [{ slug: "slug_movie", label: "Watch Movie", destinationUrl: "https://movies.example.com/1" }],
};

describe("DM Worker — custom DM buttons", () => {
  it("sends the opening private reply with exactly the enabled buttons", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([customAutomation]);
    await getProcessor()(createMockJob());

    expect(mockSendPrivateReplyWithButton).not.toHaveBeenCalled();
    expect(mockSendMessagePayload).toHaveBeenCalledTimes(1);
    const [token, igId, recipient, message] = mockSendMessagePayload.mock.calls[0];
    expect(token).toBe("decrypted_token");
    expect(igId).toBe("ig_456");
    expect(recipient).toEqual({ comment_id: "comment_555" });
    expect(message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Hey! Follow us to unlock your movie link ❤️",
          buttons: [
            { type: "web_url", url: "https://www.instagram.com/the_cinesuggest/", title: "Visit My Profile" },
            { type: "postback", title: "I'm Following", payload: "followcheck:auto_789:open" },
          ],
        },
      },
    });
  });

  it("reveals with tracked and untracked URL buttons once the follow is confirmed", async () => {
    mockPrisma.automation.findFirst.mockResolvedValue(customAutomation);
    mockGetUserFollowStatus.mockResolvedValue(true);
    await getProcessor()(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "followcheck:auto_789:open",
        mid: "mid_1",
      })
    );

    expect(mockSendMessagePayload).toHaveBeenCalledTimes(1);
    const [, , recipient, message] = mockSendMessagePayload.mock.calls[0];
    expect(recipient).toEqual({ id: "commenter_999" });
    const payload = (message as { attachment: { payload: { text: string; buttons: { url: string; title: string }[] } } }).attachment.payload;
    expect(payload.text).toBe("Thanks for following! Here's your movie link 🎬");
    expect(payload.buttons.map((b) => b.title)).toEqual(["Watch Movie", "Join Telegram"]);
    expect(payload.buttons[0].url).toContain(`/r/slug_movie?r=${hashRecipientId("commenter_999")}`);
    expect(payload.buttons[1].url).toBe("https://t.me/example");
  });

  it("sends the custom follow prompt to someone who is not following", async () => {
    mockPrisma.automation.findFirst.mockResolvedValue(customAutomation);
    mockGetUserFollowStatus.mockResolvedValue(false);
    await getProcessor()(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "followcheck:auto_789:open",
        mid: "mid_2",
      })
    );

    expect(mockSendDirectMessageWithButton).not.toHaveBeenCalled();
    const [, , recipient, message] = mockSendMessagePayload.mock.calls[0];
    expect(recipient).toEqual({ id: "commenter_999" });
    expect(message).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Oops! You're not following us yet. Please follow our profile first.",
          buttons: [
            { type: "web_url", url: "https://www.instagram.com/the_cinesuggest/", title: "Visit My Profile" },
            { type: "postback", title: "I've Followed", payload: "followcheck:auto_789" },
          ],
        },
      },
    });
  });

  it("answers a quick reply tap with its own reply message", async () => {
    const withReply = {
      ...customAutomation,
      requireFollow: false,
      dmButtons: {
        ...buttonConfig,
        reveal: [
          { id: "b_more", type: "quick_reply", label: "More movies", enabled: true, action: "reply", replyText: "More coming soon, {username}!" },
        ],
      },
    };
    mockPrisma.automation.findFirst.mockResolvedValue(withReply);
    await getProcessor()(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "qr:auto_789:b_more",
        mid: "mid_3",
      })
    );

    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      "More coming soon, commenter_user!"
    );
    expect(mockSendMessagePayload).not.toHaveBeenCalled();
  });

  it("treats a send-link quick reply on the opening DM like the original opening button", async () => {
    const qrOpening = {
      ...customAutomation,
      requireFollow: false,
      dmButtons: {
        ...buttonConfig,
        opening: [{ id: "b_send", type: "quick_reply", label: "Send link", enabled: true, action: "reveal" }],
      },
    };
    mockPrisma.automation.findFirst.mockResolvedValue(qrOpening);
    await getProcessor()(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "qr:auto_789:b_send",
        mid: "mid_4",
      })
    );

    // Delivered the reveal, without a follow check (gate is off).
    expect(mockGetUserFollowStatus).not.toHaveBeenCalled();
    expect(mockSendMessagePayload).toHaveBeenCalledTimes(1);
    const [, , , message] = mockSendMessagePayload.mock.calls[0];
    expect((message as { attachment: { payload: { buttons: unknown[] } } }).attachment.payload.buttons).toHaveLength(2);
  });

  it("ignores a quick reply tap for a disabled or unknown button", async () => {
    mockPrisma.automation.findFirst.mockResolvedValue(customAutomation);
    await getProcessor()(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "qr:auto_789:b_off",
        mid: "mid_5",
      })
    );
    expect(mockSendMessagePayload).not.toHaveBeenCalled();
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("keeps the original flow for campaigns without custom buttons", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      { ...mockAutomation, openingDmEnabled: true, openingDmMessage: "Hi", openingDmButtonLabel: "Send link", requireFollow: false, dmButtons: null },
    ]);
    await getProcessor()(createMockJob());
    expect(mockSendMessagePayload).not.toHaveBeenCalled();
    expect(mockSendPrivateReplyWithButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hi",
      "Send link",
      "reveal:auto_789:open"
    );
  });
});
