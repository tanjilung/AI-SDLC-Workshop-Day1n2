import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { createTempJsonFile, createTodo, loginAsFreshUser, todoRow } from './helpers';

test('todos can be exported and imported', async ({ page }) => {
  await loginAsFreshUser(page, 'export');
  await createTodo(page, { title: 'Export me' });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8')) as { todos: Array<{ title: string }> };
  expect(exported.todos.some((todo) => todo.title === 'Export me')).toBe(true);

  const importFile = createTempJsonFile(JSON.stringify({
    version: 1,
    exported_at: new Date().toISOString(),
    todos: [
      {
        title: 'Imported todo',
        notes: null,
        due_date: null,
        completed: false,
        priority: 'medium',
        is_recurring: false,
        recurrence_pattern: null,
        reminder_minutes: null,
        created_at: new Date().toISOString(),
        completed_at: null,
        subtasks: [],
        tags: []
      }
    ]
  }));

  await page.getByTestId('import-input').setInputFiles(importFile);
  await expect(page.getByRole('status')).toContainText('Successfully imported 1 todos.');
  await expect(todoRow(page, 'Imported todo')).toBeVisible();
});
