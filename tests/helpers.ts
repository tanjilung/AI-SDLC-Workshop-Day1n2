import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { formatSingaporeDateTimeLocalValue } from '../lib/timezone';

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function futureDateTimeLocal({
  days = 0,
  hours = 0,
  minutes = 2
}: {
  days?: number;
  hours?: number;
  minutes?: number;
} = {}): string {
  return formatSingaporeDateTimeLocalValue(
    new Date(Date.now() + (((days * 24) + hours) * 60 + minutes) * 60 * 1000)
  );
}

export async function attachVirtualAuthenticator(
  page: Page,
  transport: 'internal' | 'usb' = 'internal'
) {
  await page.context().grantPermissions(['notifications'], { origin: 'http://localhost:3000' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });

  return { cdp, authenticatorId };
}

export async function waitForWorkspaceLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: /welcome back,/i })).toBeVisible();
}

export async function registerWithPasskey(page: Page, username: string, redirectPath = '/') {
  await page.goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Register' }).click();
  if (redirectPath.startsWith('/calendar')) {
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByRole('heading', { name: /\w+ \d{4}/ })).toBeVisible();
    return;
  }

  await waitForWorkspaceLoaded(page);
}

export async function loginWithPasskey(page: Page, username: string, redirectPath = '/') {
  await page.goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Login' }).click();
  if (redirectPath.startsWith('/calendar')) {
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByRole('heading', { name: /\w+ \d{4}/ })).toBeVisible();
    return;
  }

  await waitForWorkspaceLoaded(page);
}

export async function loginAsFreshUser(page: Page, prefix = 'e2e-user') {
  await attachVirtualAuthenticator(page);
  const username = uniqueName(prefix);
  await registerWithPasskey(page, username);
  return username;
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
}

export type CreateTodoOptions = {
  title: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
  repeat?: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  reminder?: '15 minutes before' | '30 minutes before' | '1 hour before' | '2 hours before' | '1 day before' | '2 days before' | '1 week before';
  subtasksText?: string;
  tags?: string[];
};

export async function createTodo(page: Page, options: CreateTodoOptions) {
  const form = page.locator('form').first();

  await form.getByLabel('Title').fill(options.title);
  if (options.dueDate) {
    await form.getByLabel('Due date').fill(options.dueDate);
  }
  if (options.priority) {
    await form.getByLabel('Priority').selectOption(options.priority);
  }
  if (options.repeat) {
    await form.getByLabel('Repeat').selectOption(options.repeat);
  }
  if (options.reminder) {
    await form.getByLabel('Reminder').selectOption({ label: options.reminder });
  }
  if (options.subtasksText) {
    await form.getByLabel('Draft subtasks').fill(options.subtasksText);
  }
  for (const tagName of options.tags ?? []) {
    await page.getByRole('button', { name: new RegExp(`^${tagName}$`, 'i') }).first().click();
  }

  const createResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/todos') && response.request().method() === 'POST'
  );
  await form.getByRole('button', { name: 'Add Todo' }).click();
  await createResponse;
  await expect(todoRow(page, options.title)).toBeVisible();
}

export function todoRow(page: Page, title: string) {
  return page.getByTestId('todo-row').filter({ hasText: title }).first();
}

export async function editTodo(
  page: Page,
  title: string,
  updates: Partial<{
    title: string;
    dueDate: string;
    priority: 'high' | 'medium' | 'low';
  }>
) {
  await todoRow(page, title).getByRole('button', { name: `Edit ${title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit todo' });
  await expect(dialog).toBeVisible();
  if (updates.title) {
    await dialog.getByLabel('Title').fill(updates.title);
  }
  if (updates.dueDate) {
    await dialog.getByLabel('Due date').fill(updates.dueDate);
  }
  if (updates.priority) {
    await dialog.getByLabel('Priority').selectOption(updates.priority);
  }
  await dialog.getByRole('button', { name: 'Update' }).click();
}

export async function openManageTags(page: Page) {
  await page.getByRole('button', { name: 'Manage Tags' }).click();
  await expect(page.getByRole('dialog', { name: 'Manage Tags' })).toBeVisible();
}

export async function createTag(page: Page, name: string, color = '#3B82F6') {
  const dialog = page.getByRole('dialog', { name: 'Manage Tags' });
  const form = dialog.locator('form').first();
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Hex code').fill(color);
  await form.getByRole('button', { name: 'Create Tag' }).click();
  await expect(dialog.getByTestId('tag-row').filter({ hasText: name })).toBeVisible();
}

export async function saveTemplate(
  page: Page,
  details: { name: string; description?: string; category?: string }
) {
  await page.getByRole('button', { name: 'Save as Template' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as Template' });
  await dialog.getByLabel('Name').fill(details.name);
  if (details.description) {
    await dialog.getByLabel('Description').fill(details.description);
  }
  if (details.category) {
    await dialog.getByLabel('Category').fill(details.category);
  }
  await dialog.getByRole('button', { name: 'Save Template' }).click();
}

export async function openTemplates(page: Page) {
  await page.getByRole('button', { name: 'Templates' }).click();
  await expect(page.getByRole('dialog', { name: 'Templates' })).toBeVisible();
}

export async function useTemplate(page: Page, templateName: string) {
  await page.getByLabel('Use Template').selectOption({ label: templateName });
}

export async function openCalendarDay(page: Page, date: string) {
  await page.goto(`/calendar?month=${date.slice(0, 7)}`);
  await page.locator(`[data-testid="calendar-day"][data-date="${date}"]`).click();
  await expect(page.getByRole('dialog', { name: 'Calendar day details' })).toBeVisible();
}

export function createTempJsonFile(contents: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-e2e-import-'));
  const filePath = path.join(tempDir, 'import.json');
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}
