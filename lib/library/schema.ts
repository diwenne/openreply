import { z } from "zod";

export const httpUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Only HTTP(S) links without credentials are supported");

/** A template is a content snapshot, never a serialized DB/account/token object. */
export const contentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  goal: z.string().max(120).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  excludedKeywords: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  matchAnyWord: z.boolean().default(false),
  wholeWordMatch: z.boolean().default(true),
  dmTriggerEnabled: z.boolean().default(false),
  priority: z.number().int().min(-1000).max(1000).default(0),
  dmMessage: z.string().max(1000).default(""),
  openingDmEnabled: z.boolean().default(false),
  openingDmMessage: z.string().max(1000).nullable().optional(),
  openingDmButtonLabel: z.string().max(64).nullable().optional(),
  linkButtonLabel: z.string().max(20).nullable().optional(),
  requireFollow: z.boolean().default(false),
  followPromptMessage: z.string().max(1000).nullable().optional(),
  followPromptButtonLabel: z.string().max(20).nullable().optional(),
  followUpEnabled: z.boolean().default(false),
  followUpMessage: z.string().max(1000).nullable().optional(),
  followUpDelayMinutes: z.number().int().min(0).max(1440).default(0),
  publicReplyEnabled: z.boolean().default(false),
  publicReplyMessage: z.string().max(1000).nullable().optional(),
  publicReplyMessages: z.array(z.string().max(1000)).max(10).default([]),
  trackedDestinationUrl: httpUrl.or(z.literal("")).nullable().optional(),
  secondaryDestinationUrl: httpUrl.or(z.literal("")).nullable().optional(),
  secondaryButtonLabel: z.string().max(20).nullable().optional(),
});
export const resourceSchema = z.object({
  description: z.string().max(2000).default(""),
  destinationUrl: httpUrl,
  dmMessage: z.string().max(1000).default(""),
  linkButtonLabel: z.string().max(20).default("Open resource"),
  category: z.enum(["CREATOR", "COMPANY", "CLIENT"]).default("CREATOR"),
});
