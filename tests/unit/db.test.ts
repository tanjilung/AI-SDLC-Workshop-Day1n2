import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { getDb, createTables, closeDb } from '../../lib/db';

const originalDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/todos_test';

before(async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  const db = getDb();
  await createTables(db);
});

after(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  try { closeDb(); } catch {}
});

test('createTables initializes required tables', async () => {
  const db = getDb();
  const result = await db.execute(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  const tableNames = (result.rows as Array<{ tablename: string }>).map((r) => r.tablename);

  assert.ok(tableNames.includes('users'));
  assert.ok(tableNames.includes('authenticators'));
  assert.ok(tableNames.includes('todos'));
  assert.ok(tableNames.includes('subtasks'));
  assert.ok(tableNames.includes('tags'));
  assert.ok(tableNames.includes('todo_tags'));
  assert.ok(tableNames.includes('templates'));
  assert.ok(tableNames.includes('holidays'));
});
