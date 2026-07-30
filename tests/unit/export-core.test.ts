import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv } from '../../lib/export-core';
import type { TodoExportItem } from '../../lib/todo-types';

function makeExportItem(overrides: Partial<TodoExportItem> = {}): TodoExportItem {
  return {
    title: 'Review roadmap',
    notes: 'Bring "Q4, plan"',
    due_date: '2026-08-01T01:00:00.000Z',
    completed: false,
    priority: 'high',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: 60,
    created_at: '2026-07-30T00:00:00.000Z',
    completed_at: null,
    subtasks: [],
    tags: [{ name: 'Work', color: '#2563EB' }],
    ...overrides
  };
}

test('toCsv escapes commas, quotes, and newlines and includes tag names', () => {
  const csv = toCsv([
    makeExportItem(),
    makeExportItem({
      title: 'Line 1\nLine 2',
      notes: 'Plain',
      tags: []
    })
  ]);

  assert.match(
    csv,
    /^Title,Notes,Completed,Due Date,Priority,Recurring,Pattern,Reminder,Tags\nReview roadmap,"Bring ""Q4, plan""",false,2026-08-01T01:00:00.000Z,high,false,,60,Work\n"Line 1\nLine 2",Plain,false,2026-08-01T01:00:00.000Z,high,false,,60,$/
  );
});

test('toCsv neutralizes spreadsheet formula prefixes in user content', () => {
  const csv = toCsv([
    makeExportItem({
      title: '=CMD()',
      notes: '+SUM(A1:A2)',
      tags: [{ name: '@admins', color: '#111111' }]
    })
  ]);

  assert.match(csv, /^Title,Notes,Completed,Due Date,Priority,Recurring,Pattern,Reminder,Tags\n'=CMD\(\),'\+SUM\(A1:A2\),false,2026-08-01T01:00:00.000Z,high,false,,60,'@admins$/);
});
