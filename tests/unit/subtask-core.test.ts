import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSubtaskProgress } from '../../lib/subtask-core';
import type { Subtask } from '../../lib/todo-types';

function makeSubtask(id: string, completed: boolean): Subtask {
  return {
    id,
    todo_id: 'todo-1',
    title: `Subtask ${id}`,
    completed,
    position: 0
  };
}

test('calculateSubtaskProgress reports total, completed, and percent', () => {
  assert.deepEqual(
    calculateSubtaskProgress([makeSubtask('1', true), makeSubtask('2', false), makeSubtask('3', true)]),
    {
      total: 3,
      completed: 2,
      percent: 67
    }
  );
});

test('calculateSubtaskProgress handles empty subtasks', () => {
  assert.deepEqual(calculateSubtaskProgress([]), {
    total: 0,
    completed: 0,
    percent: 0
  });
});
