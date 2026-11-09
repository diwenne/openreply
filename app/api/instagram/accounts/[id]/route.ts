import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  MAX_REPLY_DELAY_SECONDS,
  normalizeDelayRange,
} from "@/lib/queue/reply-delay";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const delaySchema = z.object({
  publicReplyDelayMinSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_REPLY_DELAY_SECONDS),
  publicReplyDelayMaxSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_REPLY_DELAY_SECONDS),
  dmDelayMinSeconds: z.number().int().min(0).max(MAX_REPLY_DELAY_SECONDS),
  dmDelayMaxSeconds: z.number().int().min(0).max(MAX_REPLY_DELAY_SECONDS),
});

type RouteProps = { params: Promise<{ id: string }> };

/**
 * Reply pacing for one connected account. Both legs take a range in seconds;
 * the worker-facing part draws a value from it per comment (see
 * lib/queue/reply-delay.ts), so an account never answers on a fixed interval.
 */
export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      {
        success: false,
        error: "Only owners and admins can change reply timing",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = delaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Delays must be whole seconds between 0 and ${MAX_REPLY_DELAY_SECONDS}`,
      },
      { status: 400 }
    );
  }

  const publicReply = normalizeDelayRange({
    minSeconds: parsed.data.publicReplyDelayMinSeconds,
    maxSeconds: parsed.data.publicReplyDelayMaxSeconds,
  });
  const dm = normalizeDelayRange({
    minSeconds: parsed.data.dmDelayMinSeconds,
    maxSeconds: parsed.data.dmDelayMaxSeconds,
  });

  // Scoped by workspace, so an id from another workspace updates nothing.
  const result = await prisma.instagramAccount.updateMany({
    where: { id, workspaceId: context.workspaceId },
    data: {
      publicReplyDelayMinSeconds: publicReply.minSeconds,
      publicReplyDelayMaxSeconds: publicReply.maxSeconds,
      dmDelayMinSeconds: dm.minSeconds,
      dmDelayMaxSeconds: dm.maxSeconds,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      publicReplyDelayMinSeconds: publicReply.minSeconds,
      publicReplyDelayMaxSeconds: publicReply.maxSeconds,
      dmDelayMinSeconds: dm.minSeconds,
      dmDelayMaxSeconds: dm.maxSeconds,
    },
  });
}
