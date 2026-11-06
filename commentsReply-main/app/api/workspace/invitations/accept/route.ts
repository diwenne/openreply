import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { normalizeInvitationEmail } from "@/lib/workspace-invitations";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json(
      { success: false, error: "Sign in with the invited email first" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : null;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Missing invitation token" },
      { status: 400 }
    );
  }

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });
  if (!invitation || invitation.status !== "PENDING") {
    return NextResponse.json(
      { success: false, error: "Invitation is no longer available" },
      { status: 404 }
    );
  }

  if (invitation.expiresAt <= new Date()) {
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { success: false, error: "Invitation has expired" },
      { status: 410 }
    );
  }

  if (normalizeInvitationEmail(session.user.email) !== invitation.email) {
    return NextResponse.json(
      { success: false, error: "This invitation is for a different email" },
      { status: 403 }
    );
  }

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
        },
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId: session.user.id,
        role: invitation.role,
      },
      update: { role: invitation.role },
    }),
    prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      workspaceName: invitation.workspace.name,
    },
  });
}

