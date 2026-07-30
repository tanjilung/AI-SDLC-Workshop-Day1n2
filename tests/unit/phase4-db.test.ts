import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDatabase,
  createHolidayDB,
  createSubtaskDB,
  createTagDB,
  createTemplateDB,
  createTodoDB
} from '../../lib/db';
import type { TodoExportItem } from '../../lib/todo-types';

function makeTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-phase4-db-test-'));
  return {
    tempDir,
    tempDbPath: path.join(tempDir, 'todos.db')
  };
}

test('template DB stores templates and holiday DB scopes month queries', () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const db = createDatabase(tempDbPath);

  try {
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('user-1', 'alice');
    const templateDB = createTemplateDB(db);
    const holidayDB = createHolidayDB(db);

    const template = templateDB.create({
      user_id: 'user-1',
      name: 'Weekly Review',
      title_template: 'Weekly Review',
      description: 'Checklist for Friday wrap-up',
      category: 'Work',
      priority: 'high',
      due_date_offset_minutes: 120,
      subtasks_json: JSON.stringify([{ title: 'Summarize wins', position: 0 }])
    });

    assert.equal(template.name, 'Weekly Review');
    assert.equal(templateDB.findAllByUser('user-1').length, 1);

    holidayDB.upsertMany([
      { date: '2026-07-26', name: 'Spillover Start Holiday' },
      { date: '2026-08-09', name: 'National Day' },
      { date: '2026-09-05', name: 'Spillover End Holiday' },
      { date: '2026-09-11', name: 'Holiday B' }
    ]);

    assert.deepEqual(holidayDB.findByMonth(2026, 8).map((holiday) => holiday.date), ['2026-08-09']);
    assert.deepEqual(
      holidayDB.findByRange('2026-07-26', '2026-09-05').map((holiday) => holiday.date),
      ['2026-07-26', '2026-08-09', '2026-09-05']
    );
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('todo DB importAll reuses tags by name and creates subtasks', () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const db = createDatabase(tempDbPath);

  try {
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('user-1', 'alice');
    const tagDB = createTagDB(db);
    const todoDB = createTodoDB(db);
    const subtaskDB = createSubtaskDB(db);

    tagDB.create('user-1', { name: 'Work', color: '#2563EB' });

    const items: TodoExportItem[] = [
      {
        title: 'Imported task',
        notes: 'Recovered from backup',
        due_date: '2026-08-01T01:00:00.000Z',
        completed: false,
        priority: 'medium',
        is_recurring: false,
        recurrence_pattern: null,
        reminder_minutes: 30,
        created_at: '2026-07-30T00:00:00.000Z',
        completed_at: null,
        subtasks: [
          { title: 'First subtask', completed: false, position: 0 },
          { title: 'Second subtask', completed: true, position: 1 }
        ],
        tags: [
          { name: 'work', color: '#1D4ED8' },
          { name: 'Ops', color: '#059669' }
        ]
      }
    ];

    const result = todoDB.importAll('user-1', items);
    assert.deepEqual(result, { imported: 1, tagsCreated: 1, tagsReused: 1 });

    const todos = todoDB.findAllByUser('user-1');
    assert.equal(todos.length, 1);
    assert.deepEqual((todos[0]?.tags ?? []).map((tag) => tag.name), ['Ops', 'Work']);
    assert.deepEqual(subtaskDB.findAllByTodo(todos[0]!.id).map((subtask) => subtask.title), [
      'First subtask',
      'Second subtask'
    ]);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
