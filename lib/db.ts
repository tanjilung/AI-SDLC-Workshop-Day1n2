import { sql, eq, gte, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg, { Pool } from 'pg';
import * as schema from './db-schema';
import type {
  CalendarDay,
  Holiday,
  ImportResult,
  Priority,
  RecurrencePattern,
  Subtask,
  Tag,
  Template,
  Todo,
  User,
  Authenticator,
} from './todo-types';

export { PRIORITY_ORDER, PRIORITY_VALUES } from './todo-types';
export type {
  CalendarDay,
  Holiday,
  ImportResult,
  Priority,
  RecurrencePattern,
  Subtask,
  Tag,
  Template,
  Todo,
  User,
  Authenticator,
};

// Configure pg to return dates as strings instead of Date objects
// Suppress pg-types errors since the API varies across versions
try {
  const _pgTypes = pg as any;
  if (_pgTypes?.types?.setTypeParser) {
    // @ts-ignore
    _pgTypes.types.setTypeParser((_pgTypes.types as any)?.DATE || (null), () => '');
  }
} catch {
  // pg-types not available in this version
}

let dbInstance: ReturnType<typeof drizzle> | null = null;
let poolInstance: Pool | null = null;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({
    connectionString,
    ssl: false, // Disable SSL for internal Docker connections
  });
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured. Run: cp .env.local .env');
    }
    poolInstance = createPool();
    dbInstance = drizzle(poolInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (poolInstance) {
    poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}

// Initialize database tables on first access
export async function createTables(db: ReturnType<typeof drizzle>): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS todos (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      notes TEXT,
      due_date TIMESTAMP,
      completed BOOLEAN DEFAULT FALSE,
      priority VARCHAR(20) DEFAULT 'medium',
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_pattern VARCHAR(20),
      reminder_minutes INTEGER,
      last_notification_sent TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) DEFAULT '#3b82f6',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id VARCHAR(255) NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      tag_id VARCHAR(255) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id VARCHAR(255) PRIMARY KEY,
      todo_id VARCHAR(255) NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      position INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS templates (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      title_template TEXT NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium',
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_pattern VARCHAR(20),
      reminder_minutes INTEGER,
      due_date_offset_minutes INTEGER,
      subtasks_json TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS holidays (
      date DATE PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      todo_id VARCHAR(255) NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      notification_type VARCHAR(50) NOT NULL,
      scheduled_for TIMESTAMP NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      counter BIGINT DEFAULT 0,
      transports TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
    CREATE INDEX IF NOT EXISTS idx_todos_user_completed ON todos(user_id, completed);
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
    CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_todo_id ON notifications(todo_id);
    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
  `);
}

// ==================== TODO OPERATIONS ====================

export async function createTodo(
  db: ReturnType<typeof drizzle>,
  todo: Omit<Todo, 'id' | 'created_at' | 'updated_at'>
): Promise<Todo> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso);
  await db.insert(schema.todos).values({
    id,
    userId: todo.user_id,
    title: todo.title,
    notes: todo.notes ?? null,
    dueDate: todo.due_date ? new Date(todo.due_date) : null,
    completed: todo.completed,
    priority: todo.priority,
    isRecurring: todo.is_recurring,
    recurrencePattern: todo.recurrence_pattern ?? null,
    reminderMinutes: todo.reminder_minutes ?? null,
    lastNotificationSent: todo.last_notification_sent ? new Date(todo.last_notification_sent) : null,
    createdAt: now,
    updatedAt: now,
    completedAt: todo.completed_at ? new Date(todo.completed_at) : null,
  });

  return { ...todo, id, created_at: nowIso, updated_at: nowIso } as Todo;
}

export async function getTodosByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.userId, userId));
  // Map drizzle result rows into API Todo shape (ISO strings)
  const mapped = rows.map((r: any) => ({
    id: r.id,
    user_id: r.userId,
    title: r.title,
    notes: r.notes ?? null,
    due_date: r.dueDate ? new Date(r.dueDate).toISOString() : null,
    completed: r.completed,
    priority: r.priority,
    is_recurring: r.isRecurring,
    recurrence_pattern: r.recurrencePattern ?? null,
    reminder_minutes: r.reminderMinutes ?? null,
    last_notification_sent: r.lastNotificationSent ? new Date(r.lastNotificationSent).toISOString() : null,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    completed_at: r.completedAt ? new Date(r.completedAt).toISOString() : null,
  })) as Todo[];

  // Restore previous ordering: priority (high, medium, low) then created_at DESC
  const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
  mapped.sort((a, b) => {
    const p = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    if (p !== 0) return p;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return mapped;
}

export async function getTodoById(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Todo | null> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.id, todoId)).limit(1);
  const row = rows[0];
  return row ? mapTodoRow(row) : null;
}

export async function getCompletedTodosByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.userId, userId) as any, eq(schema.todos.completed, true) as any);
  const mapped = rows.map((r: any) => mapTodoRow(r));
  // Order by completed_at desc
  mapped.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
  return mapped;
}

export async function updateTodo(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>
): Promise<Todo> {
  const setObj: any = {};
  if (updates.title !== undefined) setObj.title = updates.title;
  if (updates.notes !== undefined) setObj.notes = updates.notes ?? null;
  if (updates.due_date !== undefined) setObj.dueDate = updates.due_date ? new Date(updates.due_date) : null;
  if (updates.completed !== undefined) {
    setObj.completed = updates.completed;
    setObj.completedAt = updates.completed ? new Date() : null;
  }
  if (updates.priority !== undefined) setObj.priority = updates.priority;
  if (updates.is_recurring !== undefined) setObj.isRecurring = updates.is_recurring;
  if (updates.recurrence_pattern !== undefined) setObj.recurrencePattern = updates.recurrence_pattern || null;
  if (updates.reminder_minutes !== undefined) setObj.reminderMinutes = updates.reminder_minutes || null;
  if (updates.last_notification_sent !== undefined) setObj.lastNotificationSent = updates.last_notification_sent ? new Date(updates.last_notification_sent) : null;

  setObj.updatedAt = new Date();

  await db.update(schema.todos).set(setObj).where(eq(schema.todos.id, id));

  const rows = await db.select().from(schema.todos).where(eq(schema.todos.id, id)).limit(1);
  let todo = rows[0] ? mapTodoRow(rows[0]) : null;
  if (todo) {
    todo.tags = await getTagsForTodo(db, id);
    todo.subtasks = await getSubtasksForTodo(db, id);
  }
  return todo!;
}

export async function deleteTodo(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.delete(schema.todos).where(eq(schema.todos.id, id));
}

// ==================== TAG OPERATIONS ====================

export async function createTag(
  db: ReturnType<typeof drizzle>,
  tag: Omit<Tag, 'id' | 'created_at' | 'updated_at'>
): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.tags).values({
    id,
    userId: tag.user_id,
    name: tag.name,
    color: tag.color,
    createdAt: now,
    updatedAt: now,
  });
  return { ...tag, id, created_at: now.toISOString(), updated_at: now.toISOString() };
}

export async function deleteTag(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.delete(schema.tags).where(eq(schema.tags.id, id));
}

export async function addTagToTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  tagId: string
): Promise<void> {
  // Use raw SQL with ON CONFLICT DO NOTHING for idempotent attachment
  await db.execute(sql`
    INSERT INTO todo_tags (todo_id, tag_id) VALUES (${todoId}, ${tagId})
    ON CONFLICT DO NOTHING
  `);
}

export async function removeTagFromTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  tagId: string
): Promise<void> {
  await db.delete(schema.todoTags).where(eq(schema.todoTags.todoId, todoId)).where(eq(schema.todoTags.tagId, tagId));
}

export async function getTagsForTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Tag[]> {
  const rows = await db
    .select()
    .from(schema.tags)
    .innerJoin(schema.todoTags, eq(schema.tags.id, schema.todoTags.tagId))
    .where(eq(schema.todoTags.todoId, todoId));
  return rows.map((r: any) => mapTagRow(r));
}

export async function getTodosByTagName(
  db: ReturnType<typeof drizzle>,
  tagName: string
): Promise<Todo[]> {
  const rows = await db
    .select()
    .from(schema.todos)
    .innerJoin(schema.todoTags, eq(schema.todos.id, schema.todoTags.todoId))
    .innerJoin(schema.tags, eq(schema.todoTags.tagId, schema.tags.id))
    .where(eq(schema.tags.name, tagName));
  const mapped = rows.map((r: any) => mapTodoRow(r));
  mapped.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return mapped;
}

export async function getUserTags(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Tag[]> {
  const rows = await db.select().from(schema.tags).where(eq(schema.tags.userId, userId));
  const mapped = rows.map((r: any) => mapTagRow(r));
  mapped.sort((a, b) => a.name.localeCompare(b.name));
  return mapped;
}

// ==================== SUBTASK OPERATIONS ====================

export async function createSubtask(
  db: ReturnType<typeof drizzle>,
  subtask: Omit<Subtask, 'id' | 'created_at' | 'updated_at'>
): Promise<Subtask> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.subtasks).values({
    id,
    todoId: subtask.todo_id,
    title: subtask.title,
    completed: subtask.completed,
    position: subtask.position,
    createdAt: now,
    updatedAt: now,
  });
  return { ...subtask, id, created_at: now.toISOString(), updated_at: now.toISOString() };
}

export async function updateSubtask(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Pick<Subtask, 'title' | 'completed' | 'position'>>
): Promise<Subtask> {
  const setObj: any = {};
  if (updates.title !== undefined) setObj.title = updates.title;
  if (updates.completed !== undefined) setObj.completed = updates.completed;
  if (updates.position !== undefined) setObj.position = updates.position;
  setObj.updatedAt = new Date();

  await db.update(schema.subtasks).set(setObj).where(eq(schema.subtasks.id, id));
  const rows = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id)).limit(1);
  return rows[0] ? mapSubtaskRow(rows[0])! : (updates as unknown as Subtask);
}

export async function deleteSubtask(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id));
}

export async function getSubtasksForTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Subtask[]> {
  const rows = await db.select().from(schema.subtasks).where(eq(schema.subtasks.todoId, todoId));
  const mapped = rows.map((r: any) => mapSubtaskRow(r));
  mapped.sort((a, b) => (a.position || 0) - (b.position || 0));
  return mapped;
}

export async function bulkUpdateSubtaskPositions(
  db: ReturnType<typeof drizzle>,
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  for (const update of updates) {
    await db.update(schema.subtasks).set({ position: update.position, updatedAt: new Date() }).where(eq(schema.subtasks.id, update.id));
  }
}

// ==================== TEMPLATE OPERATIONS ====================

export async function createTemplate(
  db: ReturnType<typeof drizzle>,
  template: Omit<Template, 'id' | 'created_at' | 'updated_at'>
): Promise<Template> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.templates).values({
    id,
    userId: template.user_id,
    name: template.name,
    description: template.description ?? null,
    category: template.category ?? null,
    titleTemplate: template.title_template,
    priority: template.priority,
    isRecurring: template.is_recurring,
    recurrencePattern: template.recurrence_pattern ?? null,
    reminderMinutes: template.reminder_minutes ?? null,
    dueDateOffsetMinutes: template.due_date_offset_minutes ?? null,
    subtasksJson: template.subtasks_json ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { ...template, id, created_at: now.toISOString(), updated_at: now.toISOString() };
}

export async function getTemplatesByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Template[]> {
  const rows = await db.select().from(schema.templates).where(eq(schema.templates.userId, userId));
  const mapped = rows.map((r: any) => mapTemplateRow(r));
  mapped.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return mapped;
}

export async function getTemplateById(
  db: ReturnType<typeof drizzle>,
  templateId: string
): Promise<Template | null> {
  const rows = await db.select().from(schema.templates).where(eq(schema.templates.id, templateId)).limit(1);
  return rows[0] ? mapTemplateRow(rows[0]) : null;
}

export async function updateTemplate(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Omit<Template, 'id' | 'user_id' | 'created_at'>>
): Promise<Template> {
  const setObj: any = {};
  if (updates.name !== undefined) setObj.name = updates.name;
  if (updates.description !== undefined) setObj.description = updates.description ?? null;
  if (updates.category !== undefined) setObj.category = updates.category || null;
  if (updates.title_template !== undefined) setObj.titleTemplate = updates.title_template;
  if (updates.priority !== undefined) setObj.priority = updates.priority;
  if (updates.is_recurring !== undefined) setObj.isRecurring = updates.is_recurring;
  if (updates.recurrence_pattern !== undefined) setObj.recurrencePattern = updates.recurrence_pattern || null;
  if (updates.reminder_minutes !== undefined) setObj.reminderMinutes = updates.reminder_minutes || null;
  if (updates.due_date_offset_minutes !== undefined) setObj.dueDateOffsetMinutes = updates.due_date_offset_minutes || null;
  if (updates.subtasks_json !== undefined) setObj.subtasksJson = updates.subtasks_json || null;
  setObj.updatedAt = new Date();

  await db.update(schema.templates).set(setObj).where(eq(schema.templates.id, id));
  const rows = await db.select().from(schema.templates).where(eq(schema.templates.id, id)).limit(1);
  return mapTemplateRow(rows[0]);
}

export async function deleteTemplate(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.delete(schema.templates).where(eq(schema.templates.id, id));
}

// ==================== HOLIDAY OPERATIONS ====================

export async function upsertHoliday(
  db: ReturnType<typeof drizzle>,
  holiday: Omit<Holiday, 'created_at'>
): Promise<void> {
  const dateStr = typeof holiday.date === 'string' ? holiday.date : new Date(holiday.date).toISOString().split('T')[0];
  try {
    // Try to use Drizzle upsert helpers if available
    // @ts-ignore
    await db.insert(schema.holidays).values({ date: dateStr, name: holiday.name, createdAt: new Date() }).onConflictDoUpdate({ target: 'date', set: { name: holiday.name } });
  } catch {
    // Fallback to raw SQL ON CONFLICT for portability
    await db.execute(sql`INSERT INTO holidays (date, name) VALUES (${dateStr}, ${holiday.name}) ON CONFLICT (date) DO UPDATE SET name = ${holiday.name}`);
  }
}

export async function getHolidaysBetween(
  db: ReturnType<typeof drizzle>,
  startDate: Date,
  endDate: Date
): Promise<Holiday[]> {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  const rows = await db
    .select()
    .from(schema.holidays)
    .where(gte(schema.holidays.date, startStr) as any)
    .where(lte(schema.holidays.date, endStr) as any);
  const mapped = rows.map((r: any) => mapHolidayRow(r));
  mapped.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return mapped;
}

export async function getAllHolidays(db: ReturnType<typeof drizzle>): Promise<Holiday[]> {
  const rows = await db.select().from(schema.holidays);
  const mapped = rows.map((r: any) => mapHolidayRow(r));
  mapped.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return mapped;
}

// ==================== CALENDAR OPERATIONS ====================

export async function buildCalendarMonth(
  _db: ReturnType<typeof drizzle>,
  year: number,
  month: number
): Promise<CalendarDay[]> {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const days: CalendarDay[] = [];

  // Add padding days from previous month
  const startDayOfWeek = firstDay.getDay();
  for (let i = 0; i < startDayOfWeek; i++) {
    const date = new Date(year, month - 1, -(startDayOfWeek - i - 1));
    const dateStr = date.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      isCurrentMonth: false,
      isToday: false,
      isPast: date < new Date(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }

  // Add days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = date.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    days.push({
      date: dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isPast: date < new Date() && date.getDate() !== new Date().getDate(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }

  // Add padding days from next month
  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month, i);
    const dateStr = date.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      isCurrentMonth: false,
      isToday: false,
      isPast: false,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }

  return days;
}

// ==================== NOTIFICATION OPERATIONS ====================

export async function createNotificationLog(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  scheduledFor: Date
): Promise<void> {
  await db.insert(schema.notifications).values({
    todoId,
    notificationType: 'due_reminder',
    scheduledFor,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function updateNotificationStatus(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  status: string
): Promise<void> {
  // Update the most-recent pending notification for the todo
  await db.execute(sql`
    UPDATE notifications SET status = ${status}, updated_at = ${new Date().toISOString()}
    WHERE id = (
      SELECT id FROM notifications WHERE todo_id = ${todoId} AND status = 'pending' ORDER BY scheduled_for DESC LIMIT 1
    )
  `);
}

export async function markAsSent(db: ReturnType<typeof drizzle>, notificationId: number): Promise<void> {
  await db.update(schema.notifications).set({ status: 'sent', updatedAt: new Date() }).where(eq(schema.notifications.id, notificationId));
}

// ==================== AUTH OPERATIONS ====================

export async function getUserByUsername(
  db: ReturnType<typeof drizzle>,
  username: string
): Promise<User | null> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function createUser(
  db: ReturnType<typeof drizzle>,
  userData: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password_hash?: string }
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.users).values({ id, username: userData.username, passwordHash: userData.password_hash ?? null, createdAt: now, updatedAt: now });
  return { ...userData, id, created_at: now.toISOString(), updated_at: now.toISOString() } as User;
}

export async function getUserByCredentialId(
  db: ReturnType<typeof drizzle>,
  credentialId: string
): Promise<User | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .innerJoin(schema.authenticators, eq(schema.users.id, schema.authenticators.userId))
    .where(eq(schema.authenticators.credentialId, credentialId))
    .limit(1);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function createAuthenticator(
  db: ReturnType<typeof drizzle>,
  auth: Omit<Authenticator, 'created_at' | 'updated_at'>
): Promise<Authenticator> {
  const now = new Date();
  await db.insert(schema.authenticators).values({
    credentialId: auth.credential_id,
    userId: auth.user_id,
    publicKey: auth.public_key,
    counter: auth.counter ?? 0,
    transports: auth.transports ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { ...auth, created_at: now.toISOString(), updated_at: now.toISOString() };
}

export async function getAuthenticatorsByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Authenticator[]> {
  const rows = await db.select().from(schema.authenticators).where(eq(schema.authenticators.userId, userId));
  return rows.map((r: any) => mapAuthenticatorRow(r));
}

export async function deleteAuthenticator(db: ReturnType<typeof drizzle>, credentialId: string): Promise<void> {
  await db.delete(schema.authenticators).where(eq(schema.authenticators.credentialId, credentialId));
}

// ==================== EXPORT/IMPORT OPERATIONS ====================

export async function exportTodos(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.userId, userId));
  const mapped = rows.map((r: any) => mapTodoRow(r));
  mapped.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return mapped;
}

export async function importTodos(
  db: ReturnType<typeof drizzle>,
  userId: string,
  todos: Array<Partial<Pick<Todo, 'id'>> & Omit<Todo, 'id' | 'created_at' | 'updated_at'>>,
  tags: Omit<Tag, 'id' | 'created_at' | 'updated_at'>[]
): Promise<ImportResult> {
  let createdCount = 0;
  let updatedCount = 0;
  let tagsCreated = 0;
  let tagsReused = 0;

  // Create or reuse tags
  for (const tag of tags) {
    const existing = await db.select().from(schema.tags).where(eq(schema.tags.userId, userId) as any).where(eq(schema.tags.name, tag.name) as any);
    if (existing.length > 0) {
      tagsReused++;
    } else {
      const tagId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.tags).values({ id: tagId, userId, name: tag.name, color: tag.color, createdAt: now, updatedAt: now });
      tagsCreated++;
    }
  }

  for (const todo of todos) {
    const existing = todo.id ? await db.select().from(schema.todos).where(eq(schema.todos.id, todo.id)).limit(1) : [];
    if (existing.length > 0) {
      // Update existing (not implemented granularly here)
      updatedCount++;
    } else {
      await createTodo(db, todo as Omit<Todo, 'id' | 'created_at' | 'updated_at'> & { user_id: string });
      createdCount++;
    }
  }

  return { imported: createdCount, tagsCreated, tagsReused };
}

// ==================== RECURRENCE OPERATIONS ====================

export async function expandRecurrence(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  startDate: Date,
  endDate: Date
): Promise<Todo[]> {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const result = await db.execute(sql`
    SELECT * FROM todos WHERE id = ${todoId} AND is_recurring = true AND due_date BETWEEN ${startStr} AND ${endStr}
  `);
  
  return result.rows.map(mapTodoRow);
}

export async function getNextOccurrenceFromRecurrence(
  _db: ReturnType<typeof drizzle>,
  recurrencePattern: string,
  afterDate: Date
): Promise<string | null> {
  return calculateNextOccurrence(recurrencePattern, afterDate);
}

// ==================== HELPER FUNCTIONS ====================

function mapTodoRow(row: any): Todo {
  const userId = row.user_id ?? row.userId;
  const due = row.due_date ?? row.dueDate;
  const lastNotif = row.last_notification_sent ?? row.lastNotificationSent;
  return {
    id: row.id,
    user_id: userId,
    title: row.title,
    notes: row.notes,
    due_date: due ? (typeof due === 'string' ? due : new Date(due).toISOString()) : null,
    completed: row.completed,
    priority: row.priority as Priority,
    is_recurring: row.is_recurring ?? row.isRecurring,
    recurrence_pattern: row.recurrence_pattern ?? row.recurrencePattern,
    reminder_minutes: row.reminder_minutes ?? row.reminderMinutes,
    last_notification_sent: lastNotif ? (typeof lastNotif === 'string' ? lastNotif : new Date(lastNotif).toISOString()) : null,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
    completed_at: (row.completed_at ?? row.completedAt) ? (typeof (row.completed_at ?? row.completedAt) === 'string' ? (row.completed_at ?? row.completedAt) : new Date(row.completed_at ?? row.completedAt).toISOString()) : null,
  } as Todo;
}

function mapSubtaskRow(row: any): Subtask {
  const todoId = row.todo_id ?? row.todoId;
  return {
    id: row.id,
    todo_id: todoId,
    title: row.title,
    completed: row.completed,
    position: row.position,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
  };
}

function mapTagRow(row: any): Tag {
  const userId = row.user_id ?? row.userId;
  return {
    id: row.id,
    user_id: userId,
    name: row.name,
    color: row.color || '#3b82f6',
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
  };
}

function mapTemplateRow(row: any): Template {
  return {
    id: row.id,
    user_id: row.user_id ?? row.userId,
    name: row.name,
    description: row.description,
    category: row.category,
    title_template: row.title_template ?? row.titleTemplate,
    priority: row.priority as Priority,
    is_recurring: row.is_recurring ?? row.isRecurring,
    recurrence_pattern: row.recurrence_pattern ?? row.recurrencePattern,
    reminder_minutes: row.reminder_minutes ?? row.reminderMinutes,
    due_date_offset_minutes: row.due_date_offset_minutes ?? row.dueDateOffsetMinutes,
    subtasks_json: row.subtasks_json ?? row.subtasksJson,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
  };
}

function mapHolidayRow(row: any): Holiday {
  return {
    date: row.date,
    name: row.name,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
  };
}

function mapUserRow(row: any): User {
  return {
    id: row.id,
    username: row.username,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
  };
}

function mapAuthenticatorRow(row: any): Authenticator {
  return {
    credential_id: row.credential_id ?? row.credentialId,
    user_id: row.user_id ?? row.userId,
    public_key: row.public_key ?? row.publicKey,
    counter: Number(row.counter ?? row.counter),
    transports: row.transports,
    created_at: typeof (row.created_at ?? row.createdAt) === 'string' ? (row.created_at ?? row.createdAt) : new Date(row.created_at ?? row.createdAt).toISOString(),
    updated_at: typeof (row.updated_at ?? row.updatedAt) === 'string' ? (row.updated_at ?? row.updatedAt) : new Date(row.updated_at ?? row.updatedAt).toISOString(),
  };
}

// ==================== RECURRENCE CALCULATION HELPERS ====================

function calculateNextOccurrence(recurrencePattern: string, afterDate: Date): string | null {
  switch (recurrencePattern) {
    case 'daily':
      return new Date(afterDate.getTime() + 86400000).toISOString();
    case 'weekly':
      return new Date(afterDate.getTime() + 7 * 86400000).toISOString();
    case 'monthly':
      const nextMonth = new Date(afterDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth.toISOString();
    case 'yearly':
      const nextYear = new Date(afterDate);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      return nextYear.toISOString();
    default:
      return null;
  }
}

export function resolveRecurrencePattern(pattern: string | null): RecurrencePattern | null {
  if (!pattern) return null;
  const valid: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
  return valid.includes(pattern as RecurrencePattern) ? (pattern as RecurrencePattern) : null;
}

// ==================== DATABASE FACADE LAYER ====================

// Cache the facade so we only create it once
let todoFacade: TodoFacade | null = null;
let tagFacade: TagFacade | null = null;
let subtaskFacade: SubtaskFacade | null = null;
let templateFacade: TemplateFacade | null = null;
let holidayFacade: HolidayFacade | null = null;
let authFacade: AuthFacade | null = null;

interface TodoFacade {
  create(todo: Omit<Todo, 'id' | 'created_at' | 'updated_at'>): Promise<Todo>;
  findAll(userId: string): Promise<Todo[]>;
  findAllWithRelations(userId: string): Promise<(Todo & { tags?: Tag[]; subtasks?: Subtask[] })[]>;
  findByIdForUser(todoId: string, userId: string): Promise<(Todo & { tags?: Tag[]; subtasks?: Subtask[] }) | null>;
  update(id: string, userId: string, updates: Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>): Promise<Todo>;
  delete(id: string, userId: string): Promise<boolean>;
  findByRange(userId: string, startDate: Date, endDate: Date): Promise<Todo[]>;
  findAllByUser(userId: string): Promise<Todo[]>;
  importAll(userId: string, todosData: any[]): Promise<ImportResult>;
}

interface TagFacade {
  create(userId: string, data: Omit<Tag, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Tag>;
  findAllByUser(userId: string): Promise<Tag[]>;
  findById(id: string, userId: string): Promise<Tag | null>;
  update(id: string, userId: string, updates: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag>;
  delete(id: string, userId: string): Promise<boolean>;
  attachToTodo(todoId: string, tagId: string, userId: string): Promise<boolean>;
  detachFromTodo(todoId: string, tagId: string, userId: string): Promise<boolean>;
}

interface SubtaskFacade {
  create(data: Omit<Subtask, 'id' | 'created_at' | 'updated_at'>): Promise<Subtask>;
  findById(id: string, userId: string): Promise<Subtask | null>;
  update(id: string, userId: string, updates: Partial<Pick<Subtask, 'title' | 'completed' | 'position'>>): Promise<Subtask>;
  delete(id: string, userId: string): Promise<boolean>;
  findAllByTodo(todoId: string): Promise<Subtask[]>;
}

interface TemplateFacade {
  create(data: Omit<Template, 'id' | 'created_at' | 'updated_at'>): Promise<Template>;
  findAllByUser(userId: string): Promise<Template[]>;
  findById(id: string, userId: string): Promise<Template | null>;
  update(id: string, userId: string, updates: Partial<Omit<Template, 'id' | 'user_id' | 'created_at'>>): Promise<Template>;
  delete(id: string, userId: string): Promise<boolean>;
}

interface HolidayFacade {
  create(holiday: Omit<Holiday, 'created_at'>): Promise<void>;
  findAll(): Promise<Holiday[]>;
  findByRange(startDate: Date, endDate: Date): Promise<Holiday[]>;
}

interface AuthFacade {
  createUser(username: string, passwordHash: string): Promise<User>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByCredentialId(credentialId: string): Promise<User | null>;
  createAuthenticator(auth: Omit<Authenticator, 'created_at' | 'updated_at'>): Promise<Authenticator>;
  getAuthenticatorsByUserId(userId: string): Promise<Authenticator[]>;
  deleteAuthenticator(credentialId: string): Promise<void>;
}

function createTodoFacade(): TodoFacade {
  const db = getDb();
  return {
    async create(todoData) {
      return createTodo(db, todoData);
    },
    async findAll(userId) {
      return getTodosByUserId(db, userId);
    },
    async findAllWithRelations(userId) {
      const todos = await getTodosByUserId(db, userId);
      const result = [];
      for (const todo of todos) {
        const tags = await getTagsForTodo(db, todo.id);
        const subtasks = await getSubtasksForTodo(db, todo.id);
        result.push({ ...todo, tags, subtasks });
      }
      return result;
    },
    async findByIdForUser(todoId, userId) {
      const todo = await getTodoById(db, todoId);
      if (!todo || todo.user_id !== userId) return null;
      const tags = await getTagsForTodo(db, todo.id);
      const subtasks = await getSubtasksForTodo(db, todo.id);
      return { ...todo, tags, subtasks };
    },
    async update(id, userId, updates) {
      const todo = await getTodoById(db, id);
      if (!todo || todo.user_id !== userId) throw new Error('Todo not found');
      return updateTodo(db, id, updates);
    },
    async delete(id, userId) {
      const todo = await getTodoById(db, id);
      if (!todo || todo.user_id !== userId) return false;
      await deleteTodo(db, id);
      return true;
    },
    async findByRange(userId, startDate, endDate) {
      const rows = await db
        .select()
        .from(schema.todos)
        .where(eq(schema.todos.userId, userId) as any)
        .where(gte(schema.todos.dueDate, startDate) as any)
        .where(lte(schema.todos.dueDate, endDate) as any);
      return rows.map(mapTodoRow);
    },
    async findAllByUser(userId) {
      const rows = await db.select().from(schema.todos).where(eq(schema.todos.userId, userId));
      const mapped = rows.map((r: any) => mapTodoRow(r));
      mapped.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return mapped;
    },
    async importAll(userId, todosData) {
      let createdCount = 0;
      for (const data of todosData) {
        const existing = data.id ? await db.select().from(schema.todos).where(eq(schema.todos.id, data.id)).limit(1) : [];
        if (existing.length > 0) {
          continue; // Skip existing during import
        }
        await createTodo(db, data as Omit<Todo, 'id' | 'created_at' | 'updated_at'> & { user_id: string });
        createdCount++;
      }
      return { imported: createdCount, tagsCreated: 0, tagsReused: 0 };
    },
  };
}

function createTagFacade(): TagFacade {
  const db = getDb();
  return {
    async create(userId, data) {
      return createTag(db, { ...data, user_id: userId });
    },
    async findAllByUser(userId) {
      return getUserTags(db, userId);
    },
    async findById(id, userId) {
          const rows = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).where(eq(schema.tags.userId, userId)).limit(1);
          if (!rows.length) return null;
          return mapTagRow(rows[0]);
        },
        async update(id, userId, updates) {
          const existing = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).where(eq(schema.tags.userId, userId)).limit(1);
          if (!existing.length) throw new Error('Tag not found');
          const setObj: any = {};
          if (updates.name !== undefined) setObj.name = updates.name;
          if (updates.color !== undefined) setObj.color = updates.color;
          setObj.updatedAt = new Date();
          await db.update(schema.tags).set(setObj).where(eq(schema.tags.id, id));
          const rows = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).limit(1);
          return mapTagRow(rows[0]);
        },
        async delete(id, userId) {
          const existing = await db.select().from(schema.tags).where(eq(schema.tags.id, id)).where(eq(schema.tags.userId, userId)).limit(1);
          if (!existing.length) return false;
          await db.delete(schema.tags).where(eq(schema.tags.id, id));
          return true;
        },

    async attachToTodo(todoId, tagId, userId) {
          const tag = await db.select().from(schema.tags).where(eq(schema.tags.id, tagId)).where(eq(schema.tags.userId, userId)).limit(1);
          if (!tag.length) return false;
          // Use Drizzle insert with onConflictDoNothing when available; fallback to raw SQL if not
          try {
            // @ts-ignore - onConflictDoNothing may exist depending on drizzle version
            await db.insert(schema.todoTags).values({ todoId, tagId }).onConflictDoNothing();
          } catch {
            // fallback to raw SQL if the dialect doesn't support the builder method
            await db.execute(sql`INSERT INTO todo_tags (todo_id, tag_id) VALUES (${todoId}, ${tagId}) ON CONFLICT DO NOTHING`);
          }
          return true;
        },
        async detachFromTodo(todoId, tagId, userId) {
          const tag = await db.select().from(schema.tags).where(eq(schema.tags.id, tagId)).where(eq(schema.tags.userId, userId)).limit(1);
          if (!tag.length) return false;
          await db.delete(schema.todoTags).where(eq(schema.todoTags.todoId, todoId)).where(eq(schema.todoTags.tagId, tagId));
          return true;
        },

  };
}

function createSubtaskFacade(): SubtaskFacade {
  const db = getDb();
  return {
    async create(data) {
      return createSubtask(db, data);
    },
    async findById(id, userId) {
      const rows = await db
        .select()
        .from(schema.subtasks)
        .innerJoin(schema.todos, eq(schema.subtasks.todoId, schema.todos.id))
        .where(eq(schema.subtasks.id, id))
        .where(eq(schema.todos.userId, userId))
        .limit(1);
      return rows[0] ? mapSubtaskRow(rows[0]) : null;
    },
    async update(id, userId, updates) {
      const existing = await db
        .select()
        .from(schema.subtasks)
        .innerJoin(schema.todos, eq(schema.subtasks.todoId, schema.todos.id))
        .where(eq(schema.subtasks.id, id))
        .where(eq(schema.todos.userId, userId))
        .limit(1);
      if (!existing.length) throw new Error('Subtask not found');
      return updateSubtask(db, id, updates);
    },
    async delete(id, userId) {
      const existing = await db
        .select()
        .from(schema.subtasks)
        .innerJoin(schema.todos, eq(schema.subtasks.todoId, schema.todos.id))
        .where(eq(schema.subtasks.id, id))
        .where(eq(schema.todos.userId, userId))
        .limit(1);
      if (!existing.length) return false;
      await deleteSubtask(db, id);
      return true;
    },
    async findAllByTodo(todoId) {
      return getSubtasksForTodo(db, todoId);
    },
  };
}

function createTemplateFacade(): TemplateFacade {
  const db = getDb();
  return {
    async create(data) {
      return createTemplate(db, data);
    },
    async findAllByUser(userId) {
      return getTemplatesByUserId(db, userId);
    },
    async findById(id, userId) {
      const rows = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, id))
        .where(eq(schema.templates.userId, userId))
        .limit(1);
      return rows[0] ? mapTemplateRow(rows[0]) : null;
    },
    async update(id, userId, updates) {
      const existing = await db.select().from(schema.templates).where(eq(schema.templates.id, id)).where(eq(schema.templates.userId, userId)).limit(1);
      if (!existing.length) throw new Error('Template not found');
      return updateTemplate(db, id, updates);
    },
    async delete(id, userId) {
      const existing = await db.select().from(schema.templates).where(eq(schema.templates.id, id)).where(eq(schema.templates.userId, userId)).limit(1);
      if (!existing.length) return false;
      await deleteTemplate(db, id);
      return true;
    },
  };
}

function createHolidayFacade(): HolidayFacade {
  const db = getDb();
  return {
    async create(holidayData) {
      return upsertHoliday(db, holidayData);
    },
    async findAll() {
      return getAllHolidays(db);
    },
    async findByRange(startDate, endDate) {
      return getHolidaysBetween(db, startDate, endDate);
    },
  };
}

function createAuthFacade(): AuthFacade {
  const db = getDb();
  return {
    async createUser(username, passwordHash) {
      return createUser(db, { username, password_hash: passwordHash });
    },
    async getUserByUsername(username) {
      return getUserByUsername(db, username);
    },
    async getUserByCredentialId(credentialId) {
      return getUserByCredentialId(db, credentialId);
    },
    async createAuthenticator(authData) {
      return createAuthenticator(db, authData);
    },
    async getAuthenticatorsByUserId(userId) {
      return getAuthenticatorsByUserId(db, userId);
    },
    async deleteAuthenticator(credentialId) {
      return deleteAuthenticator(db, credentialId);
    },
  };
}

export function getTodoDB(): TodoFacade {
  if (!todoFacade) todoFacade = createTodoFacade();
  return todoFacade;
}

export function getTagDB(): TagFacade {
  if (!tagFacade) tagFacade = createTagFacade();
  return tagFacade;
}

export function getSubtaskDB(): SubtaskFacade {
  if (!subtaskFacade) subtaskFacade = createSubtaskFacade();
  return subtaskFacade;
}

export function getTemplateDB(): TemplateFacade {
  if (!templateFacade) templateFacade = createTemplateFacade();
  return templateFacade;
}

export function getHolidayDB(): HolidayFacade {
  if (!holidayFacade) holidayFacade = createHolidayFacade();
  return holidayFacade;
}

export function getAuthenticatorDB(): AuthFacade {
  if (!authFacade) authFacade = createAuthFacade();
  return authFacade;
}

export function getUserDB(): AuthFacade {
  return getAuthenticatorDB();
}
