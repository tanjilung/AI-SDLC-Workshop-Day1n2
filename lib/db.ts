import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg, { Pool } from 'pg';
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
      due_date DATE,
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
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO todos (id, user_id, title, notes, due_date, completed, priority, 
                       is_recurring, recurrence_pattern, reminder_minutes, 
                       last_notification_sent, created_at, updated_at, completed_at)
    VALUES (${id}, ${todo.user_id}, ${todo.title}, ${todo.notes || null},
            ${todo.due_date ? new Date(todo.due_date).toISOString().split('T')[0] : null},
            ${todo.completed}, ${todo.priority}, ${todo.is_recurring},
            ${todo.recurrence_pattern || null}, ${todo.reminder_minutes || null},
            ${todo.last_notification_sent ? new Date(todo.last_notification_sent).toISOString() : null},
            ${now}, ${now}, ${todo.completed_at ? new Date(todo.completed_at).toISOString() : null})
  `);
  return { ...todo, id, created_at: now, updated_at: now } as Todo;
}

export async function getTodosByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const result = await db.execute(sql`
    SELECT * FROM todos WHERE user_id = ${userId} ORDER BY 
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
      created_at DESC
  `);
  return result.rows.map(mapTodoRow);
}

export async function getTodoById(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Todo | null> {
  const result = await db.execute(sql`SELECT * FROM todos WHERE id = ${todoId}`);
  const row = result.rows[0];
  return row ? mapTodoRow(row) : null;
}

export async function getCompletedTodosByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const result = await db.execute(sql`
    SELECT * FROM todos WHERE user_id = ${userId} AND completed = true ORDER BY completed_at DESC
  `);
  return result.rows.map(mapTodoRow);
}

export async function updateTodo(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>
): Promise<Todo> {
  // Build set clauses using drizzle-native interpolation so all params are tracked.
  const setExprs: ReturnType<typeof sql>[] = [];

  if (updates.title !== undefined) {
    setExprs.push(sql`title = ${updates.title}`);
  }
  if (updates.notes !== undefined) {
    setExprs.push(sql`notes = ${updates.notes ?? null}`);
  }
  if (updates.due_date !== undefined) {
    const mappedDueDate = updates.due_date ? new Date(updates.due_date).toISOString().split('T')[0] : null;
    setExprs.push(sql`due_date = ${mappedDueDate}`);
  }
  if (updates.completed !== undefined) {
    if (updates.completed) {
      const completedAt = new Date().toISOString();
      setExprs.push(sql`completed = ${updates.completed}, completed_at = ${completedAt}`);
    } else {
      setExprs.push(sql`completed = ${updates.completed}, completed_at = ${null}`);
    }
  }
  if (updates.priority !== undefined) {
    setExprs.push(sql`priority = ${updates.priority}`);
  }
  if (updates.is_recurring !== undefined) {
    setExprs.push(sql`is_recurring = ${updates.is_recurring}`);
  }
  if (updates.recurrence_pattern !== undefined) {
    setExprs.push(sql`recurrence_pattern = ${updates.recurrence_pattern || null}`);
  }
  if (updates.reminder_minutes !== undefined) {
    setExprs.push(sql`reminder_minutes = ${updates.reminder_minutes || null}`);
  }
  if (updates.last_notification_sent !== undefined) {
    const mappedNotif = updates.last_notification_sent ? new Date(updates.last_notification_sent).toISOString() : null;
    setExprs.push(sql`last_notification_sent = ${mappedNotif}`);
  }

  setExprs.push(sql`updated_at = ${new Date().toISOString()}`);

  await db.execute(sql`
    UPDATE todos SET ${sql.join(setExprs, sql`, `)} WHERE id = ${id}
  `);

  // Fetch the updated todo with tags
  const result = await db.execute(sql`SELECT * FROM todos WHERE id = ${id}`);
  let todo = result.rows[0] ? mapTodoRow(result.rows[0]) : null;
  
  if (todo) {
    todo.tags = await getTagsForTodo(db, id);
    todo.subtasks = await getSubtasksForTodo(db, id);
  }
  
  return todo!;
}

export async function deleteTodo(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM todos WHERE id = ${id}`);
}

