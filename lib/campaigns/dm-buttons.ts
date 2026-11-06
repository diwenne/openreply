import type { Prisma } from "@/app/generated/prisma/client";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  DM_STAGES,
  isAdvancingButton,
  type DmButton,
  type DmButtonConfig,
} from "@/lib/dm-buttons/model";

/**
 * Keep only the fields each button type uses, trimmed. The tracked link slug
 * is kept here and re-checked against the campaign's links when syncing.
 */
export function normalizeDmButtonConfig(config: DmButtonConfig): DmButtonConfig {
  const normalize = (button: DmButton, revealStage: boolean): DmButton => {
    const base = {
      id: button.id,
      type: button.type,
      label: button.label.trim(),
      enabled: button.enabled,
    };
    switch (button.type) {
      case "visit_profile":
        return { ...base, url: button.url?.trim() ?? "" };
      case "url":
        return {
          ...base,
          url: button.url?.trim() ?? "",
          ...(revealStage
            ? {
                track: button.track !== false,
                ...(button.trackedLinkSlug ? { trackedLinkSlug: button.trackedLinkSlug } : {}),
              }
            : {}),
        };
      case "quick_reply": {
        const action = button.action ?? "reveal";
        return {
          ...base,
          action,
          ...(action === "reply" ? { replyText: button.replyText?.trim() ?? "" } : {}),
        };
      }
      case "follow_confirm":
        return base;
    }
  };
  return {
    version: 1,
    opening: config.opening.map((b) => normalize(b, false)),
    followPrompt: config.followPrompt.map((b) => normalize(b, false)),
    reveal: config.reveal.map((b) => normalize(b, true)),
  };
}

function isTrackedRevealButton(button: DmButton) {
  return button.type === "url" && button.track !== false;
}

/**
 * Make the campaign's tracked links match its reveal-stage URL buttons, one
 * link per tracked button, so clicks keep being counted and `{link}` in the
 * public reply keeps resolving. Returns the config with each tracked button's
 * slug filled in.
 *
 * A button keeps its link (and its click history) while its slug points at
 * one of this campaign's links; a slug from anywhere else is ignored and a
 * fresh link is created. Links no button refers to any more are removed, as
 * removing a link field always did.
 *
 * Enabled buttons are numbered first so the first link is one that is
 * actually sent. Call inside the transaction that updates the campaign.
 */
export async function syncDmButtonTrackedLinks(
  tx: Prisma.TransactionClient,
  {
    workspaceId,
    automationId,
    config,
  }: { workspaceId: string; automationId: string; config: DmButtonConfig }
): Promise<DmButtonConfig> {
  const existing = await tx.trackedLink.findMany({
    where: { automationId },
    orderBy: TRACKED_LINK_ORDER,
    select: { id: true, slug: true, label: true, destinationUrl: true, position: true },
  });
  const bySlug = new Map(existing.map((link) => [link.slug, link]));
  const used = new Set<string>();

  const tracked = config.reveal.filter(isTrackedRevealButton);
  const ordered = [
    ...tracked.filter((b) => b.enabled),
    ...tracked.filter((b) => !b.enabled),
  ];
  const slugFor = new Map<string, string>();

  for (const [position, button] of ordered.entries()) {
    const url = button.url ?? "";
    const current =
      button.trackedLinkSlug && !used.has(button.trackedLinkSlug)
        ? bySlug.get(button.trackedLinkSlug)
        : undefined;
    if (current) {
      used.add(current.slug);
      if (
        current.destinationUrl !== url ||
        current.label !== button.label ||
        current.position !== position
      ) {
        await tx.trackedLink.update({
          where: { id: current.id },
          data: { destinationUrl: url, label: button.label, position },
        });
      }
      slugFor.set(button.id, current.slug);
    } else {
      const slug = generateTrackedLinkSlug();
      await tx.trackedLink.create({
        data: {
          workspaceId,
          automationId,
          slug,
          label: button.label,
          destinationUrl: url,
          position,
        },
      });
      used.add(slug);
      slugFor.set(button.id, slug);
    }
  }

  const stale = existing.filter((link) => !used.has(link.slug));
  if (stale.length > 0) {
    await tx.trackedLink.deleteMany({
      where: { id: { in: stale.map((link) => link.id) } },
    });
  }

  return {
    ...config,
    reveal: config.reveal.map((button) => {
      if (button.type !== "url") return button;
      const { trackedLinkSlug: _previous, ...rest } = button;
      void _previous;
      const slug = slugFor.get(button.id);
      return slug ? { ...rest, trackedLinkSlug: slug } : rest;
    }),
  };
}

/**
 * Point every tracked button at the link with the same position in a copied
 * campaign, given the original's links and the copy's links in order.
 */
export function remapDmButtonSlugs(
  config: DmButtonConfig,
  originalSlugs: string[],
  copySlugs: string[]
): DmButtonConfig {
  const map = new Map(originalSlugs.map((slug, index) => [slug, copySlugs[index]]));
  const remap = (button: DmButton): DmButton => {
    if (!button.trackedLinkSlug) return button;
    const next = map.get(button.trackedLinkSlug);
    const { trackedLinkSlug: _old, ...rest } = button;
    void _old;
    return next ? { ...rest, trackedLinkSlug: next } : rest;
  };
  return {
    version: 1,
    opening: config.opening.map(remap),
    followPrompt: config.followPrompt.map(remap),
    reveal: config.reveal.map(remap),
  };
}

/**
 * The original single-label fields, filled from the custom buttons so CSV
 * export, reports and anything else reading them stay consistent.
 */
export function legacyLabelsFromDmButtons(config: DmButtonConfig) {
  const firstEnabled = (stage: (typeof DM_STAGES)[number], test: (b: DmButton) => boolean) =>
    config[stage].find((b) => b.enabled && test(b))?.label ?? null;
  return {
    openingDmButtonLabel: firstEnabled("opening", isAdvancingButton),
    followPromptButtonLabel: firstEnabled("followPrompt", (b) => b.type === "follow_confirm"),
    linkButtonLabel: firstEnabled("reveal", isTrackedRevealButton),
  };
}
