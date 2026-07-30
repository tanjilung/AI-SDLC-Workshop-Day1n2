import type { Priority, Todo } from './todo-types';
import { PRIORITY_ORDER } from './todo-types';

function isPriority(value: unknown): value is Priority {
  return value === 'high' || value === 'medium' || value === 'low';
}

export function validateCreatePriority(value: unknown): Priority {
  if (value === undefined || value === null) {
    return 'medium';
  }

  if (!isPriority(value)) {
    throw new Error(`Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`);
  }

  return value;
}

export function validateUpdatePriority(value: unknown): Priority | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPriority(value)) {
    throw new Error(`Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`);
  }

  return value;
}

export function validateTodoTitle(value: unknown): string;
export function validateTodoTitle(value: unknown, allowUndefined: true): string | undefined;
export function validateTodoTitle(value: unknown, allowUndefined = false): string | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('Title is required');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Title is required');
  }

  return trimmed;
}

export function validateTodoDueDate(value: unknown, now: Date): string | null;
export function validateTodoDueDate(value: unknown, now: Date, allowUndefined: true): string | null | undefined;
export function validateTodoDueDate(
  value: unknown,
  now: Date,
  allowUndefined = false
): string | null | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Due date must be a valid date');
  }

  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('Due date must be a valid date');
  }

  const minDueDate = new Date(now.getTime() + 60_000);
  if (dueDate.getTime() < minDueDate.getTime()) {
    throw new Error('Due date must be at least 1 minute in the future');
  }

  return dueDate.toISOString();
}

export function compareActiveTodos(a: Todo, b: Todo): number {
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function sortActiveTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareActiveTodos);
}

export function sectionTodos(todos: Todo[], now: Date): {
  overdue: Todo[];
  pending: Todo[];
  completed: Todo[];
} {
  const incomplete = todos.filter((todo) => !todo.completed);

  return {
    overdue: sortActiveTodos(
      incomplete.filter((todo) => Boolean(todo.due_date) && new Date(todo.due_date as string).getTime() < now.getTime())
    ),
    pending: sortActiveTodos(
      incomplete.filter((todo) => !todo.due_date || new Date(todo.due_date).getTime() >= now.getTime())
    ),
    completed: [...todos]
      .filter((todo) => todo.completed)
      .sort(
        (a, b) =>
          new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime() -
          new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime()
      )
  };
}
