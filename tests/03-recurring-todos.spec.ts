import { expect, test } from '@playwright/test';
import { createTodo, futureDateTimeLocal, loginAsFreshUser } from './helpers';

test('completing a recurring todo creates the next instance', async ({ page }) => {
  await loginAsFreshUser(page, 'recurring');
  const title = 'Daily standup';

  await createTodo(page, {
    title,
    dueDate: futureDateTimeLocal({ days: 1, hours: 9 }),
    repeat: 'Daily'
  });

  await page.getByLabel(`Toggle ${title}`).first().check();

  await expect(page.getByRole('heading', { name: /Completed \(1\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Pending \(1\)/ })).toBeVisible();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toHaveCount(2);
});
