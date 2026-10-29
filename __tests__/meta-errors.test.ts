import { describe, expect, it } from "vitest";
import {
  MetaApiError,
  PermissionError,
  RateLimitError,
  TokenExpiredError,
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
