import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe";
import { canManageBilling, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export async function POST() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageBilling(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only workspace owners can manage billing" },
      { status: 403 }
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: context.workspaceId },
    select: { stripeCustomerId: true },
  });

  if (!workspace?.stripeCustomerId) {
    return NextResponse.json(
      { success: false, error: "No Stripe customer exists yet" },
      { status: 400 }
    );
  }

  const portal = await getStripe().billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${getBaseUrl()}/settings`,
  });

  return NextResponse.json({ success: true, url: portal.url });
}
