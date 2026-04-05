require('dotenv').config();
const { PrismaClient } = require('./src/generated/prisma');
const db = new PrismaClient();
db.syncToken.findUnique({
  where: { userId_service: { userId: 'cmng8w1130000v1d0b84uitkk', service: 'canvas' } }
}).then(t => {
  console.log('token found:', !!t);
  if (t) console.log('accessToken length:', t.accessToken?.length);
}).finally(() => db.$disconnect());
