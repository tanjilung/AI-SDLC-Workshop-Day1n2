import { expect, test } from '@playwright/test';
import { createTodo, loginAsFreshUser, todoRow } from './helpers';

test('priority badges render and priority filtering works', async ({ page }) => {
  await loginAsFreshUser(page, 'priority');

  await createTodo(page, { title: 'Low task', priority: 'low' });
  await createTodo(page, { title: 'High task', priority: 'high' });

  await expect(todoRow(page, 'High task')).toContainText('High');
  await expect(todoRow(page, 'Low task')).toContainText('Low');

  await page.getByLabel('Priority').nth(1).selectOption('high');
  await expect(todoRow(page, 'High task')).toBeVisible();
  await expect(todoRow(page, 'Low task')).toHaveCount(0);
});
