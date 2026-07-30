import { PRIORITY_VALUES, type TodoExport } from './todo-types';

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_TODOS = 250;
export const MAX_IMPORT_SUBTASKS_PER_TODO = 50;
export const MAX_IMPORT_TAGS_PER_TODO = 25;
const MAX_IMPORT_TEXT_LENGTH = 500;

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateImportSize(contentLength: number | null): void {
  if (contentLength !== null && contentLength > MAX_IMPORT_BYTES) {
    throw new Error('Import file is too large');
  }
}

export function validateImportPayload(value: unknown): asserts value is TodoExport {
  assert(typeof value === 'object' && value !== null, 'Invalid import payload');
  const payload = value as Record<string, unknown>;
  assert(payload.version === 1, 'Invalid import payload version');
  assert(typeof payload.exported_at === 'string' && isValidDateString(payload.exported_at), 'Invalid exported_at');
  assert(Array.isArray(payload.todos), 'Todos must be an array');
  assert(payload.todos.length <= MAX_IMPORT_TODOS, `Import cannot exceed ${MAX_IMPORT_TODOS} todos`);

  payload.todos.forEach((item) => {
    assert(typeof item === 'object' && item !== null, 'Each todo must be an object');
    const todo = item as Record<string, unknown>;
    assert(typeof todo.title === 'string' && todo.title.trim().length > 0, 'Todo title is required');
    assert(todo.title.length <= MAX_IMPORT_TEXT_LENGTH, 'Todo title is too long');
    assert(todo.notes === null || todo.notes === undefined || typeof todo.notes === 'string', 'Todo notes must be a string');
    assert(todo.notes === null || todo.notes === undefined || String(todo.notes).length <= 5000, 'Todo notes are too long');
    assert(todo.due_date === null || (typeof todo.due_date === 'string' && isValidDateString(todo.due_date)), 'Invalid due date');
    assert(typeof todo.completed === 'boolean', 'Completed must be a boolean');
    assert(PRIORITY_VALUES.includes(todo.priority as (typeof PRIORITY_VALUES)[number]), 'Invalid priority');
    assert(typeof todo.is_recurring === 'boolean', 'is_recurring must be a boolean');
    assert(
      todo.recurrence_pattern === null ||
        todo.recurrence_pattern === undefined ||
        ['daily', 'weekly', 'monthly', 'yearly'].includes(String(todo.recurrence_pattern)),
      'Invalid recurrence pattern'
    );
    assert(todo.reminder_minutes === null || typeof todo.reminder_minutes === 'number', 'Invalid reminder_minutes');
    assert(typeof todo.created_at === 'string' && isValidDateString(todo.created_at), 'Invalid created_at');
    assert(
      todo.completed_at === null || todo.completed_at === undefined || (typeof todo.completed_at === 'string' && isValidDateString(todo.completed_at)),
      'Invalid completed_at'
    );
    assert(Array.isArray(todo.subtasks), 'Subtasks must be an array');
    assert(todo.subtasks.length <= MAX_IMPORT_SUBTASKS_PER_TODO, `Subtasks cannot exceed ${MAX_IMPORT_SUBTASKS_PER_TODO} items`);
    todo.subtasks.forEach((subtask) => {
      assert(typeof subtask === 'object' && subtask !== null, 'Subtask must be an object');
      const row = subtask as Record<string, unknown>;
      assert(typeof row.title === 'string' && row.title.trim().length > 0, 'Subtask title is required');
      assert(row.title.length <= MAX_IMPORT_TEXT_LENGTH, 'Subtask title is too long');
      assert(typeof row.completed === 'boolean', 'Subtask completed must be a boolean');
      assert(typeof row.position === 'number', 'Subtask position must be a number');
    });
    assert(Array.isArray(todo.tags), 'Tags must be an array');
    assert(todo.tags.length <= MAX_IMPORT_TAGS_PER_TODO, `Tags cannot exceed ${MAX_IMPORT_TAGS_PER_TODO} items`);
    todo.tags.forEach((tag) => {
      assert(typeof tag === 'object' && tag !== null, 'Tag must be an object');
      const row = tag as Record<string, unknown>;
      assert(typeof row.name === 'string' && row.name.trim().length > 0, 'Tag name is required');
      assert(row.name.length <= 80, 'Tag name is too long');
      assert(typeof row.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(row.color), 'Invalid tag color');
    });
  });
}
