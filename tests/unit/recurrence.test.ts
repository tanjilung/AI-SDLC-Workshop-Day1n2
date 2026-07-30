import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNextRecurringDueDate } from '../../lib/recurrence';

test('calculateNextRecurringDueDate advances daily recurrence in Singapore time', () => {
  assert.equal(
    calculateNextRecurringDueDate('2026-08-01T01:00:00.000Z', 'daily'),
    '2026-08-02T01:00:00.000Z'
  );
});

test('calculateNextRecurringDueDate advances weekly recurrence in Singapore time', () => {
  assert.equal(
    calculateNextRecurringDueDate('2026-08-01T01:00:00.000Z', 'weekly'),
    '2026-08-08T01:00:00.000Z'
  );
});

test('calculateNextRecurringDueDate clamps monthly recurrence to the end of shorter months', () => {
  assert.equal(
    calculateNextRecurringDueDate('2026-01-31T01:00:00.000Z', 'monthly'),
    '2026-02-28T01:00:00.000Z'
  );
});

test('calculateNextRecurringDueDate preserves leap-day intent safely for yearly recurrence', () => {
  assert.equal(
    calculateNextRecurringDueDate('2024-02-29T01:00:00.000Z', 'yearly'),
    '2025-02-28T01:00:00.000Z'
  );
});
