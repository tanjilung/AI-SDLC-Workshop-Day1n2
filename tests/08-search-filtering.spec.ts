import { expect, test } from '@playwright/test';
import { createTag, createTodo, loginAsFreshUser, openManageTags, todoRow } from './helpers';

test('search and combined filters work across title, tags, and priority', async ({ page }) => {
  await loginAsFreshUser(page, 'filters');
  await openManageTags(page);
  await createTag(page, 'Work');
  await page.getByRole('button', { name: 'Close' }).click();

  await createTodo(page, {
    title: 'Prepare board meeting',
    priority: 'high',
    tags: ['Work']
  });
  await createTodo(page, {
    title: 'Work lunch',
    priority: 'low',
    tags: ['Work']
  });
  await createTodo(page, {
    title: 'Clean kitchen',
    priority: 'low'
  });

  const searchInput = page.getByRole('textbox', { name: /Search/ });

  await searchInput.fill('meeting');
  await expect(todoRow(page, 'Prepare board meeting')).toBeVisible();
  await expect(todoRow(page, 'Clean kitchen')).toHaveCount(0);

  await searchInput.fill('work');
  await expect(todoRow(page, 'Prepare board meeting')).toBeVisible();
  await expect(todoRow(page, 'Work lunch')).toBeVisible();

  await page.getByLabel('Priority').nth(1).selectOption('high');
  await expect(todoRow(page, 'Prepare board meeting')).toBeVisible();
  await expect(todoRow(page, 'Work lunch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(todoRow(page, 'Clean kitchen')).toBeVisible();
});
