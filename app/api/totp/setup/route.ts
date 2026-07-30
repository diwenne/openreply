import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { encryptToken } from "@/lib/meta/oauth";
import { buildOtpauthUri, generateTotpSecret } from "@/lib/totp";

/**
 * Start TOTP enrollment: generate a secret (stored encrypted, NOT enabled
 * yet) and return the otpauth URI + QR. Enrollment completes in /confirm
 * once a correct code proves the authenticator holds the secret.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, totpEnabledAt: true },
  });

  if (user?.totpEnabledAt) {
    return NextResponse.json(
      { success: false, error: "Two-factor authentication is already enabled" },
      { status: 409 }
    );
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: encryptToken(secret) },
  });

  const otpauthUri = buildOtpauthUri(user?.email ?? "operator", secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    margin: 1,
    width: 220,
  });

  return NextResponse.json({
    success: true,
    data: { otpauthUri, qrDataUrl },
  });
}
