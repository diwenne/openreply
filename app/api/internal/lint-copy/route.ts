import { NextRequest, NextResponse } from "next/server";
import { lintText } from "@/lib/copy/copy-linter";

/**
 * Internal copy-lint endpoint — lets sibling services on this host (the
 * label-platform marketing calendar) lint human-written captions against the
 * YOYAKU voice rules without re-implementing the linter.
 *
 * POST { text: string, nouns?: string[] }
 *
 * When no fact-block nouns are supplied, the invented-noun rule is dropped:
 * without a fact block every real artist/label name would be a false
 * positive. All style rules (emoji, dashes, clichés, hooks, triads,
 * exclamations) still apply.
 *
 * Auth: Bearer CRON_SECRET (same contract as the cron routes — this API is
 * loopback-only in practice, nginx does not route /api/internal/*).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: { text?: unknown; nouns?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  const hasNouns = Array.isArray(body.nouns);
  const nouns = hasNouns
    ? (body.nouns as unknown[]).filter((n): n is string => typeof n === "string")
    : [];

  let violations = lintText(text, nouns);
  if (!hasNouns) {
    violations = violations.filter((v) => v.rule !== "invented-noun");
  }

  return NextResponse.json({
    success: true,
    data: { ok: violations.length === 0, violations },
  });
}
