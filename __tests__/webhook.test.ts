/**
 * Webhook — Unit Tests
 *
 * Tests signature verification and comment event parsing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyWebhookSignature,
  parseCommentEvents,
  parseFacebookCommentEvents,
  parseMessageEvents,
  parseFacebookMessageEvents,
} from "../lib/meta/webhook";
import { createHmac } from "crypto";

// Mock the environment variable
beforeEach(() => {
  vi.stubEnv("FACEBOOK_APP_SECRET", "test_app_secret_12345");
});

describe("verifyWebhookSignature", () => {
  function createSignature(payload: string, secret: string): string {
    return (
      "sha256=" + createHmac("sha256", secret).update(payload).digest("hex")
    );
  }

  it("should return true for valid signature", () => {
    const payload = '{"test": "data"}';
    const signature = createSignature(payload, "test_app_secret_12345");
    expect(verifyWebhookSignature(payload, signature)).toBe(true);
  });

  it("should return false for invalid signature", () => {
    const payload = '{"test": "data"}';
    const signature = "sha256=invalid_signature_here";
    expect(verifyWebhookSignature(payload, signature)).toBe(false);
  });

  it("should return false for null signature", () => {
    expect(verifyWebhookSignature('{"test": "data"}', null)).toBe(false);
  });

  it("should return false for empty signature", () => {
    expect(verifyWebhookSignature('{"test": "data"}', "")).toBe(false);
  });

  it("should return false when payload is tampered", () => {
    const originalPayload = '{"test": "data"}';
    const signature = createSignature(originalPayload, "test_app_secret_12345");
    const tamperedPayload = '{"test": "tampered"}';
    expect(verifyWebhookSignature(tamperedPayload, signature)).toBe(false);
  });

  it("should return false when signed with wrong secret", () => {
    const payload = '{"test": "data"}';
    const signature = createSignature(payload, "wrong_secret");
    expect(verifyWebhookSignature(payload, signature)).toBe(false);
  });
});

describe("parseCommentEvents", () => {
  it("should parse a valid comment event", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "I want the LINK!",
                from: {
                  id: "user_789",
                  username: "testuser",
                },
                media: {
                  id: "media_101",
                },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      instagramAccountId: "page_123",
      commentId: "comment_456",
      commentText: "I want the LINK!",
      commenterId: "user_789",
      commenterName: "testuser",
      mediaId: "media_101",
    });
  });

  it("should ignore non-instagram objects", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_456",
                text: "hello",
                from: { id: "user_789", username: "test" },
                media: { id: "media_101" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });

  it("should ignore non-comment fields", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "messages",
              value: {
                id: "msg_456",
                text: "hello",
                from: { id: "user_789", username: "test" },
                media: { id: "media_101" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });

  it("should handle multiple comment events in one payload", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "user_1", username: "user1" },
                media: { id: "media_1" },
              },
            },
            {
              field: "comments",
              value: {
                id: "comment_2",
                text: "PRICE",
                from: { id: "user_2", username: "user2" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(2);
  });

  it("should parse events with empty text so matching can decide later", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "", // empty text
                from: { id: "user_1", username: "user1" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].commentText).toBe("");
  });

  it("should ignore comments from the connected account itself", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "page_123", username: "ourbrand" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    expect(parseCommentEvents(payload)).toHaveLength(0);
  });

  it("should still parse other users' comments alongside a self-comment", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "LINK",
                from: { id: "page_123", username: "ourbrand" },
                media: { id: "media_1" },
              },
            },
            {
              field: "comments",
              value: {
                id: "comment_2",
                text: "LINK",
                from: { id: "user_2", username: "user2" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].commenterId).toBe("user_2");
  });

  it("should ignore replies to other comments (private reply invalid)", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          changes: [
            {
              field: "comments",
              value: {
                id: "reply_1",
                // Instagram prefixes an @mention when you reply in a thread.
                text: "@someone niets ontvangen",
                parent_id: "comment_1",
                from: { id: "user_9", username: "user9" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };

    expect(parseCommentEvents(payload)).toHaveLength(0);
  });

  it("should handle entries without changes", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          // no changes field
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(0);
  });
});

describe("parseFacebookCommentEvents", () => {
  function pageComment(overrides = {}) {
    return {
      object: "page",
      entry: [
        {
          id: "page_1",
          time: 1,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "c_1",
                post_id: "post_1",
                message: "please send link",
                from: { id: "user_1", name: "Jane" },
                ...overrides,
              },
            },
          ],
        },
      ],
    };
  }

  it("parses a valid page feed comment", () => {
    const events = parseFacebookCommentEvents(pageComment() as never);
    expect(events).toEqual([
      {
        instagramAccountId: "page_1",
        commentId: "c_1",
        commentText: "please send link",
        commenterId: "user_1",
        commenterName: "Jane",
        mediaId: "post_1",
      },
    ]);
  });

  it("ignores non-page objects", () => {
    const events = parseFacebookCommentEvents({
      object: "instagram",
      entry: [],
    } as never);
    expect(events).toHaveLength(0);
  });

  it("ignores non-add verbs (edits, removes)", () => {
    const events = parseFacebookCommentEvents(
      pageComment({ verb: "edited" }) as never
    );
    expect(events).toHaveLength(0);
  });

  it("ignores non-comment feed items (likes, statuses)", () => {
    const events = parseFacebookCommentEvents(
      pageComment({ item: "like" }) as never
    );
    expect(events).toHaveLength(0);
  });

  it("skips the Page's own comment", () => {
    const events = parseFacebookCommentEvents(
      pageComment({ from: { id: "page_1", name: "The Page" } }) as never
    );
    expect(events).toHaveLength(0);
  });
});

describe("parseMessageEvents", () => {
  function igMessage(message: Record<string, unknown>, ts = 1700000000000) {
    return {
      object: "instagram",
      entry: [
        {
          id: "acct_1",
          time: ts,
          messaging: [
            {
              sender: { id: "user_1" },
              recipient: { id: "acct_1" },
              timestamp: ts,
              message,
            },
          ],
        },
      ],
    };
  }

  it("parses a plain DM as a non-story message", () => {
    const events = parseMessageEvents(
      igMessage({ mid: "m_1", text: "hi there" }) as never
    );
    expect(events).toEqual([
      {
        instagramAccountId: "acct_1",
        senderId: "user_1",
        text: "hi there",
        mid: "m_1",
        isStoryReply: false,
        timestamp: 1700000000000,
      },
    ]);
  });

  it("flags a story reply via reply_to.story", () => {
    const events = parseMessageEvents(
      igMessage({
        mid: "m_2",
        text: "love this!",
        reply_to: { story: { id: "s_1", url: "https://..." } },
      }) as never
    );
    expect(events).toHaveLength(1);
    expect(events[0].isStoryReply).toBe(true);
  });

  it("does NOT flag a reply to a normal message as a story reply", () => {
    const events = parseMessageEvents(
      igMessage({ mid: "m_3", text: "ok", reply_to: { mid: "m_prev" } }) as never
    );
    expect(events[0].isStoryReply).toBe(false);
  });

  it("skips echoes of our own sends (is_echo)", () => {
    const events = parseMessageEvents(
      igMessage({ mid: "m_4", text: "welcome!", is_echo: true }) as never
    );
    expect(events).toHaveLength(0);
  });

  it("skips the account's own messages (sender === recipient)", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "acct_1",
          messaging: [
            {
              sender: { id: "acct_1" },
              recipient: { id: "acct_1" },
              message: { mid: "m_5", text: "x" },
            },
          ],
        },
      ],
    };
    expect(parseMessageEvents(payload as never)).toHaveLength(0);
  });

  it("skips postback-only entries (no message)", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "acct_1",
          messaging: [
            {
              sender: { id: "user_1" },
              recipient: { id: "acct_1" },
              postback: { mid: "m_6", payload: "reveal:auto_1" },
            },
          ],
        },
      ],
    };
    expect(parseMessageEvents(payload as never)).toHaveLength(0);
  });

  it("ignores page-object payloads", () => {
    const events = parseMessageEvents(
      igMessage({ mid: "m_7", text: "hi" }) as never
    );
    expect(events).toHaveLength(1);
    const asPage = { ...igMessage({ mid: "m_7", text: "hi" }), object: "page" };
    expect(parseMessageEvents(asPage as never)).toHaveLength(0);
  });
});

describe("parseFacebookMessageEvents", () => {
  function fbMessage(message: Record<string, unknown>, ts = 1700000000000) {
    return {
      object: "page",
      entry: [
        {
          id: "page_1",
          time: ts,
          messaging: [
            {
              sender: { id: "psid_1" },
              recipient: { id: "page_1" },
              timestamp: ts,
              message,
            },
          ],
        },
      ],
    };
  }

  it("parses a Messenger DM, never a story reply", () => {
    const events = parseFacebookMessageEvents(
      fbMessage({
        mid: "fm_1",
        text: "hello",
        // Even if a reply_to.story somehow appears, FB stays isStoryReply:false.
        reply_to: { story: { id: "s" } },
      }) as never
    );
    expect(events).toEqual([
      {
        instagramAccountId: "page_1",
        senderId: "psid_1",
        text: "hello",
        mid: "fm_1",
        isStoryReply: false,
        timestamp: 1700000000000,
      },
    ]);
  });

  it("skips is_echo and ignores instagram-object payloads", () => {
    expect(
      parseFacebookMessageEvents(
        fbMessage({ mid: "fm_2", text: "x", is_echo: true }) as never
      )
    ).toHaveLength(0);
    const asIg = { ...fbMessage({ mid: "fm_3", text: "x" }), object: "instagram" };
    expect(parseFacebookMessageEvents(asIg as never)).toHaveLength(0);
  });
});
