import { expect, test } from '@playwright/test';
import { createTodo, loginAsFreshUser, todoRow } from './helpers';

test('subtask progress updates when subtasks are completed and deleted', async ({ page }) => {
  await loginAsFreshUser(page, 'subtasks');
  const title = 'Prepare presentation';

  await createTodo(page, {
    title,
    subtasksText: 'Create slides\nRehearse speech'
  });

  const row = todoRow(page, title);
  await expect(row).toContainText('0/2 completed (0%)');

  await row.getByLabel('Toggle subtask Create slides').check();
  await expect(row).toContainText('1/2 completed (50%)');

  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Delete subtask Rehearse speech' }).click();
  await expect(row).toContainText('1/1 completed (100%)');
});
