import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/client", () => ({
  prisma: { zernioConnection: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => `decrypted:${value}`,
}));
import {
  createInstagramContext,
  sendPrivateReplyWithButton,
  sendDirectMessageWithLinkButton,
  getRecentMediaComments,
  getUserFollowStatus,
  getUserMedia,
} from "@/lib/instagram/provider";
import { zernioRequest } from "@/lib/zernio/client";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { prisma } from "@/lib/db/client";
const context = {
  provider: "ZERNIO" as const,
  apiKey: "secret",
  accountId: "selected",
  instagramId: "ig",
};
const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status })
  );
}
describe("Instagram provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  it("resolves only the selected account workspace credentials", async () => {
    vi.mocked(prisma.zernioConnection.findUnique).mockResolvedValue({
      apiKey: "encrypted",
    } as Awaited<ReturnType<typeof prisma.zernioConnection.findUnique>>);
    expect(
      await createInstagramContext({
        provider: "ZERNIO",
        workspaceId: "workspace",
        zernioAccountId: "selected",
        instagramId: "ig",
        accessToken: "",
      })
    ).toEqual({ ...context, apiKey: "decrypted:encrypted" });
    expect(prisma.zernioConnection.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "workspace" },
      select: { apiKey: true },
    });
  });
  it("sends postback private replies using Zernio button contracts", async () => {
    respond({ messageId: "mid" });
    await sendPrivateReplyWithButton({
      context,
      instagramAccountId: "ig",
      commentId: "comment",
      postId: "post",
      text: "hello",
      buttonTitle: "Reveal",
      payload: "reveal:campaign",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://zernio.com/api/v1/inbox/comments/post/comment/private-reply"
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      accountId: "selected",
      message: "hello",
      buttons: [
        { type: "postback", title: "Reveal", payload: "reveal:campaign" },
      ],
    });
  });
  it("sends URL buttons to the recipient IGSID without another send", async () => {
    respond({ data: { messageId: "mid" } });
    await sendDirectMessageWithLinkButton({
      context,
      instagramAccountId: "ig",
      userId: "recipient",
      text: "link",
      buttons: [{ title: "Open", url: "https://example.com" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/conversations/recipient/messages"
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).buttons[0].type).toBe(
      "url"
    );
  });
  it("follows comment cursors and preserves owner replies", async () => {
    respond({
      comments: [
        {
          id: "c",
          message: "yes",
          createdTime: "2026-09-01",
          from: { id: "person" },
          replies: [{ id: "r", from: { id: "ig" } }],
        },
      ],
      pagination: { hasMore: true, cursor: "next" },
    });
    respond({ comments: [], pagination: { hasMore: false } });
    const result = await getRecentMediaComments({
      context,
      mediaId: "post",
      sinceMs: 0,
    });
    expect(result[0].replies?.data?.[0].from?.id).toBe("ig");
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=next");
  });
  it("keeps unavailable follower status unknown", async () => {
    respond({ isFollower: null, unavailableReason: "consent_required" });
    expect(
      await getUserFollowStatus({ context, recipientId: "person" })
    ).toBeNull();
  });
  it("preserves direct Meta requests", async () => {
    respond({ data: [{ id: "media" }] });
    expect(
      await getUserMedia({
        context: { provider: "META", accessToken: "meta" },
        limit: 3,
      })
    ).toEqual([{ id: "media" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("graph.instagram.com");
  });
  it.each([
    [429, RateLimitError],
    [401, TokenExpiredError],
  ])(
    "classifies HTTP %i without leaking response secrets",
    async (status, ErrorType) => {
      respond({ error: "secret token" }, status);
      await expect(
        zernioRequest({ apiKey: "secret", path: "/accounts" })
      ).rejects.toBeInstanceOf(ErrorType);
      expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
    }
  );
});

it("uses only selected-account synced insights and never default zeros", async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  const { getMediaInsights } = await import("@/lib/instagram/provider");
  respond({
    platformAnalytics: [
      {
        platformPostId: "post",
        accountId: "other",
        analytics: { views: 900, lastUpdated: "2026-09-08" },
      },
      {
        platformPostId: "post",
        accountId: "selected",
        analytics: { views: 5, saves: 2, lastUpdated: "2026-09-08" },
      },
    ],
  });
  expect(
    await getMediaInsights({
      context,
      mediaId: "post",
      metrics: ["views", "saved"],
    })
  ).toEqual({ views: 5, saved: 2 });
  respond({
    platformAnalytics: [
      {
        platformPostId: "post",
        accountId: "selected",
        analytics: { views: 0, lastUpdated: null },
      },
    ],
  });
  await expect(
    getMediaInsights({ context, mediaId: "post", metrics: ["views"] })
  ).rejects.toThrow();
});
it("uses dated follower snapshots without manufacturing missing days", async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  const { getZernioFollowerSnapshots } = await import(
    "@/lib/instagram/provider"
  );
  respond({
    accountId: "selected",
    metrics: { follower_count: { total: 0, values: [] } },
  });
  expect(await getZernioFollowerSnapshots(context)).toEqual([]);
  respond({
    accountId: "selected",
    metrics: {
      follower_count: {
        values: [
          { date: "2026-09-06", value: 25 },
          { date: "2026-09-08", value: 29 },
        ],
      },
    },
  });
  expect(await getZernioFollowerSnapshots(context)).toEqual([
    { date: "2026-09-06", followers: 25 },
    { date: "2026-09-08", followers: 29 },
  ]);
});

it("recognizes Reels only from an explicit Instagram Reel permalink", async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  respond({
    posts: [
      {
        id: "reel",
        message: "caption",
        createdTime: "2026-09-08T12:00:00.000Z",
        mediaType: "video",
        permalink: "https://www.instagram.com/reel/abc/",
        picture: "https://example.com/picture.jpg",
        likeCount: 7,
        commentCount: 3,
      },
      {
        id: "video",
        message: "caption",
        createdTime: "2026-09-08T12:00:00.000Z",
        mediaType: "video",
        permalink: "https://www.instagram.com/p/def/",
      },
    ],
  });
  const media = await getUserMedia({ context });
  expect(media[0]).toMatchObject({
    id: "reel",
    media_product_type: "REELS",
    media_type: "VIDEO",
    like_count: 7,
    comments_count: 3,
  });
  expect(media[1].media_product_type).toBeUndefined();
});