// ==================== TAG OPERATIONS ====================

export async function createTag(
  db: ReturnType<typeof drizzle>,
  tag: Omit<Tag, 'id' | 'created_at' | 'updated_at'>
): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
    VALUES (${id}, ${tag.user_id}, ${tag.name}, ${tag.color}, ${now}, ${now})
  `);
  return { ...tag, id, created_at: now, updated_at: now };
}

export async function deleteTag(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM tags WHERE id = ${id}`);
}

export async function addTagToTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  tagId: string
): Promise<void> {
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
  await db.execute(sql`DELETE FROM todo_tags WHERE todo_id = ${todoId} AND tag_id = ${tagId}`);
}

export async function getTagsForTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Tag[]> {
  const result = await db.execute(sql`
    SELECT t.* FROM tags t
    INNER JOIN todo_tags tt ON t.id = tt.tag_id
    WHERE tt.todo_id = ${todoId}
  `);
  return result.rows.map((row: any) => ({
    ...row,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  }));
}

export async function getTodosByTagName(
  db: ReturnType<typeof drizzle>,
  tagName: string
): Promise<Todo[]> {
  const result = await db.execute(sql`
    SELECT todo.* FROM todos todo
    INNER JOIN todo_tags tt ON todo.id = tt.todo_id
    INNER JOIN tags t ON tt.tag_id = t.id
    WHERE t.name = ${tagName}
    ORDER BY created_at DESC
  `);
  return result.rows.map(mapTodoRow);
}

export async function getUserTags(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Tag[]> {
  const result = await db.execute(sql`SELECT * FROM tags WHERE user_id = ${userId} ORDER BY name`);
  return result.rows.map((row: any) => ({
    ...row,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  }));
}

// ==================== SUBTASK OPERATIONS ====================

export async function createSubtask(
  db: ReturnType<typeof drizzle>,
  subtask: Omit<Subtask, 'id' | 'created_at' | 'updated_at'>
): Promise<Subtask> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO subtasks (id, todo_id, title, completed, position, created_at, updated_at)
    VALUES (${id}, ${subtask.todo_id}, ${subtask.title}, ${subtask.completed}, ${subtask.position}, ${now}, ${now})
  `);
  return { ...subtask, id, created_at: now, updated_at: now };
}

export async function updateSubtask(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Pick<Subtask, 'title' | 'completed' | 'position'>>
): Promise<Subtask> {
  const setExprs: ReturnType<typeof sql>[] = [];

  if (updates.title !== undefined) { setExprs.push(sql`title = ${updates.title}`); }
  if (updates.completed !== undefined) { setExprs.push(sql`completed = ${updates.completed}`); }
  if (updates.position !== undefined) { setExprs.push(sql`position = ${updates.position}`); }
  setExprs.push(sql`updated_at = ${new Date().toISOString()}`);

  await db.execute(sql`
    UPDATE subtasks SET ${sql.join(setExprs, sql`, `)} WHERE id = ${id}
  `);

  const result = await db.execute(sql`SELECT * FROM subtasks WHERE id = ${id}`);
  return result.rows[0] ? mapSubtaskRow(result.rows[0])! : updates as unknown as Subtask;
}

export async function deleteSubtask(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM subtasks WHERE id = ${id}`);
}

export async function getSubtasksForTodo(
  db: ReturnType<typeof drizzle>,
  todoId: string
): Promise<Subtask[]> {
  const result = await db.execute(sql`SELECT * FROM subtasks WHERE todo_id = ${todoId} ORDER BY position ASC`);
  return result.rows.map(mapSubtaskRow);
}

