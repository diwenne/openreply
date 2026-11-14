import { decryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

export type InstagramContext =
  | {
      provider: "META";
      accessToken: string;
      instagramId: string;
      // The token came from Unified login, so calls go to graph.facebook.com.
      unifiedLogin: boolean;
    }
  | {
      provider: "ZERNIO";
      apiKey: string;
      accountId: string;
      instagramId: string;
      operationId?: string;
    };

export type ProviderAccount = {
  provider: "META" | "ZERNIO";
  metaLogin: "INSTAGRAM" | "UNIFIED";
  workspaceId: string;
  zernioAccountId: string | null;
  instagramId: string;
  accessToken: string;
};

export function hasInstagramCredentials(
  account: Pick<ProviderAccount, "provider" | "accessToken" | "zernioAccountId">
) {
  return account.provider === "ZERNIO"
    ? Boolean(account.zernioAccountId)
    : Boolean(account.accessToken);
}

export async function createInstagramContext(
  account: ProviderAccount,
  operationId?: string
): Promise<InstagramContext> {
  if (account.provider !== "ZERNIO")
    return {
      provider: "META",
      accessToken: decryptToken(account.accessToken),
      instagramId: account.instagramId,
      unifiedLogin: account.metaLogin === "UNIFIED",
    };
  if (!account.zernioAccountId)
    throw new Error("Zernio account is not connected");
  const connection = await prisma.zernioConnection.findUnique({
    where: { workspaceId: account.workspaceId },
    select: { apiKey: true },
  });
  if (!connection) throw new Error("Zernio workspace connection is missing");
  return {
    provider: "ZERNIO",
    apiKey: decryptToken(connection.apiKey),
    accountId: account.zernioAccountId,
    instagramId: account.instagramId,
    ...(operationId ? { operationId } : {}),
  };
}

export type ZernioContext = Extract<InstagramContext, { provider: "ZERNIO" }>;
