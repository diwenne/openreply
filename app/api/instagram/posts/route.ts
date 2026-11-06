import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getAllUserMedia, getUserMedia } from "@/lib/instagram/provider";
import { createInstagramContext } from "@/lib/instagram/provider";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Instagram account not connected. Please connect your account first.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = await createInstagramContext(account);

    // `all=true` paginates the full library (for the campaign post picker);
    // otherwise return a single recent page.
    const loadAll = request.nextUrl.searchParams.get("all") === "true";
    let posts;
    if (loadAll) {
      posts = await getAllUserMedia({ context: accessToken, max: 300 });
    } else {
      const limitParam = request.nextUrl.searchParams.get("limit");
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 25;
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 50)
        : 25;
      posts = await getUserMedia({ context: accessToken, limit: limit });
    }

    return NextResponse.json({
      success: true,
      data: posts,
      provider: account.provider,
      limitations:
        account.provider === "ZERNIO"
          ? ["Zernio returns the 25 most recent Instagram posts."]
          : [],
    });
  } catch (err) {
    console.error("[Instagram Posts] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Instagram posts" },
      { status: 500 }
    );
  }
}
