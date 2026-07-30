import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_TEMPLATE_SUBTASKS, normalizeTemplateSubtasks } from '../../lib/template-core';

test('normalizeTemplateSubtasks sanitizes and trims template subtasks', () => {
  assert.deepEqual(
    normalizeTemplateSubtasks([
      { title: '  First  ', position: 9 },
      { title: 'Second' }
    ]),
    [
      { title: 'First', position: 0 },
      { title: 'Second', position: 1 }
    ]
  );
});

test('normalizeTemplateSubtasks rejects oversized template subtasks', () => {
  assert.throws(() =>
    normalizeTemplateSubtasks(Array.from({ length: MAX_TEMPLATE_SUBTASKS + 1 }, (_, index) => ({ title: `Task ${index}` })))
  );
  assert.throws(() => normalizeTemplateSubtasks([{ title: '   ' }]));
});
