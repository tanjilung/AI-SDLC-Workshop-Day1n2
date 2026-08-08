export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low'];
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export interface Subtask {
  id: string;
  todo_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  completed: boolean;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  date: string;
  name: string;
  created_at?: string;
}

export interface CalendarDay {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

export interface TodoExportItem {
  title: string;
  notes: string | null;
  due_date: string | null;
  completed: boolean;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  completed_at: string | null;
  subtasks: Array<Pick<Subtask, 'title' | 'completed' | 'position'>>;
  tags: Array<Pick<Tag, 'name' | 'color'>>;
}

export interface TodoExport {
  version: 1;
  exported_at: string;
  todos: TodoExportItem[];
}

export interface ImportResult {
  imported: number;
  tagsCreated: number;
  tagsReused: number;
}

export interface User {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface Authenticator {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  created_at: string;
  updated_at: string;
}
