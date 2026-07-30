import { formatSingaporeDate } from './timezone';
import type { CalendarDay } from './todo-types';

export function parseMonthParam(raw: string | null, fallbackMonth: string): { year: number; month: number } {
  const fallback = /^(\d{4})-(\d{2})$/.exec(fallbackMonth);
  const fallbackYear = fallback ? Number(fallback[1]) : new Date().getUTCFullYear();
  const fallbackMonthNumber = fallback ? Number(fallback[2]) : new Date().getUTCMonth() + 1;

  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [yearString, monthString] = raw.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  return { year: fallbackYear, month: fallbackMonthNumber };
}

export function formatMonthParam(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function generateCalendarGrid(year: number, month: number, today = formatSingaporeDate(new Date())): CalendarDay[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingDays = startWeekday;
  const cells: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - leadingDays + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const date = formatSingaporeDate(cellDate);
    const weekday = cellDate.getUTCDay();

    cells.push({
      date,
      isCurrentMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
      isToday: date === today,
      isPast: date < today,
      isWeekend: weekday === 0 || weekday === 6
    });
  }

  return cells;
}

export function getMonthBounds(year: number, month: number): { startDate: string; endDate: string } {
  const cells = generateCalendarGrid(year, month, '9999-12-31');
  return {
    startDate: cells[0]!.date,
    endDate: cells[cells.length - 1]!.date
  };
}
