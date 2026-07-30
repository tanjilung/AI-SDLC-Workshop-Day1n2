'use client';

import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Priority, Tag, Template, Todo } from '@/lib/todo-types';
import {
  DEFAULT_FILTER_STATE,
  applyFilters,
  deletePreset,
  describeFilters,
  hasActiveFilters,
  loadPresets,
  savePreset,
  type FilterPreset,
  type FilterState
} from '@/lib/filters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { calculateSubtaskProgress } from '@/lib/subtask-core';
import { DEFAULT_TAG_COLOR } from '@/lib/tag-core';
import { sectionTodos, validateCreatePriority, validateTodoDueDate, validateTodoTitle } from '@/lib/todo-core';
import {
  formatSingaporeDateTimeLocalValue,
  getSingaporeNow,
  getSingaporeTimeZone,
  parseSingaporeDateTimeLocal
} from '@/lib/timezone';

type SessionUser = {
  userId: string;
  username: string;
};

type FeedbackState = {
  tone: 'error' | 'success';
  text: string;
} | null;

type TodoFormState = {
  title: string;
  due_date: string;
  priority: Priority;
  tag_ids: string[];
  subtasks_text: string;
  is_recurring: boolean;
  recurrence_pattern: '' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  reminder_minutes: '' | '15' | '30' | '60' | '120' | '1440' | '2880' | '10080';
};

type SaveTemplateFormState = {
  name: string;
  description: string;
  category: string;
};

type TagEditorState = {
  id: string;
  name: string;
  color: string;
};

const INITIAL_FORM_STATE: TodoFormState = {
  title: '',
  due_date: '',
  priority: 'medium',
  tag_ids: [],
  subtasks_text: '',
  is_recurring: false,
  recurrence_pattern: '',
  reminder_minutes: ''
};

const INITIAL_TEMPLATE_FORM: SaveTemplateFormState = {
  name: '',
  description: '',
  category: ''
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'border-red-700 bg-red-900/40 text-red-300',
  medium: 'border-yellow-700 bg-yellow-900/40 text-yellow-300',
  low: 'border-blue-700 bg-blue-900/40 text-blue-300'
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
  { value: '2880', label: '2 days before' },
  { value: '10080', label: '1 week before' }
];

const RECURRENCE_OPTIONS = [
  { value: '', label: 'No repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' }
] as const;

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return '';
  }

  return formatSingaporeDateTimeLocalValue(new Date(value));
}

