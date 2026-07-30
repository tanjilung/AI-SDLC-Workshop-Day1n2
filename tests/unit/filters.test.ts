import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFilters,
  DEFAULT_FILTER_STATE,
  deletePreset,
  describeFilters,
  hasActiveFilters,
  loadPresets,
  savePreset,
  type FilterPreset
} from '../../lib/filters';
import type { Tag, Todo } from '../../lib/db';

function makeTag(id: string, name: string, color = '#3B82F6'): Tag {
  return {
    id,
    user_id: 'user-1',
    name,
    color,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z'
  };
}

function makeTodo(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    user_id: 'user-1',
    title: `Todo ${id}`,
    notes: null,
    due_date: null,
    completed: false,
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    completed_at: null,
    subtasks: [],
    tags: [],
    ...overrides
  };
}

function makeStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}

test('hasActiveFilters detects whether any filter is applied', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTER_STATE), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, search: 'meeting' }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTER_STATE, tagId: 'tag-work' }), true);
});

test('applyFilters combines search, priority, tag, completion, and due date filters', () => {
  const workTag = makeTag('tag-work', 'Work');
  const homeTag = makeTag('tag-home', 'Home');
  const todos = [
    makeTodo('todo-1', {
      title: 'Prepare board meeting',
      priority: 'high',
      due_date: '2026-08-03T01:00:00.000Z',
      tags: [workTag],
      subtasks: [{ id: 'sub-1', todo_id: 'todo-1', title: 'Review agenda', completed: false, position: 0 }]
    }),
    makeTodo('todo-2', {
      title: 'Clean kitchen',
      priority: 'low',
      due_date: '2026-08-05T01:00:00.000Z',
      tags: [homeTag]
    }),
    makeTodo('todo-3', {
      title: 'Archive finished notes',
      priority: 'high',
      completed: true,
      completed_at: '2026-08-01T01:00:00.000Z',
      due_date: '2026-08-04T01:00:00.000Z',
      tags: [workTag]
    })
  ];

  const filtered = applyFilters(todos, {
    search: 'agenda',
    priority: 'high',
    tagId: 'tag-work',
    completion: 'incomplete',
    dueDateFrom: '2026-08-01',
    dueDateTo: '2026-08-03'
  });

  assert.deepEqual(filtered.map((todo) => todo.id), ['todo-1']);
});

test('applyFilters matches tag names during search', () => {
  const workTag = makeTag('tag-work', 'Work');
  const homeTag = makeTag('tag-home', 'Home');
  const todos = [
    makeTodo('todo-1', {
      title: 'Prepare agenda',
      tags: [workTag]
    }),
    makeTodo('todo-2', {
      title: 'Clean kitchen',
      tags: [homeTag]
    })
  ];

  const filtered = applyFilters(todos, {
    ...DEFAULT_FILTER_STATE,
    search: 'work'
  });

  assert.deepEqual(filtered.map((todo) => todo.id), ['todo-1']);
});

test('applyFilters compares due-date ranges using Singapore calendar dates', () => {
  const todos = [
    makeTodo('sg-midnight', {
      due_date: '2026-07-31T16:30:00.000Z'
    }),
    makeTodo('next-day', {
      due_date: '2026-08-01T16:30:00.000Z'
    })
  ];

  const filtered = applyFilters(todos, {
    ...DEFAULT_FILTER_STATE,
    dueDateFrom: '2026-08-01',
    dueDateTo: '2026-08-01'
  });

  assert.deepEqual(filtered.map((todo) => todo.id), ['sg-midnight']);
});

test('preset helpers persist, describe, and delete saved filter presets', () => {
  const storage = makeStorage();
  const preset: FilterPreset = {
    id: 'preset-1',
    name: 'Morning focus',
    createdAt: '2026-07-30T00:00:00.000Z',
    filters: {
      search: 'meeting',
      priority: 'high',
      tagId: 'tag-work',
      completion: 'incomplete',
      dueDateFrom: '2026-08-01',
      dueDateTo: '2026-08-07'
    }
  };

  assert.deepEqual(loadPresets(storage), []);
  assert.equal(
    describeFilters(preset.filters, [{ id: 'tag-work', name: 'Work', color: '#3B82F6', user_id: 'user-1', created_at: '', updated_at: '' }]),
    'Search: "meeting" · Priority: High · Tag: Work · Completion: Incomplete · Date: 2026-08-01 to 2026-08-07'
  );

  savePreset(preset, storage);
  assert.deepEqual(loadPresets(storage), [preset]);
  assert.deepEqual(deletePreset('preset-1', storage), []);
});

test('loadPresets ignores malformed storage data without console errors', () => {
  const storage = makeStorage();
  storage.setItem('todo-app:filter-presets', '{not-json');

  const originalConsoleError = console.error;
  let consoleErrorCalls = 0;
  console.error = () => {
    consoleErrorCalls += 1;
  };

  try {
    assert.deepEqual(loadPresets(storage), []);
    assert.equal(consoleErrorCalls, 0);
  } finally {
    console.error = originalConsoleError;
  }
});

test('loadPresets ignores structurally invalid preset entries', () => {
  const storage = makeStorage();
  storage.setItem('todo-app:filter-presets', '[{}]');

  assert.deepEqual(loadPresets(storage), []);
});
