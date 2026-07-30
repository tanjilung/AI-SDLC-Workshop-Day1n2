import { formatSingaporeDate } from './timezone';
import type { Priority, Tag, Todo } from './todo-types';

export type CompletionFilter = 'all' | 'incomplete' | 'completed';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: string | 'all';
  completion: CompletionFilter;
  dueDateFrom: string | null;
  dueDateTo: string | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  priority: 'all',
  tagId: 'all',
  completion: 'all',
  dueDateFrom: null,
  dueDateTo: null
};

const PRESETS_KEY = 'todo-app:filter-presets';

function isFilterState(value: unknown): value is FilterState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const priority = candidate.priority;
  const completion = candidate.completion;

  return (
    typeof candidate.search === 'string' &&
    (priority === 'all' || priority === 'high' || priority === 'medium' || priority === 'low') &&
    typeof candidate.tagId === 'string' &&
    (completion === 'all' || completion === 'incomplete' || completion === 'completed') &&
    (candidate.dueDateFrom === null || typeof candidate.dueDateFrom === 'string') &&
    (candidate.dueDateTo === null || typeof candidate.dueDateTo === 'string')
  );
}

function isFilterPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'string' &&
    isFilterState(candidate.filters)
  );
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.priority !== 'all' ||
    filters.tagId !== 'all' ||
    filters.completion !== 'all' ||
    filters.dueDateFrom !== null ||
    filters.dueDateTo !== null
  );
}

export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  let result = todos;

  const query = filters.search.trim().toLowerCase();
  if (query) {
    result = result.filter((todo) => {
      if (todo.title.toLowerCase().includes(query)) {
        return true;
      }

      if ((todo.tags ?? []).some((tag) => tag.name.toLowerCase().includes(query))) {
        return true;
      }

      return (todo.subtasks ?? []).some((subtask) => subtask.title.toLowerCase().includes(query));
    });
  }

  if (filters.priority !== 'all') {
    result = result.filter((todo) => todo.priority === filters.priority);
  }

  if (filters.tagId !== 'all') {
    result = result.filter((todo) => (todo.tags ?? []).some((tag) => tag.id === filters.tagId));
  }

  if (filters.completion === 'incomplete') {
    result = result.filter((todo) => !todo.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter((todo) => todo.completed);
  }

  if (filters.dueDateFrom || filters.dueDateTo) {
    result = result.filter((todo) => {
      if (!todo.due_date) {
        return false;
      }

      const dueDate = formatSingaporeDate(new Date(todo.due_date));
      if (filters.dueDateFrom && dueDate < filters.dueDateFrom) {
        return false;
      }
      if (filters.dueDateTo && dueDate > filters.dueDateTo) {
        return false;
      }

      return true;
    });
  }

  return result;
}

export function describeFilters(filters: FilterState, tags: Tag[]): string {
  const parts: string[] = [];

  if (filters.search.trim()) {
    parts.push(`Search: "${filters.search.trim()}"`);
  }
  if (filters.priority !== 'all') {
    parts.push(`Priority: ${filters.priority[0].toUpperCase()}${filters.priority.slice(1)}`);
  }
  if (filters.tagId !== 'all') {
    const tagName = tags.find((tag) => tag.id === filters.tagId)?.name ?? 'Unknown Tag';
    parts.push(`Tag: ${tagName}`);
  }
  if (filters.completion !== 'all') {
    parts.push(`Completion: ${filters.completion === 'completed' ? 'Completed' : 'Incomplete'}`);
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    const rangeStart = filters.dueDateFrom ?? 'Any';
    const rangeEnd = filters.dueDateTo ?? 'Any';
    parts.push(`Date: ${rangeStart} to ${rangeEnd}`);
  }

  return parts.join(' · ');
}

export function loadPresets(storage?: StorageLike): FilterPreset[] {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return [];
  }

  try {
    const raw = resolvedStorage.getItem(PRESETS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isFilterPreset) : [];
  } catch {
    return [];
  }
}

export function savePreset(preset: FilterPreset, storage?: StorageLike): FilterPreset[] {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return [];
  }

  const presets = [...loadPresets(resolvedStorage), preset];
  resolvedStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

export function deletePreset(id: string, storage?: StorageLike): FilterPreset[] {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return [];
  }

  const presets = loadPresets(resolvedStorage).filter((preset) => preset.id !== id);
  resolvedStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}
