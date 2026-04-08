require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const db = new PrismaClient();
async function main() {
  const assignments = await db.assignment.findMany({
    where: { source: 'gradescope' },
    select: { name: true, specUrl: true }
  });
  const withUrl = assignments.filter(a => a.specUrl);
  console.log(`${withUrl.length}/${assignments.length} have URLs`);
  withUrl.forEach(a => console.log(
    `✓ ${a.name?.slice(0,35)} | ${a.specUrl}`
  ));
}
main().catch(e => console.error(e.message))
  .finally(() => db.$disconnect());
