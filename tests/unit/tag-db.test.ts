import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDatabase, createTagDB, createTodoDB } from '../../lib/db';

function makeTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tag-db-test-'));
  return {
    tempDir,
    tempDbPath: path.join(tempDir, 'todos.db')
  };
}

test('tag DB scopes tags per user and supports attaching tags to todos', () => {
  const { tempDir, tempDbPath } = makeTempDb();
  const db = createDatabase(tempDbPath);

  try {
    db.prepare(
      'INSERT INTO users (id, username) VALUES (?, ?), (?, ?)'
    ).run('user-1', 'alice', 'user-2', 'bob');

    const todoDB = createTodoDB(db);
    const tagDB = createTagDB(db);
    const todo = todoDB.create({ user_id: 'user-1', title: 'Plan sprint' });

    const workTag = tagDB.create('user-1', { name: 'Work', color: '#2563EB' });
    const urgentTag = tagDB.create('user-1', { name: 'Urgent' });
    const otherUserWorkTag = tagDB.create('user-2', { name: 'Work', color: '#DC2626' });

    assert.throws(() => tagDB.create('user-1', { name: 'Work' }));
    assert.equal(otherUserWorkTag.name, 'Work');

    tagDB.attachToTodo(todo.id, workTag.id, 'user-1');
    tagDB.attachToTodo(todo.id, workTag.id, 'user-1');
    tagDB.attachToTodo(todo.id, urgentTag.id, 'user-1');

    assert.deepEqual(
      tagDB.findByTodoId(todo.id, 'user-1').map((tag) => tag.name),
      ['Urgent', 'Work']
    );

    const todoWithTags = todoDB.findByIdForUser(todo.id, 'user-1');
    assert.deepEqual(
      todoWithTags?.tags?.map((tag) => tag.name),
      ['Urgent', 'Work']
    );

    assert.equal(tagDB.findById(workTag.id, 'user-2'), undefined);
    assert.equal(tagDB.update(workTag.id, 'user-1', { name: 'Office', color: '#1D4ED8' })?.name, 'Office');

    tagDB.detachFromTodo(todo.id, urgentTag.id, 'user-1');
    tagDB.detachFromTodo(todo.id, urgentTag.id, 'user-1');
    assert.deepEqual(tagDB.findByTodoId(todo.id, 'user-1').map((tag) => tag.name), ['Office']);

    assert.equal(tagDB.delete(workTag.id, 'user-2'), false);
    assert.equal(tagDB.delete(workTag.id, 'user-1'), true);
    assert.deepEqual(tagDB.findByTodoId(todo.id, 'user-1'), []);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
