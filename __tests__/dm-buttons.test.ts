import { describe, expect, it } from "vitest";
import {
  deriveDmButtonsFromLegacy,
  parseDmButtonConfig,
  type DmButton,
  type DmButtonConfig,
} from "@/lib/dm-buttons/model";
import {
  buildStageMessage,
  parseQuickReplyPayload,
  toInlineFallbackText,
  toMetaMessage,
} from "@/lib/dm-buttons/payload";
import { hasBlockingIssues, validateDmButtonConfig } from "@/lib/dm-buttons/validate";
import { parseMessageEvents, parsePostbackEvents } from "@/lib/meta/webhook";
import { remapDmButtonSlugs, legacyLabelsFromDmButtons, normalizeDmButtonConfig } from "@/lib/campaigns/dm-buttons";

const qr = (id: string, label = "Option", extra: Partial<DmButton> = {}): DmButton => ({
  id,
  type: "quick_reply",
  label,
  enabled: true,
  action: "reveal",
  ...extra,
});
const url = (id: string, extra: Partial<DmButton> = {}): DmButton => ({
  id,
  type: "url",
  label: "Open",
  enabled: true,
  url: "https://example.com",
  ...extra,
});

function config(partial: Partial<DmButtonConfig>): DmButtonConfig {
  return { version: 1, opening: [], followPrompt: [], reveal: [], ...partial };
}

describe("buildStageMessage", () => {
  it("sends plain text when no button is enabled", () => {
    const message = buildStageMessage({
      stage: "reveal",
      buttons: [url("a", { enabled: false })],
      text: "hi",
      automationId: "c1",
      channel: "direct",
    });
    expect(message).toEqual({ kind: "text", text: "hi" });
    expect(toMetaMessage(message)).toEqual({ text: "hi" });
  });

  it("uses real quick replies in a regular DM when every button is a quick reply", () => {
    const message = buildStageMessage({
      stage: "reveal",
      buttons: [qr("a", "Yes"), qr("b", "No", { action: "reply", replyText: "ok" })],
      text: "Pick one",
      automationId: "c1",
      channel: "direct",
    });
    expect(toMetaMessage(message)).toEqual({
      text: "Pick one",
      quick_replies: [
        { content_type: "text", title: "Yes", payload: "qr:c1:a" },
        { content_type: "text", title: "No", payload: "qr:c1:b" },
      ],
    });
  });

  it("sends quick replies as postback buttons in a private reply", () => {
    const message = buildStageMessage({
      stage: "opening",
      buttons: [qr("a", "Send link")],
      text: "Hey",
      automationId: "c1",
      channel: "private_reply",
    });
    expect(message.kind).toBe("buttons");
    expect(toMetaMessage(message)).toEqual({
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Hey",
          buttons: [{ type: "postback", title: "Send link", payload: "qr:c1:a" }],
        },
      },
    });
  });

  it("sends quick replies as postback buttons for Zernio and when mixed with links", () => {
    for (const [buttons, provider] of [
      [[qr("a")], "ZERNIO"],
      [[qr("a"), url("b")], "META"],
    ] as const) {
      const message = buildStageMessage({
        stage: "reveal",
        buttons: [...buttons],
        text: "x",
        automationId: "c1",
        channel: "direct",
        provider,
      });
      expect(message.kind).toBe("buttons");
    }
  });

  it("gives Follow Confirmation the original follow-gate payloads", () => {
    const follow: DmButton = { id: "f", type: "follow_confirm", label: "I'm Following", enabled: true };
    const opening = buildStageMessage({ stage: "opening", buttons: [follow], text: "x", automationId: "c1", channel: "private_reply" });
    const prompt = buildStageMessage({ stage: "followPrompt", buttons: [follow], text: "x", automationId: "c1", channel: "direct" });
    expect(opening.kind === "buttons" && opening.buttons[0]).toMatchObject({ type: "postback", payload: "followcheck:c1:open" });
    expect(prompt.kind === "buttons" && prompt.buttons[0]).toMatchObject({ type: "postback", payload: "followcheck:c1" });
  });

  it("caps template text at 640 chars and resolves URLs through the callback", () => {
    const message = buildStageMessage({
      stage: "reveal",
      buttons: [url("a")],
      text: "y".repeat(700),
      automationId: "c1",
      channel: "direct",
      resolveUrl: () => "https://tracked.example/r/abc",
    });
    expect(message.kind === "buttons" && message.text.length).toBe(640);
    expect(toInlineFallbackText(message)).toBe(`${"y".repeat(640)}\nhttps://tracked.example/r/abc`);
  });

  it("parses quick reply payloads", () => {
    expect(parseQuickReplyPayload("qr:c1:b2")).toEqual({ automationId: "c1", buttonId: "b2" });
    expect(parseQuickReplyPayload("reveal:c1")).toBeNull();
    expect(parseQuickReplyPayload("qr:c1")).toBeNull();
  });
});

