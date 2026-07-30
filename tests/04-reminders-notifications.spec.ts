import { expect, test } from '@playwright/test';
import { createTodo, futureDateTimeLocal, loginAsFreshUser } from './helpers';

test('reminder badge renders and notifications endpoint returns due reminders', async ({ page }) => {
  await loginAsFreshUser(page, 'reminders');
  const title = 'Reminder todo';

  await expect(page.getByRole('button', { name: /Notifications/ })).toBeVisible();

  await createTodo(page, {
    title,
    dueDate: futureDateTimeLocal({ minutes: 2 }),
    reminder: '15 minutes before'
  });

  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toContainText('15 minutes before');

  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/notifications/check');
    return response.json();
  });

  expect(payload.notifications.some((notification: { title: string }) => notification.title === title)).toBe(true);
});
