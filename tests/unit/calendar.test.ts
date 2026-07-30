import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMonthParam, generateCalendarGrid, getMonthBounds, parseMonthParam } from '../../lib/calendar';

test('generateCalendarGrid emits a stable 42-cell calendar', () => {
  const cells = generateCalendarGrid(2026, 8, '2026-08-15');

  assert.equal(cells.length, 42);
  assert.equal(cells[0]?.date, '2026-07-26');
  assert.equal(cells[0]?.isCurrentMonth, false);
  assert.equal(cells[6]?.date, '2026-08-01');
  assert.equal(cells[6]?.isCurrentMonth, true);
  assert.equal(cells[20]?.date, '2026-08-15');
  assert.equal(cells[20]?.isToday, true);
  assert.equal(cells[20]?.isWeekend, true);
});

test('parseMonthParam validates and defaults invalid month strings', () => {
  assert.deepEqual(parseMonthParam('2026-08', '2026-07'), { year: 2026, month: 8 });
  assert.deepEqual(parseMonthParam('2026-13', '2026-07'), { year: 2026, month: 7 });
  assert.deepEqual(parseMonthParam(null, '2026-07'), { year: 2026, month: 7 });
  assert.equal(formatMonthParam(2026, 8), '2026-08');
});

test('getMonthBounds returns the visible calendar range for a month', () => {
  assert.deepEqual(getMonthBounds(2026, 8), {
    startDate: '2026-07-26',
    endDate: '2026-09-05'
  });
});
