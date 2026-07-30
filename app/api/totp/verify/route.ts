import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { reserveTotpAttempt } from "@/lib/utils/login-rate-limiter";
import { grantTotpProof, hashBackupCode, verifyTotpCode } from "@/lib/totp";

/**
 * Verify the second factor for the current session. Accepts a TOTP code or a
 * backup code (consumed on use). Rate-limited — 6 digits brute-force
 * otherwise.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const attempt = await reserveTotpAttempt(session.user.id);
  if (!attempt.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSeconds) },
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabledAt: true, totpBackupCodes: true },
  });

  if (!user?.totpSecret || !user.totpEnabledAt) {
    return NextResponse.json(
      { success: false, error: "Two-factor authentication is not enabled" },
      { status: 409 }
    );
  }

  const { code } = (await request.json().catch(() => ({}))) as {
    code?: string;
  };
  if (!code) {
    return NextResponse.json(
      { success: false, error: "Invalid code" },
      { status: 401 }
    );
  }

  if (verifyTotpCode(code, decryptToken(user.totpSecret))) {
    await grantTotpProof();
    return NextResponse.json({ success: true });
  }

  // Backup code path — consume on use.
  const hashed = hashBackupCode(code);
  if (user.totpBackupCodes.includes(hashed)) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        totpBackupCodes: user.totpBackupCodes.filter((c) => c !== hashed),
      },
    });
    await grantTotpProof();
    return NextResponse.json({
      success: true,
      data: { usedBackupCode: true },
    });
  }

  return NextResponse.json(
    { success: false, error: "Invalid code" },
    { status: 401 }
  );
}
