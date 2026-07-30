import type { Subtask } from './todo-types';

export function calculateSubtaskProgress(subtasks: Subtask[]) {
  const total = subtasks.length;
  const completed = subtasks.filter((subtask) => subtask.completed).length;

  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}
