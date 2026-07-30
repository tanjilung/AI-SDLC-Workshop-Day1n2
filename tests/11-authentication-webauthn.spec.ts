import { expect, test } from '@playwright/test';
import { attachVirtualAuthenticator, loginWithPasskey, logout, registerWithPasskey, uniqueName } from './helpers';

test('authentication flow supports protected-route redirects, registration, login, and logout', async ({ page }) => {
  await attachVirtualAuthenticator(page);
  const username = uniqueName('auth');

  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcalendar/);

  await registerWithPasskey(page, username, '/calendar');
  await expect(page).toHaveURL(/\/calendar/);

  await page.getByRole('button', { name: 'List' }).click();
  await expect(page).toHaveURL(/\/$/);

  await logout(page);
  await loginWithPasskey(page, username);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
});
