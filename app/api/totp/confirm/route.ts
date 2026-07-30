import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  generateBackupCodes,
  grantTotpProof,
  hashBackupCode,
  verifyTotpCode,
} from "@/lib/totp";

/**
 * Complete TOTP enrollment: a correct code enables 2FA, issues the proof for
 * the current session, and returns the backup codes — shown exactly once,
 * only their hashes are stored.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabledAt: true },
  });

  if (!user?.totpSecret || user.totpEnabledAt) {
    return NextResponse.json(
      { success: false, error: "No enrollment in progress" },
      { status: 409 }
    );
  }

  const { code } = (await request.json().catch(() => ({}))) as {
    code?: string;
  };
  if (!code || !verifyTotpCode(code, decryptToken(user.totpSecret))) {
    return NextResponse.json(
      { success: false, error: "Invalid code" },
      { status: 401 }
    );
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      totpEnabledAt: new Date(),
      totpBackupCodes: backupCodes.map(hashBackupCode),
    },
  });

  await grantTotpProof();

  return NextResponse.json({ success: true, data: { backupCodes } });
}
