import 'dotenv/config';
import { PrismaClient } from '@jarvis/db';

// Fail fast on missing required env vars
const requiredEnv = ['DATABASE_URL', 'ENCRYPTION_KEY'] as const;
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`[startup] Missing required environment variable: ${key}`);
  }
}

const slowQueryMs = Number(process.env.INSTRUMENT_PRISMA_SLOW_MS || 0);

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient();
  if (!Number.isFinite(slowQueryMs) || slowQueryMs <= 0) {
    return base;
  }
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = Date.now();
          try {
            return await query(args);
          } finally {
            const ms = Date.now() - start;
            if (ms >= slowQueryMs) {
              console.warn(
                `[prisma-slow] ${model ?? '?'}.${operation} ${ms}ms (threshold=${slowQueryMs})`,
              );
            }
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