describe("validateDmButtonConfig", () => {
  const context = { openingDmEnabled: true, requireFollow: true };

  it("accepts the follow-to-unlock example flow", () => {
    const issues = validateDmButtonConfig(
      config({
        opening: [
          { id: "p", type: "visit_profile", label: "Visit My Profile", enabled: true, url: "https://www.instagram.com/the_cinesuggest/" },
          { id: "f", type: "follow_confirm", label: "I'm Following", enabled: true },
        ],
        followPrompt: [
          { id: "p2", type: "visit_profile", label: "Visit My Profile", enabled: true, url: "https://www.instagram.com/the_cinesuggest/" },
          { id: "f2", type: "follow_confirm", label: "I've Followed", enabled: true },
        ],
        reveal: [url("m", { label: "Watch Movie" }), url("t", { label: "Join Telegram", url: "https://t.me/x" })],
      }),
      context
    );
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("blocks more than 3 buttons in a button template", () => {
    const issues = validateDmButtonConfig(
      config({
        opening: [qr("a"), url("b"), url("c"), url("d")],
        followPrompt: [{ id: "f", type: "follow_confirm", label: "ok", enabled: true }],
      }),
      context
    );
    expect(issues.find((i) => i.code === "too_many_template_buttons")).toMatchObject({ level: "error", stage: "opening" });
  });

  it("allows up to 13 quick replies only in a regular DM", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => qr(`q${i}`));
    const ok = validateDmButtonConfig(
      config({ opening: [qr("o")], followPrompt: [qr("f")], reveal: thirteen }),
      { openingDmEnabled: true, requireFollow: false }
    );
    expect(ok.some((i) => i.level === "error")).toBe(false);

    // Without an opening DM the link DM is the private reply: template, max 3.
    const privateReply = validateDmButtonConfig(config({ reveal: thirteen }), {
      openingDmEnabled: false,
      requireFollow: false,
    });
    expect(privateReply.some((i) => i.code === "too_many_template_buttons")).toBe(true);
    expect(privateReply.some((i) => i.code === "quick_reply_as_postback")).toBe(true);
  });

  it("ignores disabled buttons for limits but still checks their fields", () => {
    const issues = validateDmButtonConfig(
      config({
        opening: [qr("a"), url("b"), url("c"), url("d", { enabled: false, url: "not a url" })],
        followPrompt: [{ id: "f", type: "follow_confirm", label: "ok", enabled: true }],
      }),
      context
    );
    expect(issues.some((i) => i.code === "too_many_template_buttons")).toBe(false);
    expect(issues.find((i) => i.buttonId === "d")?.code).toBe("url_invalid");
  });

  it("requires a way forward from the opening DM and follow prompt", () => {
    const issues = validateDmButtonConfig(config({ opening: [url("a")], followPrompt: [url("b")] }), context);
    expect(issues.filter((i) => i.code === "no_advancing_button").map((i) => i.stage)).toEqual(["opening", "followPrompt"]);
  });

  it("flags empty labels, missing URLs and missing reply text", () => {
    const issues = validateDmButtonConfig(
      config({ reveal: [url("a", { label: " ", url: "" }), qr("b", "x", { action: "reply", replyText: "" })] }),
      { openingDmEnabled: false, requireFollow: false }
    );
    expect(issues.filter((i) => i.level === "error").map((i) => i.code).sort()).toEqual(
      ["label_required", "reply_text_required", "url_required"].sort()
    );
  });

  it("only validates stages the campaign sends", () => {
    const issues = validateDmButtonConfig(config({ opening: [url("a", { url: "" })] }), {
      openingDmEnabled: false,
      requireFollow: false,
    });
    expect(hasBlockingIssues(issues)).toBe(false);
  });
});

