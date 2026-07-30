import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDueNotificationTodos, getReminderTriggerAt } from '../../lib/notifications';
import type { Todo } from '../../lib/todo-types';

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo-1',
    user_id: 'user-1',
    title: 'Todo',
    notes: null,
    due_date: '2026-08-01T10:00:00.000Z',
    completed: false,
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: 60,
    last_notification_sent: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    completed_at: null,
    subtasks: [],
    tags: [],
    ...overrides
  };
}

test('getReminderTriggerAt subtracts reminder minutes from the due date', () => {
  assert.equal(
    getReminderTriggerAt(makeTodo({ due_date: '2026-08-01T10:00:00.000Z', reminder_minutes: 60 })),
    '2026-08-01T09:00:00.000Z'
  );
});

test('filterDueNotificationTodos returns only due, incomplete, unsent reminders', () => {
  const now = new Date('2026-08-01T09:05:00.000Z');
  const due = makeTodo({ id: 'due' });
  const future = makeTodo({ id: 'future', due_date: '2026-08-01T11:00:00.000Z' });
  const done = makeTodo({ id: 'done', completed: true });
  const alreadySent = makeTodo({ id: 'sent', last_notification_sent: '2026-08-01T09:01:00.000Z' });
  const noReminder = makeTodo({ id: 'none', reminder_minutes: null });

  assert.deepEqual(
    filterDueNotificationTodos([due, future, done, alreadySent, noReminder], now).map((todo) => todo.id),
    ['due']
  );
});