export async function bulkUpdateSubtaskPositions(
  db: ReturnType<typeof drizzle>,
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  for (const update of updates) {
    await db.execute(sql`
      UPDATE subtasks SET position = ${update.position}, updated_at = ${new Date().toISOString()} WHERE id = ${update.id}
    `);
  }
}

// ==================== TEMPLATE OPERATIONS ====================

export async function createTemplate(
  db: ReturnType<typeof drizzle>,
  template: Omit<Template, 'id' | 'created_at' | 'updated_at'>
): Promise<Template> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO templates (id, user_id, name, description, category, title_template, priority,
                           is_recurring, recurrence_pattern, reminder_minutes, due_date_offset_minutes,
                           subtasks_json, created_at, updated_at)
    VALUES (${id}, ${template.user_id}, ${template.name}, ${template.description || null},
            ${template.category || null}, ${template.title_template}, ${template.priority},
            ${template.is_recurring}, ${template.recurrence_pattern || null},
            ${template.reminder_minutes || null}, ${template.due_date_offset_minutes || null},
            ${template.subtasks_json || null}, ${now}, ${now})
  `);
  return { ...template, id, created_at: now, updated_at: now };
}

export async function getTemplatesByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Template[]> {
  const result = await db.execute(sql`SELECT * FROM templates WHERE user_id = ${userId} ORDER BY name`);
  return result.rows.map(mapTemplateRow);
}

export async function getTemplateById(
  db: ReturnType<typeof drizzle>,
  templateId: string
): Promise<Template | null> {
  const result = await db.execute(sql`SELECT * FROM templates WHERE id = ${templateId}`);
  return result.rows[0] ? mapTemplateRow(result.rows[0]) : null;
}

export async function updateTemplate(
  db: ReturnType<typeof drizzle>,
  id: string,
  updates: Partial<Omit<Template, 'id' | 'user_id' | 'created_at'>>
): Promise<Template> {
  const setExprs: ReturnType<typeof sql>[] = [];

  if (updates.name !== undefined) { setExprs.push(sql`name = ${updates.name}`); }
  if (updates.description !== undefined) { setExprs.push(sql`description = ${updates.description ?? null}`); }
  if (updates.category !== undefined) { setExprs.push(sql`category = ${updates.category || null}`); }
  if (updates.title_template !== undefined) { setExprs.push(sql`title_template = ${updates.title_template}`); }
  if (updates.priority !== undefined) { setExprs.push(sql`priority = ${updates.priority}`); }
  if (updates.is_recurring !== undefined) { setExprs.push(sql`is_recurring = ${updates.is_recurring}`); }
  if (updates.recurrence_pattern !== undefined) { setExprs.push(sql`recurrence_pattern = ${updates.recurrence_pattern || null}`); }
  if (updates.reminder_minutes !== undefined) { setExprs.push(sql`reminder_minutes = ${updates.reminder_minutes || null}`); }
  if (updates.due_date_offset_minutes !== undefined) { setExprs.push(sql`due_date_offset_minutes = ${updates.due_date_offset_minutes || null}`); }
  if (updates.subtasks_json !== undefined) { setExprs.push(sql`subtasks_json = ${updates.subtasks_json || null}`); }

  setExprs.push(sql`updated_at = ${new Date().toISOString()}`);

  await db.execute(sql`
    UPDATE templates SET ${sql.join(setExprs, sql`, `)} WHERE id = ${id}
  `);

  const result = await db.execute(sql`SELECT * FROM templates WHERE id = ${id}`);
  return mapTemplateRow(result.rows[0]);
}

export async function deleteTemplate(db: ReturnType<typeof drizzle>, id: string): Promise<void> {
  await db.execute(sql`DELETE FROM templates WHERE id = ${id}`);
}

// ==================== HOLIDAY OPERATIONS ====================

export async function upsertHoliday(
  db: ReturnType<typeof drizzle>,
  holiday: Omit<Holiday, 'created_at'>
): Promise<void> {
  const dateStr = typeof holiday.date === 'string' ? holiday.date : new Date(holiday.date).toISOString().split('T')[0];
  await db.execute(sql`
    INSERT INTO holidays (date, name) VALUES (${dateStr}, ${holiday.name})
    ON CONFLICT (date) DO UPDATE SET name = ${holiday.name}
  `);
}

export async function getHolidaysBetween(
  db: ReturnType<typeof drizzle>,
  startDate: Date,
  endDate: Date
): Promise<Holiday[]> {
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  const result = await db.execute(sql`
    SELECT * FROM holidays WHERE date BETWEEN ${startStr} AND ${endStr} ORDER BY date
  `);
  return result.rows.map(mapHolidayRow);
}

export async function getAllHolidays(db: ReturnType<typeof drizzle>): Promise<Holiday[]> {
  const result = await db.execute(sql`SELECT * FROM holidays ORDER BY date`);
  return result.rows.map(mapHolidayRow);
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
  await db.execute(sql`
    INSERT INTO notifications (todo_id, notification_type, scheduled_for, status)
    VALUES (${todoId}, 'due_reminder', ${scheduledFor.toISOString()}, 'pending')
  `);
}

export async function updateNotificationStatus(
  db: ReturnType<typeof drizzle>,
  todoId: string,
  status: string
): Promise<void> {
  await db.execute(sql`
    UPDATE notifications SET status = ${status}, updated_at = ${new Date().toISOString()}
    WHERE todo_id = ${todoId} AND status = 'pending' ORDER BY scheduled_for DESC LIMIT 1
  `);
}

export async function markAsSent(db: ReturnType<typeof drizzle>, notificationId: number): Promise<void> {
  await db.execute(sql`
    UPDATE notifications SET status = 'sent', updated_at = ${new Date().toISOString()} WHERE id = ${notificationId}
  `);
}

// ==================== AUTH OPERATIONS ====================

export async function getUserByUsername(
  db: ReturnType<typeof drizzle>,
  username: string
): Promise<User | null> {
  const result = await db.execute(sql`SELECT * FROM users WHERE username = ${username}`);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function createUser(
  db: ReturnType<typeof drizzle>,
  userData: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password_hash?: string }
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO users (id, username, password_hash, created_at, updated_at)
    VALUES (${id}, ${userData.username}, ${userData.password_hash || null}, ${now}, ${now})
  `);
  return { ...userData, id, created_at: now, updated_at: now } as User;
}

