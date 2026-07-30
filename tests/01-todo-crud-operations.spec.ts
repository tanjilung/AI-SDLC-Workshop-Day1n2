import { expect, test } from '@playwright/test';
import { createTodo, editTodo, loginAsFreshUser, todoRow } from './helpers';

test('user can create, edit, complete, and delete a todo', async ({ page }) => {
  await loginAsFreshUser(page, 'crud');

  await createTodo(page, { title: 'Buy groceries' });
  await editTodo(page, 'Buy groceries', { title: 'Buy groceries and cook', priority: 'high' });
  await expect(todoRow(page, 'Buy groceries and cook')).toContainText('High');

  await todoRow(page, 'Buy groceries and cook').getByLabel('Toggle Buy groceries and cook').check();
  await expect(page.getByRole('heading', { name: /Completed \(1\)/ })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await todoRow(page, 'Buy groceries and cook').getByRole('button', { name: 'Delete Buy groceries and cook' }).click();
});
