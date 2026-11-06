import type { Prisma } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/db/client';

export function withConnectionLock<T>(workspaceId: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    // Lock the parent so removal/recreation of a connection cannot race account import.
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
    return action(tx);
  }, { maxWait: 10_000, timeout: 120_000 });
}
