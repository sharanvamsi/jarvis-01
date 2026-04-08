// Re-export everything from the generated Prisma client
// Both apps import from '@jarvis/db' instead of their own generated clients
export { Prisma, PrismaClient } from '../generated/prisma/index'
export type * from '../generated/prisma/index'
