import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getBaseUrl, requireEnv } from "@/lib/env";
import { prisma } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe";
import {
  canManageBilling,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const checkoutSchema = z.object({
  plan: z.enum(["PRO", "AGENCY"]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const context = await getCurrentWorkspaceContext();

  if (!session?.user?.email || !context) {
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

  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid checkout plan" },
      { status: 400 }
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: context.workspaceId },
    select: { name: true, stripeCustomerId: true },
  });

  if (!workspace) {
    return NextResponse.json(
      { success: false, error: "Workspace not found" },
      { status: 404 }
    );
  }

  const stripe = getStripe();
  const priceId =
    parsed.data.plan === "AGENCY"
      ? requireEnv("STRIPE_PRICE_AGENCY")
      : requireEnv("STRIPE_PRICE_PRO");

  let customerId = workspace.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: workspace.name,
      metadata: { workspaceId: context.workspaceId },
    });
    customerId = customer.id;
    await prisma.workspace.update({
      where: { id: context.workspaceId },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: context.workspaceId,
    metadata: {
      workspaceId: context.workspaceId,
      plan: parsed.data.plan,
    },
    subscription_data: {
      metadata: {
        workspaceId: context.workspaceId,
        plan: parsed.data.plan,
      },
    },
    success_url: `${getBaseUrl()}/settings?billing=success`,
    cancel_url: `${getBaseUrl()}/settings?billing=cancelled`,
  });

  return NextResponse.json({ success: true, url: checkout.url });
}
