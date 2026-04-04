require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const db = new PrismaClient();
async function main() {
  const logs = await db.syncLog.findMany({
    where: { userId: 'cmng8w1130000v1d0b84uitkk' },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: { service: true, status: true, startedAt: true, recordsCreated: true }
  });
  console.log(JSON.stringify(logs, null, 2));
}
main().catch(e => console.error(e.message))
  .finally(() => db.$disconnect());
