import type { Todo } from './todo-types';

export function getReminderTriggerAt(todo: Pick<Todo, 'due_date' | 'reminder_minutes'>): string | null {
  if (!todo.due_date || todo.reminder_minutes === null) {
    return null;
  }

  const dueDate = new Date(todo.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  return new Date(dueDate.getTime() - todo.reminder_minutes * 60 * 1000).toISOString();
}

export function filterDueNotificationTodos(todos: Todo[], now: Date): Todo[] {
  const nowTime = now.getTime();

  return todos.filter((todo) => {
    if (todo.completed) {
      return false;
    }

    const triggerAt = getReminderTriggerAt(todo);
    if (!triggerAt) {
      return false;
    }

    const triggerTime = new Date(triggerAt).getTime();
    if (Number.isNaN(triggerTime) || triggerTime > nowTime) {
      return false;
    }

    if (!todo.last_notification_sent) {
      return true;
    }

    const lastSentTime = new Date(todo.last_notification_sent).getTime();
    return Number.isNaN(lastSentTime) || lastSentTime < triggerTime;
  });
}
