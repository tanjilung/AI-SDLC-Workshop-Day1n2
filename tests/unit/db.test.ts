import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createDatabase, resolveDatabasePath } from '../../lib/db';

const originalDatabasePath = process.env.DATABASE_PATH;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-db-test-'));
const tempDbPath = path.join(tempDir, 'todos.db');

before(() => {
  process.env.DATABASE_PATH = tempDbPath;
});

after(() => {
  process.env.DATABASE_PATH = originalDatabasePath;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('resolveDatabasePath honors explicit relative database path', () => {
  const resolved = resolveDatabasePath('data/todos.db');
  assert.ok(path.isAbsolute(resolved));
  assert.match(resolved, /data[\\/]+todos\.db$/);
});

test('createDatabase initializes required tables', () => {
  const db = createDatabase(tempDbPath);
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as Array<{ name: string }>;
  const tableNames = tables.map((row) => row.name);

  assert.ok(tableNames.includes('users'));
  assert.ok(tableNames.includes('authenticators'));
  assert.ok(tableNames.includes('todos'));
  assert.ok(tableNames.includes('subtasks'));
  assert.ok(tableNames.includes('tags'));
  assert.ok(tableNames.includes('todo_tags'));
  assert.ok(tableNames.includes('templates'));
  assert.ok(tableNames.includes('holidays'));

  db.close();
});
