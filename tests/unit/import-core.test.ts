import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_SUBTASKS_PER_TODO,
  MAX_IMPORT_TAGS_PER_TODO,
  MAX_IMPORT_TODOS,
  validateImportPayload,
  validateImportSize
} from '../../lib/import-core';

function makePayload() {
  return {
    version: 1 as const,
    exported_at: '2026-07-30T00:00:00.000Z',
    todos: [
      {
        title: 'Imported',
        notes: null,
        due_date: '2026-08-01T00:00:00.000Z',
        completed: false,
        priority: 'high' as const,
        is_recurring: false,
        recurrence_pattern: null,
        reminder_minutes: 30,
        created_at: '2026-07-30T00:00:00.000Z',
        completed_at: null,
        subtasks: [{ title: 'Subtask', completed: false, position: 0 }],
        tags: [{ name: 'Work', color: '#2563EB' }]
      }
    ]
  };
}

test('validateImportSize enforces request limits', () => {
  assert.doesNotThrow(() => validateImportSize(MAX_IMPORT_BYTES));
  assert.throws(() => validateImportSize(MAX_IMPORT_BYTES + 1));
});

test('validateImportPayload accepts valid imports and rejects malformed dates', () => {
  const payload = makePayload();
  assert.doesNotThrow(() => validateImportPayload(payload));

  payload.todos[0]!.due_date = 'not-a-date';
  assert.throws(() => validateImportPayload(payload));
});

test('validateImportPayload caps todo, subtask, and tag counts', () => {
  const tooManyTodos = {
    ...makePayload(),
    todos: Array.from({ length: MAX_IMPORT_TODOS + 1 }, () => makePayload().todos[0]!)
  };
  assert.throws(() => validateImportPayload(tooManyTodos));

  const tooManySubtasks = makePayload();
  tooManySubtasks.todos[0]!.subtasks = Array.from({ length: MAX_IMPORT_SUBTASKS_PER_TODO + 1 }, (_, index) => ({
    title: `Subtask ${index}`,
    completed: false,
    position: index
  }));
  assert.throws(() => validateImportPayload(tooManySubtasks));

  const tooManyTags = makePayload();
  tooManyTags.todos[0]!.tags = Array.from({ length: MAX_IMPORT_TAGS_PER_TODO + 1 }, (_, index) => ({
    name: `Tag ${index}`,
    color: '#2563EB'
  }));
  assert.throws(() => validateImportPayload(tooManyTags));
});
