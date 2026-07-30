import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSingaporeDate,
  formatSingaporeDateTime,
  formatSingaporeDateTimeLocalValue,
  getSingaporeNow,
  getSingaporeTimeZone,
  parseSingaporeDateTimeLocal
} from '../../lib/timezone';

test('getSingaporeNow returns a date instance', () => {
  const now = getSingaporeNow();
  assert.ok(now instanceof Date);
  assert.ok(!Number.isNaN(now.getTime()));
});

test('formatSingaporeDate converts UTC to Singapore calendar date', () => {
  const date = new Date('2024-01-01T16:00:00.000Z');
  assert.equal(formatSingaporeDate(date), '2024-01-02');
});

test('formatSingaporeDateTime formats Singapore local datetime', () => {
  const date = new Date('2024-01-01T00:00:00.000Z');
  assert.equal(formatSingaporeDateTime(date), '2024-01-01 08:00:00');
});

test('getSingaporeTimeZone returns Asia/Singapore', () => {
  assert.equal(getSingaporeTimeZone(), 'Asia/Singapore');
});

test('Singapore datetime-local helpers round-trip independent of viewer timezone', () => {
  const isoString = '2026-07-31T16:30:00.000Z';
  assert.equal(formatSingaporeDateTimeLocalValue(new Date(isoString)), '2026-08-01T00:30');
  assert.equal(parseSingaporeDateTimeLocal('2026-08-01T00:30').toISOString(), isoString);
});
