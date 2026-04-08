import 'dotenv/config';
import { syncUser } from './jobs/syncUser';

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'sync' && args[1]) {
    const userId = args[1];
    console.log(`Starting one-off sync for user: ${userId}`);
    await syncUser(userId);
    console.log('Sync complete.');
    process.exit(0);
  } else {
    console.log('Usage: npx tsx src/sync-once.ts sync <userId>');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