it("adds a repeatable idempotency key and stops on an unconfirmed direct send", async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  const { ZernioDeliveryUnconfirmedError } = await import(
    "@/lib/zernio/client"
  );
  const input = {
    context: { ...context, operationId: "job:campaign" },
    instagramAccountId: "ig",
    userId: "recipient",
    text: "link",
    buttons: [{ title: "Open", url: "https://example.com" }],
  };
  respond({ data: { messageId: "sent" } });
  await sendDirectMessageWithLinkButton(input);
  respond({ data: { messageId: "sent" } });
  await sendDirectMessageWithLinkButton(input);
  expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBeTruthy();
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    fetchMock.mock.calls[0][1].headers["Idempotency-Key"]
  );
  fetchMock.mockRejectedValueOnce(new Error("connection reset"));
  await expect(sendDirectMessageWithLinkButton(input)).rejects.toBeInstanceOf(
    ZernioDeliveryUnconfirmedError
  );
});

it('treats a lost public-reply response as unconfirmed instead of safe to repeat', async () => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  const { sendCommentReply } = await import('@/lib/instagram/provider');
  fetchMock.mockRejectedValueOnce(new Error('connection reset'));
  await expect(sendCommentReply({ context, commentId: 'comment', postId: 'post', message: 'Thanks' })).rejects.toMatchObject({ name: 'ZernioDeliveryUnconfirmedError' });
  respond({ data: {} });
  await expect(sendCommentReply({ context, commentId: 'comment', postId: 'post', message: 'Thanks' })).rejects.toMatchObject({ name: 'ZernioDeliveryUnconfirmedError' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
