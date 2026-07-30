import type { Todo, TodoExportItem } from './todo-types';

function escapeCsvValue(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@\t]/.test(value) ? `'${value}` : value;
}

export function toExportItem(todo: Todo): TodoExportItem {
  return {
    title: todo.title,
    notes: todo.notes,
    due_date: todo.due_date,
    completed: todo.completed,
    priority: todo.priority,
    is_recurring: todo.is_recurring,
    recurrence_pattern: todo.recurrence_pattern,
    reminder_minutes: todo.reminder_minutes,
    created_at: todo.created_at,
    completed_at: todo.completed_at,
    subtasks: (todo.subtasks ?? []).map((subtask) => ({
      title: subtask.title,
      completed: subtask.completed,
      position: subtask.position
    })),
    tags: (todo.tags ?? []).map((tag) => ({
      name: tag.name,
      color: tag.color
    }))
  };
}

export function toCsv(items: TodoExportItem[]): string {
  const header = 'Title,Notes,Completed,Due Date,Priority,Recurring,Pattern,Reminder,Tags';
  const rows = items.map((item) =>
    [
      neutralizeCsvFormula(item.title),
      neutralizeCsvFormula(item.notes ?? ''),
      String(item.completed),
      item.due_date ?? '',
      item.priority,
      String(item.is_recurring),
      item.recurrence_pattern ?? '',
      item.reminder_minutes === null ? '' : String(item.reminder_minutes),
      neutralizeCsvFormula(item.tags.map((tag) => tag.name).join('|'))
    ]
      .map((value) => escapeCsvValue(value))
      .join(',')
  );

  return [header, ...rows].join('\n');
}
