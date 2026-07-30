import type { RecurrencePattern } from './todo-types';
import { formatSingaporeDateTimeLocalValue, parseSingaporeDateTimeLocal } from './timezone';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calculateNextRecurringDueDate(dueDate: string, pattern: RecurrencePattern): string {
  const baseDate = new Date(dueDate);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('Recurring todo must have a valid due date');
  }

  if (pattern === 'daily') {
    return new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  if (pattern === 'weekly') {
    return new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const localValue = formatSingaporeDateTimeLocalValue(baseDate);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) {
    throw new Error('Recurring todo must have a valid due date');
  }

  let year = Number(match[1]);
  let month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4];
  const minute = match[5];

  if (pattern === 'monthly') {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  } else if (pattern === 'yearly') {
    year += 1;
  }

  const clampedDay = Math.min(day, daysInMonth(year, month));
  return parseSingaporeDateTimeLocal(
    `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${clampedDay.toString().padStart(2, '0')}T${hour}:${minute}`
  ).toISOString();
}
