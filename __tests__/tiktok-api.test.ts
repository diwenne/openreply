import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTikTokAuthorizationUrl,
  hasRequiredTikTokScopes,
  listTikTokVideos,
  subscribeTikTokCommentWebhook,
} from "../lib/tiktok/api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("TIKTOK_APP_ID", "app_123");
  vi.stubEnv("TIKTOK_APP_SECRET", "secret_456");
  vi.stubEnv("NEXTAUTH_URL", "https://reply.example.com/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("TikTok API client", () => {
  it("builds the authorize URL with a slash-terminated redirect", () => {
    const url = new URL(getTikTokAuthorizationUrl("signed.state"));
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("app_123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://reply.example.com/api/tiktok/callback/");
    expect(url.searchParams.get("scope")).toBe(
      "user.info.basic,user.info.username,video.list,comment.list,comment.list.manage"
    );
    expect(url.searchParams.get("state")).toBe("signed.state");
  });

  it("requires both comment scopes to be granted", () => {
    expect(hasRequiredTikTokScopes("user.info.basic,comment.list,comment.list.manage")).toBe(true);
    expect(hasRequiredTikTokScopes("user.info.basic,comment.list")).toBe(false);
    expect(hasRequiredTikTokScopes("")).toBe(false);
  });

  it("subscribes the COMMENT webhook without an item_list", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"code":0,"message":"OK","data":{}}'));
    await subscribeTikTokCommentWebhook("https://reply.example.com/api/tiktok/webhook");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://business-api.tiktok.com/open_api/v1.3/business/webhook/update/");
    expect(JSON.parse(init.body)).toEqual({
      app_id: "app_123",
      secret: "secret_456",
      event_type: "COMMENT",
      callback_url: "https://reply.example.com/api/tiktok/webhook",
    });
  });

  it("falls back to the plural video list path and keeps ids exact", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"code":40008,"message":"not implemented"}'))
      .mockResolvedValueOnce(
        new Response(
          '{"code":0,"data":{"videos":[{"item_id":7203946942097902849,"caption":"hi","create_time":"1628461703"}],"cursor":1628461703000,"has_more":false}}'
        )
      );
    const result = await listTikTokVideos("token", "open");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/business/video/list/");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/business/videos/list/");
    expect(result.videos[0]).toMatchObject({ id: "7203946942097902849", caption: "hi" });

    // Later calls go straight to the path that worked.
    fetchMock.mockResolvedValueOnce(new Response('{"code":0,"data":{"videos":[]}}'));
    await listTikTokVideos("token", "open");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/business/videos/list/");
  });
});
