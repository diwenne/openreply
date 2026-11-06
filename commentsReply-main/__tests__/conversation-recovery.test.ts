import { afterEach, describe, expect, it, vi } from "vitest";
import { getConversations, MetaApiError } from "@/lib/meta/client";

const token = "test-token-not-for-logging";
const expanded = "participants,updated_time,messages.limit(1){message,from,created_time}";
const ok = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});
const failure = (code = 1) => new Response(JSON.stringify({
  error: { code, type: "OAuthException", message: "An unknown error has occurred.", fbtrace_id: "test-trace" },
}), { status: 400 });

/** Simulate the reported bad 42nd entry, including an unrelated message cursor. */
function installGraph(broken: number[] = [], total = 55, pageCap = 50) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://graph.instagram.com");
    expect(url.pathname).toMatch(/\/owner\/conversations$/);
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + token);
    const cursor = url.searchParams.get("after");
    expect(cursor).not.toBe("message-cursor");
    const start = cursor ? Number(cursor.replace("cursor-", "")) : 0;
    const count = Math.min(Number(url.searchParams.get("limit")), pageCap);
    const end = Math.min(total, start + count);
    const detailed = url.searchParams.get("fields") === expanded;
    if (detailed && broken.some((index) => index >= start && index < end)) return failure();
    const data = Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      return {
        id: "conversation-" + index,
        updated_time: "2026-09-14T12:00:00+0000",
        ...(detailed ? {
          participants: { data: [{ id: "owner" }, { id: "contact-" + index }] },
          messages: {
            data: [{ id: "message-" + index, message: "preview", from: { id: "contact-" + index } }],
            paging: { cursors: { after: "message-cursor" } },
          },
        } : {}),
      };
    });
    return ok({
      data,
      ...(end < total ? { paging: {
        // Must not be followed; only the outer cursor is used.
        next: "https://untrusted.example/never-fetch",
        cursors: { after: "cursor-" + end },
      } } : {}),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Instagram conversation recovery (upstream #60)", () => {
  it("keeps the healthy first 50 conversations on the one-request fast path", async () => {
    const fetchMock = installGraph();
    const result = await getConversations(token, "owner");
    expect(result).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.every((row) => !row.detailsUnavailable && row.participants)).toBe(true);
  });

  it("isolates the 42nd conversation and still includes entries 43 through 50", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = installGraph([41]);
    const result = await getConversations(token, "owner");
    expect(result.map((row) => row.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => "conversation-" + i)
    );
    expect(result[41]).toEqual({
      id: "conversation-41", updated_time: "2026-09-14T12:00:00+0000", detailsUnavailable: true,
    });
    expect(result[42].participants).toBeDefined();
    expect(result[49].messages).toBeDefined();
    expect(fetchMock.mock.calls.length).toBeLessThan(30);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    expect(JSON.stringify(warn.mock.calls)).toContain("test-trace");
  });

  it("handles consecutive unavailable conversations without dropping or duplicating them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    installGraph([0, 1, 2, 41, 42, 49]);
    const result = await getConversations(token, "owner");
    expect(result).toHaveLength(50);
    expect(new Set(result.map((row) => row.id)).size).toBe(50);
    expect(result.filter((row) => row.detailsUnavailable).map((row) => row.id))
      .toEqual([0, 1, 2, 41, 42, 49].map((i) => "conversation-" + i));
  });

  it("follows short pages using the outer cursor and stops when exhausted", async () => {
    const fetchMock = installGraph([], 13, 5);
    const result = await getConversations(token, "owner");
    expect(result).toHaveLength(13);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns an actually empty inbox without manufacturing placeholders", async () => {
    installGraph([], 0);
    expect(await getConversations(token, "owner")).toEqual([]);
  });

  it.each([190, 10, 100, 200, 4, 17, 368])("propagates Meta code %s without fallback", async (code) => {
    const fetchMock = vi.fn(async () => failure(code));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getConversations(token, "owner")).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not disguise network failures as a partial inbox", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getConversations(token, "owner")).rejects.toThrow("Network unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates failure of the minimal metadata request", async () => {
    const fetchMock = vi.fn(async () => failure());
    vi.stubGlobal("fetch", fetchMock);
    await expect(getConversations(token, "owner")).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchMock.mock.calls.length).toBeLessThan(10);
  });

  it("rejects repeating outer cursors instead of looping or returning a misleading partial list", async () => {
    const fetchMock = vi.fn(async () => ok({
      data: [{ id: "same" }],
      paging: { next: "https://untrusted.example", cursors: { after: "repeat" } },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getConversations(token, "owner")).rejects.toThrow("pagination did not advance");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a next page without an outer cursor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({
      data: [{ id: "first" }], paging: { next: "https://untrusted.example" },
    })));
    await expect(getConversations(token, "owner")).rejects.toThrow("pagination did not advance");
  });
});
