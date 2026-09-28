import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { normalizeParentCommentId, parseTikTokJson } from "../lib/tiktok/api";
import {
  parseTikTokWebhook,
  toTikTokCommentEvent,
  verifyTikTokSignature,
} from "../lib/tiktok/webhook";

const SECRET = "tiktok-app-secret";
const NOW_MS = 1_790_000_000_000;
const NOW_S = NOW_MS / 1000;

function sign(body: string, t: number, secret = SECRET) {
  const s = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},s=${s}`;
}

// A webhook exactly as TikTok sends it: `content` is a JSON string whose ids
// are bare 19-digit numbers, beyond Number.MAX_SAFE_INTEGER.
function commentWebhook(content: string, openId = "_000account") {
  return JSON.stringify({
    client_key: "app",
    event: "comment.update",
    create_time: NOW_S,
    user_openid: openId,
    content,
  });
}

const TOP_LEVEL =
  '{"comment_id":7247303576418566913,"video_id":7203946942097902849,"parent_comment_id":0,"comment_type":"comment","comment_action":"insert","unique_identifier":"+ABc","timestamp":1687394416109,"text":"IRAQ please"}';

describe("TikTok webhook signature", () => {
  const body = commentWebhook(TOP_LEVEL);

  it("accepts a fresh, correctly signed body", () => {
    expect(verifyTikTokSignature(body, sign(body, NOW_S - 10), SECRET, NOW_MS)).toBe(true);
  });

  it("accepts a header with spaces and an uppercase signature", () => {
    const [t, s] = sign(body, NOW_S).split(",");
    expect(
      verifyTikTokSignature(body, `${t}, ${s.toUpperCase().replace("S=", "s=")}`, SECRET, NOW_MS)
    ).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    const header = sign(body, NOW_S);
    expect(verifyTikTokSignature(body.replace("IRAQ", "IRAN"), header, SECRET, NOW_MS)).toBe(false);
  });

  it("rejects the wrong secret, a missing header and a missing secret", () => {
    expect(verifyTikTokSignature(body, sign(body, NOW_S, "other"), SECRET, NOW_MS)).toBe(false);
    expect(verifyTikTokSignature(body, null, SECRET, NOW_MS)).toBe(false);
    expect(verifyTikTokSignature(body, sign(body, NOW_S), undefined, NOW_MS)).toBe(false);
  });

  it("rejects stale and far-future timestamps", () => {
    expect(verifyTikTokSignature(body, sign(body, NOW_S - 301), SECRET, NOW_MS)).toBe(false);
    expect(verifyTikTokSignature(body, sign(body, NOW_S + 120), SECRET, NOW_MS)).toBe(false);
  });

  it("rejects malformed headers", () => {
    for (const header of ["", "garbage", "t=abc,s=00", `s=${"0".repeat(64)}`, `t=${NOW_S}`]) {
      expect(verifyTikTokSignature(body, header, SECRET, NOW_MS)).toBe(false);
    }
  });
});

describe("TikTok webhook parsing", () => {
  it("keeps 19-digit ids exact", () => {
    // What a plain JSON.parse does to the same id.
    expect(String(JSON.parse(TOP_LEVEL).comment_id)).not.toBe("7247303576418566913");

    const event = toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(TOP_LEVEL))!);
    expect(event).toEqual({
      openId: "_000account",
      commentId: "7247303576418566913",
      videoId: "7203946942097902849",
      text: "IRAQ please",
    });
  });

  it("does not rewrite id-looking text inside string values", () => {
    const parsed = parseTikTokJson<{ text: string; comment_id: string }>(
      '{"text":"see \\"comment_id\\":123","comment_id":7247303576418566913}'
    );
    expect(parsed.text).toBe('see "comment_id":123');
    expect(parsed.comment_id).toBe("7247303576418566913");
  });

  it("treats parent_comment_id 0 as no parent", () => {
    for (const value of [0, "0", null, undefined, ""]) {
      expect(normalizeParentCommentId(value)).toBeNull();
    }
    expect(normalizeParentCommentId("7247303576418566913")).toBe("7247303576418566913");
  });

  it("accepts a top-level comment with no comment_type and a 0 parent", () => {
    const content = TOP_LEVEL.replace(',"comment_type":"comment"', "");
    expect(toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(content))!)?.commentId).toBe(
      "7247303576418566913"
    );
  });

  it("ignores replies, including our own reply coming back", () => {
    const reply = TOP_LEVEL.replace('"parent_comment_id":0', '"parent_comment_id":7247303576418566913')
      .replace('"comment_id":7247303576418566913', '"comment_id":7250000000000000001')
      .replace('"comment_type":"comment"', '"comment_type":"reply"');
    expect(toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(reply))!)).toBeNull();

    // A reply that only carries a parent id is ignored too.
    const parentOnly = TOP_LEVEL.replace('"parent_comment_id":0', '"parent_comment_id":7247303576418566000')
      .replace(',"comment_type":"comment"', "");
    expect(toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(parentOnly))!)).toBeNull();
  });

  it("ignores deletes, visibility changes and other events", () => {
    for (const action of ["delete", "set_to_hidden", "set_to_public"]) {
      const content = TOP_LEVEL.replace('"insert"', `"${action}"`);
      expect(toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(content))!)).toBeNull();
    }
    const other = JSON.stringify({ event: "video.publish", user_openid: "x", content: TOP_LEVEL });
    expect(toTikTokCommentEvent(parseTikTokWebhook(other)!)).toBeNull();
  });

  it("leaves text undefined when TikTok omits it", () => {
    const content = TOP_LEVEL.replace(',"text":"IRAQ please"', "");
    expect(toTikTokCommentEvent(parseTikTokWebhook(commentWebhook(content))!)?.text).toBeUndefined();
  });

  it("survives malformed bodies and content", () => {
    expect(parseTikTokWebhook("not json")).toBeNull();
    const broken = parseTikTokWebhook(commentWebhook("{not json"));
    expect(broken?.content).toEqual({});
    expect(toTikTokCommentEvent(broken!)).toBeNull();
  });
});
