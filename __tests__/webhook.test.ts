/**
 * Webhook — Unit Tests
 *
 * Tests signature verification and comment event parsing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifyWebhookSignature,
  parseCommentEvents,
  parseStoryReplyEvents,
  payloadContainsMessages,
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
      platform: "instagram",
      socialAccountId: "page_123",
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

  it("should parse a Facebook Page comment (feed field)", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "fb_page_123",
          time: 1234567890,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "fb_comment_456",
                post_id: "fb_post_101",
                message: "Paris",
                from: { id: "fb_user_789", name: "Jane Doe" },
              },
            },
          ],
        },
      ],
    };

    const events = parseCommentEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      platform: "facebook",
      socialAccountId: "fb_page_123",
      commentId: "fb_comment_456",
      commentText: "Paris",
      commenterId: "fb_user_789",
      commenterName: "Jane Doe",
      mediaId: "fb_post_101",
    });
  });

  it("should ignore Facebook feed changes that aren't a new comment", () => {
    const edited = {
      object: "page",
      entry: [
        {
          id: "fb_page_123",
          time: 1234567890,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "edited",
                comment_id: "fb_comment_456",
                post_id: "fb_post_101",
                message: "Paris",
                from: { id: "fb_user_789", name: "Jane Doe" },
              },
            },
          ],
        },
      ],
    };
    expect(parseCommentEvents(edited)).toHaveLength(0);

    const otherItem = {
      object: "page",
      entry: [
        {
          id: "fb_page_123",
          time: 1234567890,
          changes: [
            {
              field: "feed",
              value: {
                item: "reaction",
                verb: "add",
                post_id: "fb_post_101",
              },
            },
          ],
        },
      ],
    };
    expect(parseCommentEvents(otherItem)).toHaveLength(0);
  });

  it("should ignore the Facebook Page's own comments", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "fb_page_123",
          time: 1234567890,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "fb_comment_456",
                post_id: "fb_post_101",
                message: "thanks!",
                from: { id: "fb_page_123", name: "Our Page" },
              },
            },
          ],
        },
      ],
    };
    expect(parseCommentEvents(payload)).toHaveLength(0);
  });
});

function storyReplyPayload(
  message: Record<string, unknown>,
  senderId = "user_789"
) {
  return {
    object: "instagram",
    entry: [
      {
        id: "page_123",
        time: 1234567890,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: "page_123" },
            message,
          },
        ],
      },
    ],
  };
}

describe("parseStoryReplyEvents", () => {
  it("should parse a valid story reply", () => {
    const payload = storyReplyPayload({
      mid: "mid_1",
      text: "MAISON",
      reply_to: { story: { id: "story_42", url: "https://cdn.example/s.jpg" } },
    });

    const events = parseStoryReplyEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      socialAccountId: "page_123",
      senderId: "user_789",
      messageId: "mid_1",
      text: "MAISON",
      storyId: "story_42",
      storyUrl: "https://cdn.example/s.jpg",
    });
  });

  it("should ignore regular DMs that are not story replies", () => {
    const payload = storyReplyPayload({ mid: "mid_1", text: "hello there" });
    expect(parseStoryReplyEvents(payload)).toHaveLength(0);
  });

  it("should ignore echoes of the account's own messages", () => {
    const payload = storyReplyPayload({
      mid: "mid_1",
      text: "MAISON",
      is_echo: true,
      reply_to: { story: { id: "story_42" } },
    });
    expect(parseStoryReplyEvents(payload)).toHaveLength(0);
  });

  it("should ignore replies sent by the account itself", () => {
    const payload = storyReplyPayload(
      {
        mid: "mid_1",
        text: "MAISON",
        reply_to: { story: { id: "story_42" } },
      },
      "page_123"
    );
    expect(parseStoryReplyEvents(payload)).toHaveLength(0);
  });

  it("should ignore story replies without a message id", () => {
    const payload = storyReplyPayload({
      text: "MAISON",
      reply_to: { story: { id: "story_42" } },
    });
    expect(parseStoryReplyEvents(payload)).toHaveLength(0);
  });

  it("should parse replies with empty text so matching can decide later", () => {
    const payload = storyReplyPayload({
      mid: "mid_1",
      reply_to: { story: { id: "story_42" } },
    });

    const events = parseStoryReplyEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("");
  });

  it("should ignore non-instagram objects", () => {
    const payload = {
      ...storyReplyPayload({
        mid: "mid_1",
        text: "MAISON",
        reply_to: { story: { id: "story_42" } },
      }),
      object: "page",
    };
    expect(parseStoryReplyEvents(payload)).toHaveLength(0);
  });
});

describe("payloadContainsMessages", () => {
  it("should detect a user DM", () => {
    const payload = storyReplyPayload({ mid: "mid_1", text: "hello" });
    expect(payloadContainsMessages(payload)).toBe(true);
  });

  it("should detect echoes too — they also carry conversation content", () => {
    const payload = storyReplyPayload({
      mid: "mid_1",
      text: "our own reply",
      is_echo: true,
    });
    expect(payloadContainsMessages(payload)).toBe(true);
  });

  it("should not flag comment payloads", () => {
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
                text: "LINK",
                from: { id: "user_789", username: "test" },
                media: { id: "media_101" },
              },
            },
          ],
        },
      ],
    };
    expect(payloadContainsMessages(payload)).toBe(false);
  });

  it("should not flag postback payloads", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "page_123",
          time: 1234567890,
          messaging: [
            {
              sender: { id: "user_789" },
              recipient: { id: "page_123" },
              postback: { mid: "mid_1", payload: "reveal:abc" },
            },
          ],
        },
      ],
    };
    expect(payloadContainsMessages(payload)).toBe(false);
  });
});