export async function getUserByCredentialId(
  db: ReturnType<typeof drizzle>,
  credentialId: string
): Promise<User | null> {
  const result = await db.execute(sql`
    SELECT u.* FROM users u
    INNER JOIN authenticators a ON u.id = a.user_id
    WHERE a.credential_id = ${credentialId}
  `);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function createAuthenticator(
  db: ReturnType<typeof drizzle>,
  auth: Omit<Authenticator, 'created_at' | 'updated_at'>
): Promise<Authenticator> {
  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO authenticators (credential_id, user_id, public_key, counter, transports, created_at, updated_at)
    VALUES (${auth.credential_id}, ${auth.user_id}, ${auth.public_key}, ${auth.counter}, ${auth.transports || null}, ${now}, ${now})
  `);
  return { ...auth, created_at: now, updated_at: now };
}

export async function getAuthenticatorsByUserId(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Authenticator[]> {
  const result = await db.execute(sql`SELECT * FROM authenticators WHERE user_id = ${userId}`);
  return result.rows.map(mapAuthenticatorRow);
}

export async function deleteAuthenticator(db: ReturnType<typeof drizzle>, credentialId: string): Promise<void> {
  await db.execute(sql`DELETE FROM authenticators WHERE credential_id = ${credentialId}`);
}

// ==================== EXPORT/IMPORT OPERATIONS ====================

export async function exportTodos(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Todo[]> {
  const result = await db.execute(sql`SELECT * FROM todos WHERE user_id = ${userId} ORDER BY created_at DESC`);
  return result.rows.map(mapTodoRow);
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
    const existing = await db.execute(sql`SELECT id FROM tags WHERE user_id = ${userId} AND name = ${tag.name}`);
    if (existing.rows.length > 0) {
      tagsReused++;
    } else {
      const tagId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
        VALUES (${tagId}, ${userId}, ${tag.name}, ${tag.color}, ${now}, ${now})
      `);
      tagsCreated++;
    }
  }

  for (const todo of todos) {
    const existing = await db.execute(sql`SELECT id FROM todos WHERE id = ${todo.id || ''}`);
    if (existing.rows.length > 0) {
      // Update existing
      updatedCount++;
    } else {
      await createTodo(db, todo as Omit<Todo, 'id' | 'created_at' | 'updated_at'>);
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
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    notes: row.notes,
    due_date: row.due_date ? (typeof row.due_date === 'string' ? row.due_date : new Date(row.due_date).toISOString().split('T')[0]) : null,
    completed: row.completed,
    priority: row.priority as Priority,
    is_recurring: row.is_recurring,
    recurrence_pattern: row.recurrence_pattern,
    reminder_minutes: row.reminder_minutes,
    last_notification_sent: row.last_notification_sent ? (typeof row.last_notification_sent === 'string' ? row.last_notification_sent : new Date(row.last_notification_sent).toISOString()) : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
    completed_at: row.completed_at ? (typeof row.completed_at === 'string' ? row.completed_at : new Date(row.completed_at).toISOString()) : null,
  };
}

