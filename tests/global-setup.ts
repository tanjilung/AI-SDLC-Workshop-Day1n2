import { sql } from 'drizzle-orm';
import { getDb, createTables } from '../lib/db';
import { singaporeHolidays } from '../lib/singapore-holidays';

export default async function globalSetup() {
  const db = getDb();
  await createTables(db);

  // Seed Singapore holidays using parameterized raw SQL
  for (const holiday of singaporeHolidays) {
    try {
      await db.execute(sql`
        INSERT INTO holidays (date, name) VALUES (${holiday.date}, ${holiday.name})
        ON CONFLICT (date) DO UPDATE SET name = ${holiday.name}
      `);
    } catch {
      // Holiday already exists or other non-fatal error
    }
  }
}
