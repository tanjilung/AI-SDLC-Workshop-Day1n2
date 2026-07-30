import { expect, test } from '@playwright/test';
import { createTag, createTodo, loginAsFreshUser, openManageTags, todoRow } from './helpers';

test('tags can be created, edited, assigned, filtered, and deleted', async ({ page }) => {
  await loginAsFreshUser(page, 'tags');
  await openManageTags(page);
  await createTag(page, 'Work');
  await createTag(page, 'Urgent', '#EF4444');

  const dialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await dialog.getByRole('button', { name: 'Edit tag Work' }).click();
  const editForm = dialog.locator('form').nth(1);
  const editNameInput = editForm.getByLabel('Name');
  await editNameInput.fill('Office');
  await editNameInput.press('Enter');
  await expect(dialog.getByTestId('tag-row').filter({ hasText: 'Office' })).toBeVisible();

  const createForm = dialog.locator('form').first();
  await createForm.getByLabel('Name').fill('Office');
  await createForm.getByRole('button', { name: 'Create Tag' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await createTodo(page, {
    title: 'Office planning',
    tags: ['Office', 'Urgent']
  });

  const row = todoRow(page, 'Office planning');
  await expect(row).toContainText('Office');
  await expect(row).toContainText('Urgent');

  await row.getByRole('button', { name: 'Office', exact: true }).click();
  await expect(page.getByText(/Tag: Office/)).toBeVisible();

  await openManageTags(page);
  page.once('dialog', (dialogMessage) => dialogMessage.accept());
  await dialog.getByRole('button', { name: 'Delete tag Urgent' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(todoRow(page, 'Office planning')).not.toContainText('Urgent');
});
