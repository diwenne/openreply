import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isTotpSatisfied } from "@/lib/totp";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabledAt: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      enabled: Boolean(user?.totpEnabledAt),
      verified: await isTotpSatisfied(),
    },
  });
}
