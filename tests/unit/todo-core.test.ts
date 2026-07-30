import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDatabase,
  createTodoDB,
  type Todo
} from '../../lib/db';
import {
  compareActiveTodos,
  sectionTodos,
  sortActiveTodos,
  validateCreatePriority,
  validateTodoDueDate,
  validateTodoTitle,
  validateUpdatePriority
} from '../../lib/todo-core';

function makeTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-core-test-'));
  return {
    tempDir,
    tempDbPath: path.join(tempDir, 'todos.db')
  };
}

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo-1',
    user_id: 'user-1',
    title: 'Todo',
    notes: null,
    due_date: null,
    completed: false,
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    completed_at: null,
    ...overrides
  };
}

test('validateCreatePriority defaults omitted values and rejects invalid ones', () => {
  assert.equal(validateCreatePriority(undefined), 'medium');
  assert.equal(validateCreatePriority(null), 'medium');
  assert.equal(validateCreatePriority('high'), 'high');
  assert.throws(() => validateCreatePriority('urgent'));
});

test('validateUpdatePriority allows omission but rejects null and invalid values', () => {
  assert.equal(validateUpdatePriority(undefined), undefined);
  assert.equal(validateUpdatePriority('low'), 'low');
  assert.throws(() => validateUpdatePriority(null));
  assert.throws(() => validateUpdatePriority('LOW'));
});

test('validateTodoTitle trims valid values and rejects blanks', () => {
  assert.equal(validateTodoTitle('  buy milk  '), 'buy milk');
  assert.equal(validateTodoTitle(undefined, true), undefined);
  assert.throws(() => validateTodoTitle('   '));
});

test('validateTodoDueDate enforces the 1-minute boundary', () => {
  const now = new Date('2026-07-30T00:00:00.000Z');

  assert.equal(validateTodoDueDate(undefined, now, true), undefined);
  assert.equal(validateTodoDueDate(null, now), null);
  assert.equal(
    validateTodoDueDate('2026-07-30T00:01:00.000Z', now),
    '2026-07-30T00:01:00.000Z'
  );
  assert.throws(() => validateTodoDueDate('2026-07-30T00:00:30.000Z', now));
  assert.throws(() => validateTodoDueDate('not-a-date', now));
});

test('sortActiveTodos orders by priority then due date then creation date', () => {
  const todos = [
    makeTodo({ id: '6', priority: 'low', due_date: null, created_at: '2026-07-30T00:00:00.000Z' }),
    makeTodo({ id: '5', priority: 'low', due_date: '2026-08-02T09:00:00.000Z', created_at: '2026-07-30T00:00:00.000Z' }),
    makeTodo({ id: '4', priority: 'medium', due_date: '2026-08-08T09:00:00.000Z', created_at: '2026-07-30T00:00:00.000Z' }),
    makeTodo({ id: '3', priority: 'medium', due_date: '2026-08-01T09:00:00.000Z', created_at: '2026-07-30T00:00:00.000Z' }),
    makeTodo({ id: '2', priority: 'high', due_date: '2026-08-02T09:00:00.000Z', created_at: '2026-07-30T00:00:00.000Z' }),
    makeTodo({ id: '1', priority: 'high', due_date: '2026-08-01T09:00:00.000Z', created_at: '2026-07-30T00:00:00.000Z' })
  ];

  assert.deepEqual(sortActiveTodos(todos).map((todo) => todo.id), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(todos.map((todo) => todo.id), ['6', '5', '4', '3', '2', '1']);
  assert.ok(compareActiveTodos(todos[4], todos[3]) < 0);
});

test('sectionTodos splits overdue, pending, and completed items', () => {
  const now = new Date('2026-07-30T00:00:00.000Z');
  const todos = [
    makeTodo({ id: 'overdue', due_date: '2026-07-29T23:58:00.000Z' }),
    makeTodo({ id: 'pending', due_date: '2026-07-30T00:02:00.000Z' }),
    makeTodo({ id: 'no-due', due_date: null }),
    makeTodo({ id: 'done', completed: true, due_date: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-30T00:05:00.000Z' })
  ];

  const sections = sectionTodos(todos, now);
  assert.deepEqual(sections.overdue.map((todo) => todo.id), ['overdue']);
  assert.deepEqual(sections.pending.map((todo) => todo.id), ['pending', 'no-due']);
  assert.deepEqual(sections.completed.map((todo) => todo.id), ['done']);
});

test('todo DB creates, scopes, updates, and deletes todos', () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const db = createDatabase(tempDbPath);

  try {
    db.prepare(
      'INSERT INTO users (id, username) VALUES (?, ?), (?, ?)'
    ).run('user-1', 'alice', 'user-2', 'bob');

    const todoDB = createTodoDB(db);
    const created = todoDB.create({
      user_id: 'user-1',
      title: 'Buy milk',
      due_date: '2026-07-30T01:00:00.000Z',
      priority: 'high'
    });

    assert.equal(created.user_id, 'user-1');
    assert.equal(todoDB.findAllByUser('user-1').length, 1);
    assert.equal(todoDB.findAllByUser('user-2').length, 0);
    assert.equal(todoDB.findByIdForUser(created.id, 'user-2'), undefined);

    const updated = todoDB.update(created.id, 'user-1', {
      title: 'Buy milk and bread',
      completed: true
    });

    assert.equal(updated?.title, 'Buy milk and bread');
    assert.equal(updated?.completed, true);
    assert.equal(todoDB.delete(created.id, 'user-2'), false);
    assert.equal(todoDB.delete(created.id, 'user-1'), true);
    assert.equal(todoDB.findById(created.id), undefined);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