describe("stored config", () => {
  it("falls back to the original flow for missing or malformed configs", () => {
    expect(parseDmButtonConfig(null)).toBeNull();
    expect(parseDmButtonConfig({ version: 2 })).toBeNull();
    expect(parseDmButtonConfig({ version: 1, opening: [{ id: "a" }], followPrompt: [], reveal: [] })).toBeNull();
  });

  it("derives buttons equivalent to the original fixed buttons", () => {
    const derived = deriveDmButtonsFromLegacy({
      openingDmButtonLabel: "Send link",
      requireFollow: false,
      linkButtonLabel: "Get it",
      trackedLinks: [
        { slug: "s1", label: "Primary campaign link", destinationUrl: "https://a.example" },
        { slug: "s2", label: "Second", destinationUrl: "https://b.example" },
      ],
    });
    expect(derived.opening).toMatchObject([{ type: "quick_reply", label: "Send link", action: "reveal" }]);
    expect(derived.reveal).toMatchObject([
      { type: "url", label: "Get it", url: "https://a.example", trackedLinkSlug: "s1" },
      { type: "url", label: "Second", url: "https://b.example", trackedLinkSlug: "s2" },
    ]);
  });

  it("normalizes per type, remaps slugs for copies and mirrors labels", () => {
    const normalized = normalizeDmButtonConfig(
      config({
        opening: [{ ...qr("a", " Go "), url: "https://stray.example", track: true }],
        reveal: [url("r", { trackedLinkSlug: "old", label: "Watch" })],
      })
    );
    expect(normalized.opening[0]).toEqual({ id: "a", type: "quick_reply", label: "Go", enabled: true, action: "reveal" });
    expect(normalized.reveal[0]).toMatchObject({ track: true, trackedLinkSlug: "old" });
    expect(remapDmButtonSlugs(normalized, ["old"], ["new"]).reveal[0].trackedLinkSlug).toBe("new");
    expect(legacyLabelsFromDmButtons(normalized)).toEqual({
      openingDmButtonLabel: "Go",
      followPromptButtonLabel: null,
      linkButtonLabel: "Watch",
    });
  });
});

describe("quick reply webhooks", () => {
  const payload = (message: Record<string, unknown>) => ({
    object: "instagram",
    entry: [
      {
        id: "ig1",
        time: 1,
        messaging: [{ sender: { id: "person1" }, recipient: { id: "ig1" }, message }],
      },
    ],
  });

  it("routes a tap on our quick reply as a postback, not a keyword message", () => {
    const tap = payload({ mid: "m1", text: "Send link", quick_reply: { payload: "qr:c1:b1" } });
    expect(parsePostbackEvents(tap)).toEqual([
      { instagramAccountId: "ig1", userId: "person1", payload: "qr:c1:b1", mid: "m1" },
    ]);
    expect(parseMessageEvents(tap)).toEqual([]);
  });

  it("leaves other quick replies and plain messages as messages", () => {
    const other = payload({ mid: "m2", text: "LINK", quick_reply: { payload: "SOMETHING_ELSE" } });
    expect(parsePostbackEvents(other)).toEqual([]);
    expect(parseMessageEvents(other)).toHaveLength(1);
  });
});

describe("syncDmButtonTrackedLinks", () => {
  type Row = { id: string; slug: string; label: string | null; destinationUrl: string; position: number };
  function fakeTx(rows: Row[]) {
    let next = 0;
    const tx = {
      trackedLink: {
        findMany: async () => [...rows].sort((a, b) => a.position - b.position),
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          Object.assign(rows.find((r) => r.id === where.id)!, data);
        },
        create: async ({ data }: { data: Omit<Row, "id"> }) => {
          rows.push({ id: `new${next++}`, ...data });
        },
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          for (const id of where.id.in) rows.splice(rows.findIndex((r) => r.id === id), 1);
        },
      },
    };
    return tx as unknown as Parameters<typeof import("@/lib/campaigns/dm-buttons").syncDmButtonTrackedLinks>[0];
  }

  it("keeps a button's link, creates missing ones, drops unused ones and numbers enabled first", async () => {
    const { syncDmButtonTrackedLinks } = await import("@/lib/campaigns/dm-buttons");
    const rows: Row[] = [
      { id: "l1", slug: "keep", label: "Old", destinationUrl: "https://old.example", position: 0 },
      { id: "l2", slug: "gone", label: "Gone", destinationUrl: "https://gone.example", position: 1 },
    ];
    const result = await syncDmButtonTrackedLinks(fakeTx(rows), {
      workspaceId: "w",
      automationId: "c",
      config: config({
        reveal: [
          url("off", { enabled: false, track: true, url: "https://off.example" }),
          url("kept", { track: true, trackedLinkSlug: "keep", label: "Watch", url: "https://new.example" }),
          url("foreign", { track: true, trackedLinkSlug: "someone-elses", url: "https://f.example" }),
          url("raw", { track: false }),
        ],
      }),
    });

    expect(rows.find((r) => r.slug === "gone")).toBeUndefined();
    expect(rows.find((r) => r.slug === "keep")).toMatchObject({
      label: "Watch",
      destinationUrl: "https://new.example",
      position: 0,
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const foreignSlug = result.reveal.find((b) => b.id === "foreign")!.trackedLinkSlug!;
    expect(foreignSlug).not.toBe("someone-elses");
    expect(bySlug.get(foreignSlug)?.position).toBe(1);
    expect(bySlug.get(result.reveal.find((b) => b.id === "off")!.trackedLinkSlug!)?.position).toBe(2);
    expect(result.reveal.find((b) => b.id === "raw")!.trackedLinkSlug).toBeUndefined();
    expect(rows).toHaveLength(3);
  });
});
