import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

interface MockModelArgs {
  where?: { id?: string };
  data?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
}

function createMockPrisma(): PrismaClient {
  console.warn("[AI Studio] Database not connected — using mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d?: MockModelArgs) => ({
      id: "mock_" + Math.random().toString(36).slice(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(d?.data ?? {}),
    }),
    update: async (d?: MockModelArgs) => ({
      id: d?.where?.id ?? "mock_id",
      updatedAt: new Date(),
      ...(d?.data ?? {}),
    }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
    upsert: async (d?: MockModelArgs) => ({
      id: "mock_" + Math.random().toString(36).slice(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(d?.create ?? d?.update ?? {}),
    }),
    count: async () => 0,
    aggregate: async () => ({ _count: 0, _sum: {}, _avg: {}, _min: {}, _max: {} }),
    groupBy: async () => [],
  };

  const mockProxy = new Proxy(
    {} as object,
    {
      get(_target, prop) {
        if (prop === "$transaction") {
          return async (arg: unknown) => {
            if (Array.isArray(arg)) {
              return Promise.all(arg);
            }
            if (typeof arg === "function") {
              return (arg as (tx: unknown) => unknown)(mockProxy);
            }
            return [];
          };
        }
        if (prop === "$queryRaw" || prop === "$executeRaw") {
          return async () => [];
        }
        if (prop === "$connect" || prop === "$disconnect") {
          return async () => {};
        }
        return new Proxy(noOp, {
          get(target, method: string) {
            if (method in target) {
              return (target as unknown as Record<string, unknown>)[method];
            }
            return async () => null;
          },
        });
      },
    }
  );

  return mockProxy as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("localhost:5432") || databaseUrl.includes("127.0.0.1:5432")) {
    return createMockPrisma();
  }

  try {
    return new PrismaClient({
      adapter: new PrismaPg(databaseUrl),
    });
  } catch (err) {
    console.warn("[AI Studio] Failed to initialize PrismaClient:", err);
    return createMockPrisma();
  }
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    try {
      return Reflect.get(getPrisma(), prop, receiver);
    } catch {
      return Reflect.get(createMockPrisma(), prop, receiver);
    }
  },
});

