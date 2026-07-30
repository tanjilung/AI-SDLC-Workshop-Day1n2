import { expect, test } from '@playwright/test';
import { createTodo, loginAsFreshUser, openCalendarDay } from './helpers';

test('calendar shows holidays and due todos on the correct date', async ({ page }) => {
  await loginAsFreshUser(page, 'calendar');
  await createTodo(page, {
    title: 'National Day prep',
    dueDate: '2026-08-09T09:00'
  });

  await openCalendarDay(page, '2026-08-09');
  const dialog = page.getByRole('dialog', { name: 'Calendar day details' });
  await expect(dialog).toContainText('National Day');
  await expect(dialog).toContainText('National Day prep');
});
