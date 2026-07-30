import fs from 'node:fs';
import path from 'node:path';
import { createDatabase, createHolidayDB } from '../lib/db';
import { singaporeHolidays } from '../lib/singapore-holidays';

export default async function globalSetup() {
  const databasePath = path.resolve(process.cwd(), '.playwright', 'todos-e2e.db');
  fs.rmSync(databasePath, { force: true });

  const db = createDatabase(databasePath);
  try {
    createHolidayDB(db).upsertMany(singaporeHolidays);
  } finally {
    db.close();
  }
}
