import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MetaApiError,
  PermissionError,
  RateLimitError,
  TokenExpiredError,
  sendPrivateReply,
} from "../lib/meta/client";

/**
 * What Meta's error subclasses keep from the error body.
 *
 * The subcode used to be dropped and the code replaced by the one the class is
 * named after, so a rejection that will always be refused (sub=2534025, "not
 * eligible for a private reply") looked the same as a transient one, and a
 * code 10 or 200 reached `isTemplateRejection` as a 100.
 */
describe("Meta API error classes", () => {
  it("keeps the subcode Meta sent", () => {
    expect(new PermissionError("m", "trace", 2534025).subcode).toBe(2534025);
    expect(new RateLimitError("m", "trace", 2207051).subcode).toBe(2207051);
    expect(new TokenExpiredError("m", "trace", 458).subcode).toBe(458);
  });

  it("keeps the code Meta sent, not the one the class is named after", () => {
    expect(new PermissionError("m", "trace", undefined, 200).code).toBe(200);
    expect(new RateLimitError("m", "trace", undefined, 4).code).toBe(4);
  });

  it("still defaults for a call site that passes neither", () => {
    expect(new PermissionError("m").code).toBe(100);
    expect(new RateLimitError("m").code).toBe(368);
    expect(new TokenExpiredError("m").code).toBe(190);
    expect(new PermissionError("m").subcode).toBeUndefined();
  });

  it("stays a MetaApiError, which is how callers narrow it", () => {
    expect(new PermissionError("m", "t", 2534025)).toBeInstanceOf(MetaApiError);
  });
});

describe("Meta error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Production body from a throttled account during a busy post.
  it("treats a 613 from /messages as a rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        url: "https://graph.instagram.com/v25.0/ig_1/messages",
        json: async () => ({
          error: {
            message: "The rate limit has exceeded. Please retry again after some time",
            type: "IGApiException",
            code: 613,
            error_subcode: 2534040,
          },
        }),
      })
    );

    const sent = sendPrivateReply("token", "ig_1", "comment_1", "hi");
    await expect(sent).rejects.toBeInstanceOf(RateLimitError);
    await expect(sent).rejects.toMatchObject({ code: 613, subcode: 2534040 });
  });
});
