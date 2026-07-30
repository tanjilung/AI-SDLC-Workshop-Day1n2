import { expect, test } from '@playwright/test';
import { loginAsFreshUser, openTemplates, saveTemplate, useTemplate } from './helpers';

test('templates can be saved, used, and deleted', async ({ page }) => {
  await loginAsFreshUser(page, 'templates');

  const form = page.locator('form').first();
  await form.getByLabel('Title').fill('Weekly review source');
  await form.getByLabel('Priority').selectOption('high');
  await form.getByLabel('Draft subtasks').fill('Review goals\nShare notes');

  await saveTemplate(page, {
    name: 'Weekly Review',
    description: 'Weekly planning cadence',
    category: 'Work'
  });

  await openTemplates(page);
  const dialog = page.getByRole('dialog', { name: 'Templates' });
  await expect(dialog.getByTestId('template-row').filter({ hasText: 'Weekly Review' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  const templateRows = page.getByTestId('todo-row').filter({ hasText: 'Weekly review source' });
  await expect(templateRows).toHaveCount(0);
  await useTemplate(page, 'Weekly Review (Work)');
  await expect(templateRows).toHaveCount(1);

  await openTemplates(page);
  page.once('dialog', (dialogMessage) => dialogMessage.accept());
  await dialog.getByRole('button', { name: 'Delete template Weekly Review' }).click();
  await expect(dialog.getByTestId('template-row').filter({ hasText: 'Weekly Review' })).toHaveCount(0);
});