function formatDueDate(value: string | null): string {
  if (!value) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-SG', {
    timeZone: getSingaporeTimeZone(),
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function toApiDueDate(value: string): string | null {
  if (!value) {
    return null;
  }

  return parseSingaporeDateTimeLocal(value).toISOString();
}

function toggleTagId(selectedTagIds: string[], tagId: string): string[] {
  return selectedTagIds.includes(tagId)
    ? selectedTagIds.filter((currentTagId) => currentTagId !== tagId)
    : [...selectedTagIds, tagId];
}

function sortTagsByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function sortTemplates(templates: Template[]): Template[] {
  return [...templates].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function getReminderLabel(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return REMINDER_OPTIONS.find((option) => option.value === String(value))?.label ?? `${value} minutes before`;
}

function getRecurrenceLabel(value: TodoFormState['recurrence_pattern'] | Todo['recurrence_pattern']): string | null {
  if (!value) {
    return null;
  }

  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function buildTodoPayload(form: TodoFormState) {
  const subtasks = form.subtasks_text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => ({
      title,
      position: index
    }));

  return {
    title: form.title,
    due_date: toApiDueDate(form.due_date),
    priority: form.priority,
    tag_ids: form.tag_ids,
    subtasks,
    is_recurring: form.is_recurring,
    recurrence_pattern: form.is_recurring && form.recurrence_pattern ? form.recurrence_pattern : null,
    reminder_minutes: form.reminder_minutes ? Number(form.reminder_minutes) : null
  };
}

function toDraftSubtasks(
  todoId: string,
  subtasks: Array<{
    title: string;
    position: number;
  }>
) {
  return subtasks.map((subtask, index) => ({
    id: `${todoId}-subtask-${index}`,
    todo_id: todoId,
    title: subtask.title,
    completed: false,
    position: subtask.position
  }));
}

function calculateDueOffsetMinutes(value: string, now: Date): number | null {
  if (!value) {
    return null;
  }

  const target = parseSingaporeDateTimeLocal(value);
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function TagPill({
  tag,
  selected = false,
  onClick
}: {
  tag: Tag;
  selected?: boolean;
  onClick?: (tag: Tag) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(tag)}
      style={
        selected
          ? { backgroundColor: tag.color, borderColor: tag.color, color: '#FFFFFF' }
          : { borderColor: tag.color, color: tag.color }
      }
      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition hover:opacity-90"
    >
      {selected ? <span aria-hidden>✓</span> : null}
      <span className="max-w-[10rem] truncate">{tag.name}</span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [form, setForm] = useState<TodoFormState>(INITIAL_FORM_STATE);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TodoFormState>(INITIAL_FORM_STATE);
  const [showManageTags, setShowManageTags] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState<SaveTemplateFormState>(INITIAL_TEMPLATE_FORM);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR);
  const [editingTag, setEditingTag] = useState<TagEditorState | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [now, setNow] = useState(() => getSingaporeNow());
  const debouncedSearch = useDebounce(filters.search, 300);
  const reportNotificationError = useCallback((text: string) => {
    setFeedback({ tone: 'error', text });
  }, []);
  const {
    permission: notificationPermission,
    supported: notificationsSupported,
    enabled: notificationsEnabled,
    requestPermission
  } = useNotifications(reportNotificationError);

  const loadWorkspace = useCallback(async () => {
    const [sessionResponse, todoResponse, tagResponse, templateResponse] = await Promise.all([
      fetch('/api/auth/me'),
      fetch('/api/todos'),
      fetch('/api/tags'),
      fetch('/api/templates')
    ]);

    if (
      sessionResponse.status === 401 ||
      todoResponse.status === 401 ||
      tagResponse.status === 401 ||
      templateResponse.status === 401
    ) {
      router.replace('/login');
      return false;
    }

    if (!sessionResponse.ok || !todoResponse.ok || !tagResponse.ok || !templateResponse.ok) {
      throw new Error('Unable to load workspace data');
    }

    const sessionPayload = (await sessionResponse.json()) as { user: SessionUser };
    const todoPayload = (await todoResponse.json()) as Todo[];
    const tagPayload = (await tagResponse.json()) as Tag[];
    const templatePayload = (await templateResponse.json()) as Template[];

    setUser(sessionPayload.user);
    setTodos(todoPayload);
    setTags(sortTagsByName(tagPayload));
    setTemplates(sortTemplates(templatePayload));
    setPresets(loadPresets());
    return true;
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await loadWorkspace();
        if (cancelled || !loaded) {
          return;
        }
      } catch {
        if (!cancelled) {
          setFeedback({ tone: 'error', text: 'Unable to load your workspace right now.' });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(getSingaporeNow()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch
    }),
    [debouncedSearch, filters]
  );
  const filteredTodos = useMemo(() => applyFilters(todos, effectiveFilters), [effectiveFilters, todos]);
  const sections = useMemo(() => sectionTodos(filteredTodos, now), [filteredTodos, now]);
  const visibleSections = useMemo(
    () =>
      ([
        ['Overdue', sections.overdue],
        ['Pending', sections.pending],
        ['Completed', sections.completed]
      ] as const).filter(([, items]) => items.length > 0),
    [sections.completed, sections.overdue, sections.pending]
  );
  const editingTodo = editingTodoId ? todos.find((todo) => todo.id === editingTodoId) ?? null : null;
  const filtersActive = hasActiveFilters(filters);
  const presetSummary = describeFilters(effectiveFilters, tags);

  function resetCreateForm() {
    setForm(INITIAL_FORM_STATE);
  }

  function setError(text: string) {
    setFeedback({ tone: 'error', text });
  }

  function setSuccess(text: string) {
    setFeedback({ tone: 'success', text });
  }

  function clearFeedback() {
    setFeedback(null);
  }

  function beginEdit(todo: Todo) {
    setEditingTodoId(todo.id);
    setEditForm({
      title: todo.title,
      due_date: toDateTimeLocalValue(todo.due_date),
      priority: todo.priority,
      tag_ids: (todo.tags ?? []).map((tag) => tag.id),
      subtasks_text: (todo.subtasks ?? []).map((subtask) => subtask.title).join('\n'),
      is_recurring: todo.is_recurring,
      recurrence_pattern: (todo.recurrence_pattern ?? '') as TodoFormState['recurrence_pattern'],
      reminder_minutes: todo.reminder_minutes === null ? '' : (String(todo.reminder_minutes) as TodoFormState['reminder_minutes'])
    });
  }

  function cancelEdit() {
    setEditingTodoId(null);
    setEditForm(INITIAL_FORM_STATE);
  }

  function removeTagFromState(tagId: string) {
    setTags((current) => current.filter((tag) => tag.id !== tagId));
    setTodos((current) =>
      current.map((todo) => ({
        ...todo,
        tags: (todo.tags ?? []).filter((tag) => tag.id !== tagId)
      }))
    );
    setForm((current) => ({ ...current, tag_ids: current.tag_ids.filter((currentTagId) => currentTagId !== tagId) }));
    setEditForm((current) => ({ ...current, tag_ids: current.tag_ids.filter((currentTagId) => currentTagId !== tagId) }));
    setFilters((current) => (current.tagId === tagId ? { ...current, tagId: 'all' } : current));
  }

  async function handleLogout() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      const payload =
        contentType?.includes('application/json')
          ? ((await response.json()) as { error?: string })
          : undefined;
      setError(payload?.error ?? 'Could not log out.');
      return;
    }

    router.replace('/login');
  }

  async function handleEnableNotifications() {
    const result = await requestPermission();
    if (result === 'granted') {
      setSuccess('Browser reminders are enabled.');
      return;
    }

    if (result === 'denied') {
      setError('Notification permission was denied.');
      return;
    }

    setError('Notifications are not available in this browser.');
  }

  async function handleAddPasskey() {
    if (!user) {
      return;
    }

    try {
      clearFeedback();
      setPasskeySubmitting(true);

      const loginOptionsResponse = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });

      const loginOptionsPayload = (await loginOptionsResponse.json()) as { error?: string };
      if (!loginOptionsResponse.ok) {
        setError(loginOptionsPayload.error ?? 'Unable to confirm your identity');
        return;
      }

      const assertion = await startAuthentication({
        optionsJSON: loginOptionsPayload as PublicKeyCredentialRequestOptionsJSON
      });

      const loginVerifyResponse = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, response: assertion })
      });

      const loginVerifyPayload = (await loginVerifyResponse.json()) as { error?: string };
      if (!loginVerifyResponse.ok) {
        setError(loginVerifyPayload.error ?? 'Unable to confirm your identity');
        return;
      }

      const optionsResponse = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });

      const optionsPayload = (await optionsResponse.json()) as { error?: string };
      if (!optionsResponse.ok) {
        setError(optionsPayload.error ?? 'Unable to start passkey registration');
        return;
      }

      const attestation = await startRegistration({
        optionsJSON: optionsPayload as PublicKeyCredentialCreationOptionsJSON
      });

      const verifyResponse = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, response: attestation })
      });

      const verifyPayload = (await verifyResponse.json()) as { error?: string };
      if (!verifyResponse.ok) {
        setError(verifyPayload.error ?? 'Unable to verify passkey registration');
        return;
      }

      setSuccess('Passkey added for this account.');
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Unable to add passkey');
    } finally {
      setPasskeySubmitting(false);
    }
  }

  async function handleCreateTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    try {
      clearFeedback();
      const payload = buildTodoPayload(form);
      const title = validateTodoTitle(payload.title);
      const dueDate = validateTodoDueDate(payload.due_date, now);
      const priority = validateCreatePriority(payload.priority);

      setSubmitting(true);

      const optimisticTodoId = `temp-${Date.now()}`;
      const optimisticTodo: Todo = {
        id: optimisticTodoId,
        user_id: user.userId,
        title,
        notes: null,
        due_date: dueDate,
        completed: false,
        priority,
        is_recurring: payload.is_recurring,
        recurrence_pattern: payload.recurrence_pattern,
        reminder_minutes: payload.reminder_minutes,
        last_notification_sent: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        subtasks: toDraftSubtasks(optimisticTodoId, payload.subtasks),
        tags: tags.filter((tag) => payload.tag_ids.includes(tag.id))
      };

      setTodos((current) => [optimisticTodo, ...current]);
      resetCreateForm();

      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responsePayload = (await response.json()) as Todo | { error?: string };
      if (!response.ok) {
        setTodos((current) => current.filter((todo) => todo.id !== optimisticTodo.id));
        setError('error' in responsePayload && responsePayload.error ? responsePayload.error : 'Could not create todo.');
        return;
      }

      setTodos((current) => current.map((todo) => (todo.id === optimisticTodo.id ? (responsePayload as Todo) : todo)));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not create todo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(todo: Todo, completed: boolean) {
    clearFeedback();
    const previousTodos = todos;
    const nextCompletedAt = completed ? new Date().toISOString() : null;
    setTodos((current) =>
      current.map((item) =>
        item.id === todo.id
          ? {
              ...item,
              completed,
              completed_at: nextCompletedAt,
              updated_at: new Date().toISOString()
            }
          : item
      )
    );

    const response = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });

    if (!response.ok) {
      setTodos(previousTodos);
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? 'Could not update todo.');
      return;
    }

    const updated = (await response.json()) as Todo;
    setTodos((current) => current.map((item) => (item.id === updated.id ? updated : item)));

    if (completed && todo.is_recurring) {
      await loadWorkspace();
    }
  }

  async function handleDelete(todoId: string, title: string) {
    if (!window.confirm(`Delete "${title}"?`)) {
      return;
    }

    clearFeedback();
    const previousTodos = todos;
    setTodos((current) => current.filter((todo) => todo.id !== todoId));

    const response = await fetch(`/api/todos/${todoId}`, { method: 'DELETE' });
    if (!response.ok) {
      setTodos(previousTodos);
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? 'Could not delete todo.');
    }
  }

  async function handleToggleSubtask(todoId: string, subtaskId: string, completed: boolean) {
    clearFeedback();
    const previousTodos = todos;
    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              subtasks: (todo.subtasks ?? []).map((subtask) =>
                subtask.id === subtaskId ? { ...subtask, completed } : subtask
              )
            }
      )
    );

    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });

    if (!response.ok) {
      setTodos(previousTodos);
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? 'Could not update subtask.');
      return;
    }

    const updatedSubtask = (await response.json()) as { id: string; completed: boolean };
    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              subtasks: (todo.subtasks ?? []).map((subtask) =>
                subtask.id === updatedSubtask.id ? { ...subtask, completed: updatedSubtask.completed } : subtask
              )
            }
      )
    );
  }

  async function handleDeleteSubtask(todoId: string, subtaskId: string, title: string) {
    if (!window.confirm(`Delete subtask "${title}"?`)) {
      return;
    }

    clearFeedback();
    const previousTodos = todos;
    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              subtasks: (todo.subtasks ?? []).filter((subtask) => subtask.id !== subtaskId)
            }
      )
    );

    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      setTodos(previousTodos);
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? 'Could not delete subtask.');
    }
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodo) {
      return;
    }

    try {
      clearFeedback();
      const payload = buildTodoPayload(editForm);
      validateTodoTitle(payload.title);
      validateTodoDueDate(payload.due_date, now);
      validateCreatePriority(payload.priority);
      const previousTodos = todos;
      const selectedTagIds = [...payload.tag_ids];

      setTodos((current) =>
        current.map((todo) =>
          todo.id === editingTodo.id
            ? {
                ...todo,
                ...payload,
                title: payload.title,
                due_date: payload.due_date,
                subtasks: toDraftSubtasks(editingTodo.id, payload.subtasks),
                tags: tags.filter((tag) => selectedTagIds.includes(tag.id)),
                updated_at: new Date().toISOString()
              }
            : todo
        )
      );
      cancelEdit();

      const response = await fetch(`/api/todos/${editingTodo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responsePayload = (await response.json()) as Todo | { error?: string };
      if (!response.ok) {
        setTodos(previousTodos);
        setError('error' in responsePayload && responsePayload.error ? responsePayload.error : 'Could not update todo.');
        return;
      }

      setTodos((current) =>
        current.map((todo) => (todo.id === (responsePayload as Todo).id ? (responsePayload as Todo) : todo))
      );
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not update todo.');
    }
  }

  async function handleCreateTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTagSubmitting(true);
    setTagError(null);

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName,
          color: newTagColor
        })
      });

      const payload = (await response.json()) as Tag | { error?: string };
      if (!response.ok) {
        setTagError('error' in payload && payload.error ? payload.error : 'Could not create tag.');
        return;
      }

      setTags((current) => sortTagsByName([...current, payload as Tag]));
      setNewTagName('');
      setNewTagColor(DEFAULT_TAG_COLOR);
    } catch (thrown) {
      setTagError(thrown instanceof Error ? thrown.message : 'Could not create tag.');
    } finally {
      setTagSubmitting(false);
    }
  }

  async function handleSaveTagEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTag) {
      return;
    }

    setTagSubmitting(true);
    setTagError(null);

    try {
      const response = await fetch(`/api/tags/${editingTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTag.name,
          color: editingTag.color
        })
      });

      const payload = (await response.json()) as Tag | { error?: string };
      if (!response.ok) {
        setTagError('error' in payload && payload.error ? payload.error : 'Could not update tag.');
        return;
      }

      const updatedTag = payload as Tag;
      setTags((current) => sortTagsByName(current.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))));
      setTodos((current) =>
        current.map((todo) => ({
          ...todo,
          tags: (todo.tags ?? []).map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
        }))
      );
      setEditingTag(null);
    } catch (thrown) {
      setTagError(thrown instanceof Error ? thrown.message : 'Could not update tag.');
    } finally {
      setTagSubmitting(false);
    }
  }

  async function handleDeleteTag(tag: Tag) {
    if (!window.confirm(`Delete tag "${tag.name}"?`)) {
      return;
    }

    setTagSubmitting(true);
    setTagError(null);

    try {
      const response = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setTagError(payload.error ?? 'Could not delete tag.');
        return;
      }

      removeTagFromState(tag.id);
      if (editingTag?.id === tag.id) {
        setEditingTag(null);
      }
    } catch (thrown) {
      setTagError(thrown instanceof Error ? thrown.message : 'Could not delete tag.');
    } finally {
      setTagSubmitting(false);
    }
  }

  async function handleSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTemplateSubmitting(true);

    try {
      clearFeedback();
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveTemplateForm.name,
          description: saveTemplateForm.description,
          category: saveTemplateForm.category,
          title_template: form.title,
          priority: form.priority,
          is_recurring: form.is_recurring,
          recurrence_pattern: form.is_recurring && form.recurrence_pattern ? form.recurrence_pattern : null,
          reminder_minutes: form.reminder_minutes ? Number(form.reminder_minutes) : null,
          due_date_offset_minutes: calculateDueOffsetMinutes(form.due_date, now),
          subtasks: buildTodoPayload(form).subtasks
        })
      });

      const payload = (await response.json()) as Template | { error?: string };
      if (!response.ok) {
        setError('error' in payload && payload.error ? payload.error : 'Could not save template.');
        return;
      }

      setTemplates((current) => sortTemplates([...current, payload as Template]));
      setShowSaveTemplateModal(false);
      setSaveTemplateForm(INITIAL_TEMPLATE_FORM);
      setSuccess('Template saved.');
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not save template.');
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function handleUseTemplate(templateId: string) {
    clearFeedback();

    try {
      const response = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
      const payload = (await response.json()) as Todo | { error?: string };
      if (!response.ok) {
        setError('error' in payload && payload.error ? payload.error : 'Could not use template.');
        return;
      }

      setTodos((current) => [payload as Todo, ...current]);
      setSuccess('Template used successfully.');
      setShowTemplateManager(false);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not use template.');
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template || !window.confirm(`Delete template "${template.name}"?`)) {
      return;
    }

    clearFeedback();

    try {
      const response = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Could not delete template.');
        return;
      }

      setTemplates((current) => current.filter((item) => item.id !== templateId));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not delete template.');
    }
  }

  async function handleExport(format: 'json' | 'csv') {
    clearFeedback();

    try {
      const response = await fetch(`/api/todos/export?format=${format}`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? `Could not export ${format.toUpperCase()}.`);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition');
      const fileNameMatch = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
      anchor.href = url;
      anchor.download = fileNameMatch?.[1] ?? `todos.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : `Could not export ${format.toUpperCase()}.`);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    clearFeedback();

    try {
      const text = await file.text();
      const response = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text
      });

      const payload = (await response.json()) as
        | { success: true; imported: number; tagsCreated: number; tagsReused: number }
        | { error?: string };

      if (!response.ok) {
        setError('error' in payload && payload.error ? payload.error : 'Could not import todos.');
        return;
      }

      await loadWorkspace();
      setSuccess(`Successfully imported ${(payload as { imported: number }).imported} todos.`);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Could not import todos.');
    }
  }

  function handleApplyPreset(preset: FilterPreset) {
    const nextFilters =
      preset.filters.tagId !== 'all' && !tags.some((tag) => tag.id === preset.filters.tagId)
        ? { ...preset.filters, tagId: 'all' as const }
        : preset.filters;
    setFilters(nextFilters);
    setShowAdvancedFilters(true);
  }

  function handleDeletePreset(preset: FilterPreset) {
    if (!window.confirm(`Delete saved filter "${preset.name}"?`)) {
      return;
    }

    setPresets(deletePreset(preset.id));
  }

  function handleSaveCurrentPreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      return;
    }

    const nextPresets = savePreset({
      id: crypto.randomUUID(),
      name: trimmedName,
      filters,
      createdAt: getSingaporeNow().toISOString()
    });

    setPresets(nextPresets);
    setPresetName('');
    setShowSavePresetModal(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p>Loading your workspace...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="import-input"
        onChange={handleImportFile}
      />

      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky-300">Todo App</p>
              <h1 className="text-3xl font-semibold">Welcome back, {user?.username}</h1>
              <p className="text-slate-300">Capture, organize, export, and plan your tasks in Singapore time.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push('/calendar')}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-600"
              >
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setShowTemplateManager(true)}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                Templates
              </button>
              <button
                type="button"
                onClick={() => void handleExport('json')}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => void handleExport('csv')}
                className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
              >
                {notificationsSupported
                  ? notificationsEnabled
                    ? 'Notifications Enabled'
                    : notificationPermission === 'denied'
                      ? 'Notifications Blocked'
                      : 'Enable Notifications'
                  : 'Notifications Unavailable'}
              </button>
              <button
                type="button"
                disabled={passkeySubmitting}
                onClick={() => void handleAddPasskey()}
                className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add passkey
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
              >
                Import
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
              >
                Logout
              </button>
            </div>
          </div>

          {feedback ? (
            <p
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-lg px-3 py-2 text-sm ${
                feedback.tone === 'error'
                  ? 'border border-rose-900 bg-rose-950/50 text-rose-200'
                  : 'border border-emerald-900 bg-emerald-950/50 text-emerald-200'
              }`}
            >
              {feedback.text}
            </p>
          ) : null}
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Create a todo</h2>
              <p className="text-sm text-slate-400">Create one-off or reusable tasks with reminders and recurrence.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowManageTags(true);
                  setTagError(null);
                }}
                className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-500"
              >
                Manage Tags
              </button>
              {form.title.trim() ? (
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(true)}
                  className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-500"
                >
                  Save as Template
                </button>
              ) : null}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleCreateTodo}>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Title</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-400"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Add a new todo"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Due date</span>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  value={form.due_date}
                  onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Priority</span>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value as Priority
                    }))
                  }
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[180px,1fr,180px]">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Repeat</span>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  value={form.recurrence_pattern}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence_pattern: event.target.value as TodoFormState['recurrence_pattern'],
                      is_recurring: event.target.value !== ''
                    }))
                  }
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Use Template</span>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  defaultValue=""
                  onChange={(event) => {
                    const templateId = event.target.value;
                    if (templateId) {
                      void handleUseTemplate(templateId);
                      event.target.value = '';
                    }
                  }}
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.category ? `${template.name} (${template.category})` : template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Reminder</span>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  value={form.reminder_minutes}
                  disabled={!form.due_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reminder_minutes: event.target.value as TodoFormState['reminder_minutes']
                    }))
                  }
                >
                  {REMINDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-300">Tags</p>
              {tags.length === 0 ? (
                <p className="text-sm text-slate-500">No tags yet. Create one from Manage Tags.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <TagPill
                      key={tag.id}
                      tag={tag}
                      selected={form.tag_ids.includes(tag.id)}
                      onClick={(selectedTag) =>
                        setForm((current) => ({
                          ...current,
                          tag_ids: toggleTagId(current.tag_ids, selectedTag.id)
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Draft subtasks</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-400"
                value={form.subtasks_text}
                onChange={(event) => setForm((current) => ({ ...current, subtasks_text: event.target.value }))}
                placeholder={'One subtask per line\nPrepare agenda\nShare notes'}
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add Todo
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="relative flex-1 space-y-2">
              <span className="text-sm text-slate-300">Search</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-10 pr-10 text-slate-100 placeholder:text-slate-500 focus:border-sky-400"
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search todos, tags, and subtasks..."
                />
                {filters.search ? (
                  <button
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-200"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Priority</span>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                value={filters.priority}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    priority: event.target.value as FilterState['priority']
                  }))
                }
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Tag</span>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                value={filters.tagId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    tagId: event.target.value
                  }))
                }
              >
                <option value="all">All Tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                showAdvancedFilters
                  ? 'bg-sky-900/60 text-sky-200'
                  : 'border border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              {showAdvancedFilters ? '▼ Advanced' : '▶ Advanced'}
            </button>
          </div>

          {showAdvancedFilters ? (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Completion</span>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={filters.completion}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        completion: event.target.value as FilterState['completion']
                      }))
                    }
                  >
                    <option value="all">All Todos</option>
                    <option value="incomplete">Incomplete Only</option>
                    <option value="completed">Completed Only</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Due Date From</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={filters.dueDateFrom ?? ''}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        dueDateFrom: event.target.value || null
                      }))
                    }
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Due Date To</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={filters.dueDateTo ?? ''}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        dueDateTo: event.target.value || null
                      }))
                    }
                  />
                </label>
              </div>

              {presets.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">Saved filters</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm"
                      >
                        <button type="button" onClick={() => handleApplyPreset(preset)} className="text-slate-100">
                          {preset.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset)}
                          className="text-rose-300 transition hover:text-rose-200"
                          aria-label={`Delete preset ${preset.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {filtersActive ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTER_STATE)}
                className="rounded-lg bg-rose-900/50 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-900/70"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setShowSavePresetModal(true)}
                className="rounded-lg bg-emerald-900/50 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-900/70"
              >
                Save Filter
              </button>
              {presetSummary ? <p className="text-sm text-slate-400">{presetSummary}</p> : null}
            </div>
          ) : null}
        </section>

        <div className="grid gap-6">
          {visibleSections.length === 0 ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-400 shadow-xl">
              {filtersActive ? 'No todos match your current filters.' : 'No todos in this section yet.'}
            </section>
          ) : (
            visibleSections.map(([label, items]) => (
              <section key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    {label} ({items.length})
                  </h2>
                </div>

                <ul className="space-y-3">
                  {items.map((todo) => (
                    <li key={todo.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4" data-testid="todo-row" data-todo-id={todo.id}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={(event) => void handleToggle(todo, event.target.checked)}
                            className="mt-1 h-5 w-5 rounded border-slate-700 bg-slate-950"
                            aria-label={`Toggle ${todo.title}`}
                          />
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`font-medium ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                                {todo.title}
                              </p>
                              <PriorityBadge priority={todo.priority} />
                              {todo.is_recurring && todo.recurrence_pattern ? (
                                <span className="rounded-full border border-violet-800 bg-violet-950/50 px-2 py-0.5 text-xs text-violet-200">
                                  {getRecurrenceLabel(todo.recurrence_pattern)}
                                </span>
                              ) : null}
                              {todo.reminder_minutes !== null ? (
                                <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-200">
                                  {getReminderLabel(todo.reminder_minutes)}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-slate-400">{formatDueDate(todo.due_date)}</p>
                            {(todo.subtasks ?? []).length > 0 ? (() => {
                              const progress = calculateSubtaskProgress(todo.subtasks ?? []);
                              return (
                                <div className="space-y-2">
                                  <p className="text-sm text-slate-300">
                                    {progress.completed}/{progress.total} completed ({progress.percent}%)
                                  </p>
                                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className={`h-full ${progress.percent === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                                      style={{ width: `${progress.percent}%` }}
                                    />
                                  </div>
                                  <ul className="space-y-2 text-sm text-slate-300">
                                    {(todo.subtasks ?? []).map((subtask) => (
                                      <li key={subtask.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                                        <label className="flex items-center gap-3">
                                          <input
                                            type="checkbox"
                                            checked={subtask.completed}
                                            onChange={(event) => void handleToggleSubtask(todo.id, subtask.id, event.target.checked)}
                                            aria-label={`Toggle subtask ${subtask.title}`}
                                          />
                                          <span className={subtask.completed ? 'text-slate-500 line-through' : ''}>{subtask.title}</span>
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteSubtask(todo.id, subtask.id, subtask.title)}
                                          className="text-rose-300 transition hover:text-rose-200"
                                          aria-label={`Delete subtask ${subtask.title}`}
                                        >
                                          Delete
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })() : null}
                            {(todo.tags ?? []).length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {(todo.tags ?? []).map((tag) => (
                                  <TagPill
                                    key={tag.id}
                                    tag={tag}
                                    selected={filters.tagId === tag.id}
                                    onClick={(selectedTag) =>
                                      setFilters((current) => ({
                                        ...current,
                                        tagId: current.tagId === selectedTag.id ? 'all' : selectedTag.id
                                      }))
                                    }
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => beginEdit(todo)}
                            className="text-sky-300 transition hover:text-sky-200"
                            aria-label={`Edit ${todo.title}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(todo.id, todo.title)}
                            className="text-rose-300 transition hover:text-rose-200"
                            aria-label={`Delete ${todo.title}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      {editingTodo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={cancelEdit}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit todo"
          >
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">Edit todo</h2>
              <p className="text-sm text-slate-400">Update title, due date, priority, recurrence, reminder, or tags.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSaveEdit}>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Title</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={editForm.title}
                    onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Due date</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={editForm.due_date}
                    onChange={(event) => setEditForm((current) => ({ ...current, due_date: event.target.value }))}
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Priority</span>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={editForm.priority}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        priority: event.target.value as Priority
                      }))
                    }
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Repeat</span>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={editForm.recurrence_pattern}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        recurrence_pattern: event.target.value as TodoFormState['recurrence_pattern'],
                        is_recurring: event.target.value !== ''
                      }))
                    }
                  >
                    {RECURRENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Reminder</span>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={editForm.reminder_minutes}
                    disabled={!editForm.due_date}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        reminder_minutes: event.target.value as TodoFormState['reminder_minutes']
                      }))
                    }
                  >
                    {REMINDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <span className="text-sm text-slate-300">Tags</span>
                {tags.length === 0 ? (
                  <p className="text-sm text-slate-500">No tags available yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <TagPill
                        key={tag.id}
                        tag={tag}
                        selected={editForm.tag_ids.includes(tag.id)}
                        onClick={(selectedTag) =>
                          setEditForm((current) => ({
                            ...current,
                            tag_ids: toggleTagId(current.tag_ids, selectedTag.id)
                          }))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Draft subtasks</span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-400"
                  value={editForm.subtasks_text}
                  onChange={(event) => setEditForm((current) => ({ ...current, subtasks_text: event.target.value }))}
                  placeholder={'One subtask per line\nPrepare agenda\nShare notes'}
                />
              </label>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showManageTags ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={() => {
            setShowManageTags(false);
            setEditingTag(null);
            setTagError(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Manage Tags"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Manage Tags</h2>
                <p className="text-sm text-slate-400">Create, edit, and delete your color-coded labels.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManageTags(false);
                  setEditingTag(null);
                  setTagError(null);
                }}
                className="text-slate-400 transition hover:text-slate-200"
              >
                Close
              </button>
            </div>

            <form className="mb-6 space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4" onSubmit={handleCreateTag}>
              <h3 className="text-lg font-semibold">Create tag</h3>
              <div className="grid gap-4 md:grid-cols-[1fr,120px,160px]">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Name</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Work"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Pick color</span>
                  <input
                    type="color"
                    className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value.toUpperCase())}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Hex code</span>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-sky-400"
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value.toUpperCase())}
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={tagSubmitting}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create Tag
              </button>
            </form>

            {tagError ? (
              <p role="alert" className="mb-4 rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                {tagError}
              </p>
            ) : null}

            <div className="space-y-3">
              {tags.length === 0 ? (
                <p className="text-sm text-slate-500">No tags created yet.</p>
              ) : (
                tags.map((tag) => (
                  <div key={tag.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4" data-testid="tag-row" data-tag-id={tag.id}>
                    {editingTag?.id === tag.id ? (
                      <form className="space-y-4" onSubmit={handleSaveTagEdit}>
                        <div className="grid gap-4 md:grid-cols-[1fr,120px,160px]">
                          <label className="space-y-2">
                            <span className="text-sm text-slate-300">Name</span>
                            <input
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                              value={editingTag.name}
                              onChange={(event) =>
                                setEditingTag((current) => (current ? { ...current, name: event.target.value } : current))
                              }
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm text-slate-300">Pick color</span>
                            <input
                              type="color"
                              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1"
                              value={editingTag.color}
                              onChange={(event) =>
                                setEditingTag((current) =>
                                  current ? { ...current, color: event.target.value.toUpperCase() } : current
                                )
                              }
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm text-slate-300">Hex code</span>
                            <input
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-sky-400"
                              value={editingTag.color}
                              onChange={(event) =>
                                setEditingTag((current) =>
                                  current ? { ...current, color: event.target.value.toUpperCase() } : current
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={tagSubmitting}
                            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTag(null)}
                            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <TagPill tag={tag} selected />
                        <div className="flex gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => setEditingTag({ id: tag.id, name: tag.name, color: tag.color })}
                            className="text-sky-300 transition hover:text-sky-200"
                            aria-label={`Edit tag ${tag.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTag(tag)}
                            className="text-rose-300 transition hover:text-rose-200"
                            aria-label={`Delete tag ${tag.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showTemplateManager ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={() => setShowTemplateManager(false)}>
          <div
            className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Templates"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Templates</h2>
                <p className="text-sm text-slate-400">Create todos instantly from your saved patterns.</p>
              </div>
              <button type="button" onClick={() => setShowTemplateManager(false)} className="text-slate-400 transition hover:text-slate-200">
                Close
              </button>
            </div>

            <div className="space-y-3">
              {templates.length === 0 ? (
                <p className="text-sm text-slate-500">No templates saved yet.</p>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4" data-testid="template-row" data-template-id={template.id}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{template.name}</h3>
                          <PriorityBadge priority={template.priority} />
                          {template.category ? (
                            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                              {template.category}
                            </span>
                          ) : null}
                          {template.is_recurring && template.recurrence_pattern ? (
                            <span className="rounded-full border border-violet-800 bg-violet-950/50 px-2 py-0.5 text-xs text-violet-200">
                              {getRecurrenceLabel(template.recurrence_pattern)}
                            </span>
                          ) : null}
                          {template.reminder_minutes !== null ? (
                            <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-200">
                              {getReminderLabel(template.reminder_minutes)}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-300">{template.title_template}</p>
                        {template.description ? <p className="text-sm text-slate-400">{template.description}</p> : null}
                      </div>

                      <div className="flex gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => void handleUseTemplate(template.id)}
                          className="rounded-lg bg-amber-700 px-4 py-2 font-medium text-white transition hover:bg-amber-600"
                          aria-label={`Use template ${template.name}`}
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(template.id)}
                          className="rounded-lg border border-rose-700 px-4 py-2 font-medium text-rose-200 transition hover:border-rose-500"
                          aria-label={`Delete template ${template.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showSaveTemplateModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={() => {
            setShowSaveTemplateModal(false);
            setSaveTemplateForm(INITIAL_TEMPLATE_FORM);
          }}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Save as Template"
          >
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">Save as Template</h2>
              <p className="text-sm text-slate-400">Capture this todo pattern for one-click reuse later.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSaveTemplate}>
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Name</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-400"
                  value={saveTemplateForm.name}
                  onChange={(event) => setSaveTemplateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Weekly Review"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-400"
                  value={saveTemplateForm.description}
                  onChange={(event) => setSaveTemplateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional notes about when to use this template"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Category</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-400"
                  value={saveTemplateForm.category}
                  onChange={(event) => setSaveTemplateForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Work"
                />
              </label>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setSaveTemplateForm(INITIAL_TEMPLATE_FORM);
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={templateSubmitting}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showSavePresetModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={() => {
            setShowSavePresetModal(false);
            setPresetName('');
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">Save filter preset</h2>
              <p className="mt-2 text-sm text-slate-400">{presetSummary || 'Choose a filter combination first.'}</p>
            </div>

            <form className="space-y-4" onSubmit={handleSaveCurrentPreset}>
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Preset name</span>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-400"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Morning focus"
                />
              </label>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSavePresetModal(false);
                    setPresetName('');
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