function mapSubtaskRow(row: any): Subtask {
  return {
    id: row.id,
    todo_id: row.todo_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
  };
}

function mapTagRow(row: any): Tag {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color || '#3b82f6',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
  };
}

function mapTemplateRow(row: any): Template {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    category: row.category,
    title_template: row.title_template,
    priority: row.priority as Priority,
    is_recurring: row.is_recurring,
    recurrence_pattern: row.recurrence_pattern,
    reminder_minutes: row.reminder_minutes,
    due_date_offset_minutes: row.due_date_offset_minutes,
    subtasks_json: row.subtasks_json,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
  };
}

function mapHolidayRow(row: any): Holiday {
  return {
    date: row.date,
    name: row.name,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
  };
}

function mapUserRow(row: any): User {
  return {
    id: row.id,
    username: row.username,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
  };
}

function mapAuthenticatorRow(row: any): Authenticator {
  return {
    credential_id: row.credential_id,
    user_id: row.user_id,
    public_key: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
  };
}

// ==================== RECURRENCE CALCULATION HELPERS ====================

function calculateNextOccurrence(recurrencePattern: string, afterDate: Date): string | null {
  switch (recurrencePattern) {
    case 'daily':
      return new Date(afterDate.getTime() + 86400000).toISOString().split('T')[0];
    case 'weekly':
      return new Date(afterDate.getTime() + 7 * 86400000).toISOString().split('T')[0];
    case 'monthly':
      const nextMonth = new Date(afterDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth.toISOString().split('T')[0];
    case 'yearly':
      const nextYear = new Date(afterDate);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      return nextYear.toISOString().split('T')[0];
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
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const result = await db.execute(sql`
        SELECT * FROM todos WHERE user_id = ${userId} AND due_date BETWEEN ${startStr} AND ${endStr} ORDER BY due_date
      `);
      return result.rows.map(mapTodoRow);
    },
    async findAllByUser(userId) {
      const result = await db.execute(sql`SELECT * FROM todos WHERE user_id = ${userId} ORDER BY created_at DESC`);
      return result.rows.map(mapTodoRow);
    },
    async importAll(userId, todosData) {
      let createdCount = 0;
      for (const data of todosData) {
        const existing = await db.execute(sql`SELECT id FROM todos WHERE id = ${data.id}`);
        if (existing.rows.length > 0) {
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
      const result = await db.execute(sql`SELECT * FROM tags WHERE id = ${id} AND user_id = ${userId}`);
      const row = result.rows[0];
      if (!row) return null;
      return mapTagRow(row);
    },
    async update(id, userId, updates) {
      const existing = await db.execute(sql`SELECT * FROM tags WHERE id = ${id} AND user_id = ${userId}`);
      if (!existing.rows.length) throw new Error('Tag not found');
      const setClauses: string[] = [];
      const values: (string | number)[] = [];
      let paramIndex = 1;
      // Use drizzle-native interpolation to avoid dollar-quoted string issues
      const tagSetExprs: ReturnType<typeof sql>[] = [];
      let idx = 1;
      if (updates.name !== undefined) { tagSetExprs.push(sql`name = ${updates.name}`); }
      if (updates.color !== undefined) { tagSetExprs.push(sql`color = ${updates.color}`); }
      tagSetExprs.push(sql`updated_at = ${new Date().toISOString()}`);
      await db.execute(sql`UPDATE tags SET ${sql.join(tagSetExprs, sql`, `)} WHERE id = ${id}`);
      const result = await db.execute(sql`SELECT * FROM tags WHERE id = ${id}`);
      return mapTagRow(result.rows[0]);
    },
    async delete(id, userId) {
      const existing = await db.execute(sql`SELECT * FROM tags WHERE id = ${id} AND user_id = ${userId}`);
      if (!existing.rows.length) return false;
      await db.execute(sql`DELETE FROM tags WHERE id = ${id}`);
      return true;
    },
    async attachToTodo(todoId, tagId, userId) {
      const tag = await db.execute(sql`SELECT * FROM tags WHERE id = ${tagId} AND user_id = ${userId}`);
      if (!tag.rows.length) return false;
      await db.execute(sql`INSERT INTO todo_tags (todo_id, tag_id) VALUES (${todoId}, ${tagId}) ON CONFLICT DO NOTHING`);
      return true;
    },
    async detachFromTodo(todoId, tagId, userId) {
      const tag = await db.execute(sql`SELECT * FROM tags WHERE id = ${tagId} AND user_id = ${userId}`);
      if (!tag.rows.length) return false;
      await db.execute(sql`DELETE FROM todo_tags WHERE todo_id = ${todoId} AND tag_id = ${tagId}`);
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
      const result = await db.execute(sql`
        SELECT s.* FROM subtasks s
        INNER JOIN todos t ON s.todo_id = t.id
        WHERE s.id = ${id} AND t.user_id = ${userId}
      `);
      return result.rows[0] ? mapSubtaskRow(result.rows[0]) : null;
    },
    async update(id, userId, updates) {
      const existing = await db.execute(sql`
        SELECT s.* FROM subtasks s
        INNER JOIN todos t ON s.todo_id = t.id
        WHERE s.id = ${id} AND t.user_id = ${userId}
      `);
      if (!existing.rows.length) throw new Error('Subtask not found');
      return updateSubtask(db, id, updates);
    },
    async delete(id, userId) {
      const existing = await db.execute(sql`
        SELECT s.* FROM subtasks s
        INNER JOIN todos t ON s.todo_id = t.id
        WHERE s.id = ${id} AND t.user_id = ${userId}
      `);
      if (!existing.rows.length) return false;
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
      const result = await db.execute(sql`SELECT * FROM templates WHERE id = ${id} AND user_id = ${userId}`);
      return result.rows[0] ? mapTemplateRow(result.rows[0]) : null;
    },
    async update(id, userId, updates) {
      const existing = await db.execute(sql`SELECT * FROM templates WHERE id = ${id} AND user_id = ${userId}`);
      if (!existing.rows.length) throw new Error('Template not found');
      return updateTemplate(db, id, updates);
    },
    async delete(id, userId) {
      const existing = await db.execute(sql`SELECT * FROM templates WHERE id = ${id} AND user_id = ${userId}`);
      if (!existing.rows.length) return false;
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
