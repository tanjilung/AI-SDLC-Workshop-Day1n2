import { getDb, createTables } from '../lib/db';

async function runMigrations() {
  console.log('Creating database tables...');
  const db = getDb();
  await createTables(db);
  console.log('Database tables verified.');
  
  // Close the pool to allow graceful exit
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 500);
  });
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
