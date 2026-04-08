require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const db = new PrismaClient();
async function main() {
  const assignments = await db.assignment.findMany({
    where: { source: 'gradescope' },
    select: { name: true, specUrl: true, gradescopeId: true }
  });
  console.log('Gradescope assignments:', assignments.length);
  assignments.forEach(a => console.log(
    `${a.name?.slice(0,35)} | specUrl: ${a.specUrl}`
  ));
  
  // Also check raw GS assignments for URL field
  const raw = await db.rawGradescopeAssignment.findMany({
    take: 5,
    select: { title: true, url: true }
  });
  console.log('\nRaw GS assignments (sample):');
  raw.forEach(a => console.log(
    `${a.title?.slice(0,35)} | url: ${a.url}`
  ));
}
main().catch(e => console.error(e.message))
  .finally(() => db.$disconnect());
