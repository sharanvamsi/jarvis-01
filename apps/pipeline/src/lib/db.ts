import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';

// Fail fast on missing required env vars
const requiredEnv = ['DATABASE_URL', 'ENCRYPTION_KEY'] as const;
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`[startup] Missing required environment variable: ${key}`);
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
