import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  type CalendarDay,
  type Holiday,
  type ImportResult,
  PRIORITY_ORDER,
  PRIORITY_VALUES,
  type Priority,
  type RecurrencePattern,
  type Subtask,
  type Tag,
  type Template,
  type TemplateSubtask,
  type Todo
} from './todo-types';

export { PRIORITY_ORDER, PRIORITY_VALUES };
export type {
  CalendarDay,
  Holiday,
  ImportResult,
  Priority,
  RecurrencePattern,
  Subtask,
  Tag,
  Template,
  TemplateSubtask,
  Todo
};

export type DatabaseInstance = InstanceType<typeof Database>;

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

export interface CreateTodoInput {
  user_id: string;
  title: string;
  notes?: string | null;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  tag_ids?: string[];
  subtasks?: Array<Pick<Subtask, 'title' | 'completed' | 'position'>>;
}

export interface UpdateTodoInput {
  title?: string;
  notes?: string | null;
  due_date?: string | null;
  completed?: boolean;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  last_notification_sent?: string | null;
  completed_at?: string | null;
  tag_ids?: string[];
  subtasks?: Array<Pick<Subtask, 'title' | 'completed' | 'position'>>;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export interface CreateTemplateInput {
  user_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  title_template: string;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  due_date_offset_minutes?: number | null;
  subtasks_json?: string | null;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  title_template?: string;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  due_date_offset_minutes?: number | null;
  subtasks_json?: string | null;
}

export function resolveDatabasePath(databasePath = process.env.DATABASE_PATH): string {
  if (databasePath && databasePath.trim().length > 0) {
    return path.isAbsolute(databasePath) ? databasePath : path.resolve(process.cwd(), databasePath);
  }

  const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || process.cwd();
  return path.join(baseDir, 'todos.db');
}

export function createDatabase(databasePath = resolveDatabasePath()): DatabaseInstance {
  const resolvedPath = path.resolve(databasePath);
  const directory = path.dirname(resolvedPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  return db;
}

export function initializeSchema(db: DatabaseInstance): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (todo_id, tag_id),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      title_template TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_offset_days INTEGER,
      due_date_offset_minutes INTEGER,
      reminder_minutes INTEGER,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      subtasks_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
  `);

  try {
    db.exec(`ALTER TABLE templates ADD COLUMN title_template TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE templates ADD COLUMN due_date_offset_minutes INTEGER`);
  } catch {}
  try {
    db.exec(`
      UPDATE templates
      SET title_template = COALESCE(NULLIF(title_template, ''), name)
      WHERE title_template IS NULL OR title_template = ''
    `);
  } catch {}
}

function mapUser(row: Record<string, unknown> | undefined): User | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    username: String(row.username),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapAuthenticator(row: Record<string, unknown> | undefined): Authenticator | undefined {
  if (!row) {
    return undefined;
  }

  return {
    credential_id: String(row.credential_id),
    user_id: String(row.user_id),
    public_key: String(row.public_key),
    counter: Number(row.counter ?? 0),
    transports: row.transports === null || row.transports === undefined ? null : String(row.transports),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapTodo(row: Record<string, unknown> | undefined): Todo | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    due_date: row.due_date === null || row.due_date === undefined ? null : String(row.due_date),
    completed: Boolean(row.completed),
    priority: String(row.priority) as Priority,
    is_recurring: Boolean(row.is_recurring),
    recurrence_pattern:
      row.recurrence_pattern === null || row.recurrence_pattern === undefined
        ? null
        : (String(row.recurrence_pattern) as RecurrencePattern),
    reminder_minutes:
      row.reminder_minutes === null || row.reminder_minutes === undefined ? null : Number(row.reminder_minutes),
    last_notification_sent:
      row.last_notification_sent === null || row.last_notification_sent === undefined
        ? null
        : String(row.last_notification_sent),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    completed_at: row.completed_at === null || row.completed_at === undefined ? null : String(row.completed_at),
    subtasks: [],
    tags: []
  };
}

function mapTag(row: Record<string, unknown> | undefined): Tag | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    color: String(row.color),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapSubtask(row: Record<string, unknown> | undefined): Subtask | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    todo_id: String(row.todo_id),
    title: String(row.title),
    completed: Boolean(row.completed),
    position: Number(row.position ?? 0),
    created_at: row.created_at === undefined || row.created_at === null ? undefined : String(row.created_at),
    updated_at: row.updated_at === undefined || row.updated_at === null ? undefined : String(row.updated_at)
  };
}

function mapTemplate(row: Record<string, unknown> | undefined): Template | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    category: row.category === null || row.category === undefined ? null : String(row.category),
    title_template:
      row.title_template === null || row.title_template === undefined || String(row.title_template).trim() === ''
        ? String(row.name)
        : String(row.title_template),
    priority: String(row.priority) as Priority,
    is_recurring: Boolean(row.is_recurring),
    recurrence_pattern:
      row.recurrence_pattern === null || row.recurrence_pattern === undefined
        ? null
        : (String(row.recurrence_pattern) as RecurrencePattern),
    reminder_minutes:
      row.reminder_minutes === null || row.reminder_minutes === undefined ? null : Number(row.reminder_minutes),
    due_date_offset_minutes:
      row.due_date_offset_minutes === null || row.due_date_offset_minutes === undefined
        ? null
        : Number(row.due_date_offset_minutes),
    subtasks_json: row.subtasks_json === null || row.subtasks_json === undefined ? null : String(row.subtasks_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapHoliday(row: Record<string, unknown> | undefined): Holiday | undefined {
  if (!row) {
    return undefined;
  }

  return {
    date: String(row.date),
    name: String(row.name),
    created_at: row.created_at === null || row.created_at === undefined ? undefined : String(row.created_at)
  };
}

export function createUserDB(db: DatabaseInstance) {
  const userDB = {
    create(input: { id: string; username: string }): User {
      const stmt = db.prepare(`
        INSERT INTO users (id, username)
        VALUES (@id, @username)
      `);

      stmt.run(input);
      const user = userDB.findById(input.id);
      if (!user) {
        throw new Error('Failed to create user');
      }

      return user;
    },
    findById(id: string): User | undefined {
      const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return mapUser(row);
    },
    findByUsername(username: string): User | undefined {
      const row = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as Record<string, unknown> | undefined;
      return mapUser(row);
    }
  };

  return userDB;
}

export function createAuthenticatorDB(db: DatabaseInstance) {
  const authenticatorDB = {
    create(input: {
      credentialId: string;
      userId: string;
      publicKey: string;
      counter?: number;
      transports?: string | null;
    }): Authenticator {
      const stmt = db.prepare(`
        INSERT INTO authenticators (credential_id, user_id, public_key, counter, transports)
        VALUES (@credentialId, @userId, @publicKey, @counter, @transports)
      `);

      stmt.run({
        credentialId: input.credentialId,
        userId: input.userId,
        publicKey: input.publicKey,
        counter: input.counter ?? 0,
        transports: input.transports ?? null
      });

      const authenticator = authenticatorDB.findByCredentialId(input.credentialId);
      if (!authenticator) {
        throw new Error('Failed to create authenticator');
      }

      return authenticator;
    },
    findByCredentialId(credentialId: string): Authenticator | undefined {
      const row = db.prepare(`SELECT * FROM authenticators WHERE credential_id = ?`).get(credentialId) as Record<string, unknown> | undefined;
      return mapAuthenticator(row);
    },
    listByUserId(userId: string): Authenticator[] {
      const rows = db.prepare(`SELECT * FROM authenticators WHERE user_id = ? ORDER BY created_at ASC`).all(userId) as Record<string, unknown>[];
      return rows.map((row) => mapAuthenticator(row)).filter((row): row is Authenticator => Boolean(row));
    },
    updateCounter(credentialId: string, counter: number): Authenticator | undefined {
      db.prepare(`
        UPDATE authenticators
        SET counter = ?, updated_at = CURRENT_TIMESTAMP
        WHERE credential_id = ?
      `).run(counter, credentialId);

      return this.findByCredentialId(credentialId);
    },
    deleteByCredentialId(credentialId: string): void {
      db.prepare(`DELETE FROM authenticators WHERE credential_id = ?`).run(credentialId);
    }
  };

  return authenticatorDB;
}

export function createTagDB(db: DatabaseInstance) {
  const tagDB = {
    create(userId: string, input: CreateTagInput): Tag {
      const tagId = randomUUID();
      db.prepare(`
        INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
        VALUES (@id, @user_id, @name, @color, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run({
        id: tagId,
        user_id: userId,
        name: input.name,
        color: input.color ?? '#3B82F6'
      });

      const created = tagDB.findById(tagId, userId);
      if (!created) {
        throw new Error('Failed to create tag');
      }

      return created;
    },
    findAllByUser(userId: string): Tag[] {
      const rows = db
        .prepare(`SELECT * FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC, created_at ASC`)
        .all(userId) as Record<string, unknown>[];
      return rows.map((row) => mapTag(row)).filter((row): row is Tag => Boolean(row));
    },
    findById(tagId: string, userId: string): Tag | undefined {
      const row = db
        .prepare(`SELECT * FROM tags WHERE id = ? AND user_id = ?`)
        .get(tagId, userId) as Record<string, unknown> | undefined;
      return mapTag(row);
    },
    update(tagId: string, userId: string, input: UpdateTagInput): Tag | undefined {
      const existing = tagDB.findById(tagId, userId);
      if (!existing) {
        return undefined;
      }

      const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [];

      if (input.name !== undefined) {
        assignments.push('name = ?');
        values.push(input.name);
      }
      if (input.color !== undefined) {
        assignments.push('color = ?');
        values.push(input.color);
      }

      db.prepare(`UPDATE tags SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(
        ...values,
        tagId,
        userId
      );

      return tagDB.findById(tagId, userId);
    },
    delete(tagId: string, userId: string): boolean {
      const result = db.prepare(`DELETE FROM tags WHERE id = ? AND user_id = ?`).run(tagId, userId);
      return result.changes > 0;
    },
    attachToTodo(todoId: string, tagId: string, userId: string): boolean {
      const todoExists = db.prepare(`SELECT 1 FROM todos WHERE id = ? AND user_id = ?`).get(todoId, userId);
      const tagExists = db.prepare(`SELECT 1 FROM tags WHERE id = ? AND user_id = ?`).get(tagId, userId);
      if (!todoExists || !tagExists) {
        return false;
      }

      db.prepare(`INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)`).run(todoId, tagId);
      return true;
    },
    detachFromTodo(todoId: string, tagId: string, userId: string): boolean {
      const todoExists = db.prepare(`SELECT 1 FROM todos WHERE id = ? AND user_id = ?`).get(todoId, userId);
      const tagExists = db.prepare(`SELECT 1 FROM tags WHERE id = ? AND user_id = ?`).get(tagId, userId);
      if (!todoExists || !tagExists) {
        return false;
      }

      db.prepare(`DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?`).run(todoId, tagId);
      return true;
    },
    findByTodoId(todoId: string, userId: string): Tag[] {
      const rows = db.prepare(`
        SELECT t.*
        FROM tags t
        INNER JOIN todo_tags tt ON tt.tag_id = t.id
        INNER JOIN todos td ON td.id = tt.todo_id
        WHERE tt.todo_id = ? AND td.user_id = ? AND t.user_id = ?
        ORDER BY t.name COLLATE NOCASE ASC, t.created_at ASC
      `).all(todoId, userId, userId) as Record<string, unknown>[];

      return rows.map((row) => mapTag(row)).filter((row): row is Tag => Boolean(row));
    }
  };

  return tagDB;
}

export function createSubtaskDB(db: DatabaseInstance) {
  const subtaskDB = {
    create(input: { todo_id: string; title: string; completed?: boolean; position?: number }): Subtask {
      const subtaskId = randomUUID();
      db.prepare(`
        INSERT INTO subtasks (id, todo_id, title, completed, position, created_at, updated_at)
        VALUES (@id, @todo_id, @title, @completed, @position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run({
        id: subtaskId,
        todo_id: input.todo_id,
        title: input.title,
        completed: input.completed ? 1 : 0,
        position: input.position ?? 0
      });

      const created = subtaskDB.findById(subtaskId);
      if (!created) {
        throw new Error('Failed to create subtask');
      }

      return created;
    },
    findById(subtaskId: string): Subtask | undefined {
      const row = db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(subtaskId) as Record<string, unknown> | undefined;
      return mapSubtask(row);
    },
    findAllByTodo(todoId: string): Subtask[] {
      const rows = db
        .prepare(`SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, created_at ASC`)
        .all(todoId) as Record<string, unknown>[];
      return rows.map((row) => mapSubtask(row)).filter((row): row is Subtask => Boolean(row));
    },
    findByIdForUser(subtaskId: string, userId: string): Subtask | undefined {
      const row = db.prepare(`
        SELECT s.*
        FROM subtasks s
        JOIN todos t ON t.id = s.todo_id
        WHERE s.id = ? AND t.user_id = ?
      `).get(subtaskId, userId) as Record<string, unknown> | undefined;
      return mapSubtask(row);
    },
    update(
      subtaskId: string,
      userId: string,
      input: { title?: string; completed?: boolean; position?: number }
    ): Subtask | undefined {
      const existing = subtaskDB.findByIdForUser(subtaskId, userId);
      if (!existing) {
        return undefined;
      }

      const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [];

      if (input.title !== undefined) {
        assignments.push('title = ?');
        values.push(input.title);
      }
      if (input.completed !== undefined) {
        assignments.push('completed = ?');
        values.push(input.completed ? 1 : 0);
      }
      if (input.position !== undefined) {
        assignments.push('position = ?');
        values.push(input.position);
      }

      db.prepare(`
        UPDATE subtasks
        SET ${assignments.join(', ')}
        WHERE id = ?
          AND todo_id IN (SELECT id FROM todos WHERE user_id = ?)
      `).run(...values, subtaskId, userId);

      return subtaskDB.findById(subtaskId);
    },
    delete(subtaskId: string, userId: string): boolean {
      const result = db.prepare(`
        DELETE FROM subtasks
        WHERE id = ?
          AND todo_id IN (SELECT id FROM todos WHERE user_id = ?)
      `).run(subtaskId, userId);

      return result.changes > 0;
    },
    replaceForTodo(todoId: string, items: Array<Pick<Subtask, 'title' | 'completed' | 'position'>>) {
      db.prepare(`DELETE FROM subtasks WHERE todo_id = ?`).run(todoId);
      items.forEach((item, index) => {
        subtaskDB.create({
          todo_id: todoId,
          title: item.title,
          completed: item.completed,
          position: item.position ?? index
        });
      });
    }
  };

  return subtaskDB;
}

export function createTemplateDB(db: DatabaseInstance) {
  const templateDB = {
    create(input: CreateTemplateInput): Template {
      const templateId = randomUUID();
      db.prepare(`
        INSERT INTO templates (
          id, user_id, name, description, category, title_template, priority,
          due_date_offset_minutes, reminder_minutes, is_recurring, recurrence_pattern,
          subtasks_json, created_at, updated_at
        ) VALUES (
          @id, @user_id, @name, @description, @category, @title_template, @priority,
          @due_date_offset_minutes, @reminder_minutes, @is_recurring, @recurrence_pattern,
          @subtasks_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run({
        id: templateId,
        user_id: input.user_id,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        title_template: input.title_template,
        priority: input.priority ?? 'medium',
        due_date_offset_minutes: input.due_date_offset_minutes ?? null,
        reminder_minutes: input.reminder_minutes ?? null,
        is_recurring: input.is_recurring ? 1 : 0,
        recurrence_pattern: input.recurrence_pattern ?? null,
        subtasks_json: input.subtasks_json ?? '[]'
      });

      const created = templateDB.findById(templateId, input.user_id);
      if (!created) {
        throw new Error('Failed to create template');
      }

      return created;
    },
    findAllByUser(userId: string): Template[] {
      const rows = db
        .prepare(`SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId) as Record<string, unknown>[];
      return rows.map((row) => mapTemplate(row)).filter((row): row is Template => Boolean(row));
    },
    findById(templateId: string, userId: string): Template | undefined {
      const row = db
        .prepare(`SELECT * FROM templates WHERE id = ? AND user_id = ?`)
        .get(templateId, userId) as Record<string, unknown> | undefined;
      return mapTemplate(row);
    },
    update(templateId: string, userId: string, input: UpdateTemplateInput): Template | undefined {
      const existing = templateDB.findById(templateId, userId);
      if (!existing) {
        return undefined;
      }

      const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [];

      if (input.name !== undefined) {
        assignments.push('name = ?');
        values.push(input.name);
      }
      if (input.description !== undefined) {
        assignments.push('description = ?');
        values.push(input.description);
      }
      if (input.category !== undefined) {
        assignments.push('category = ?');
        values.push(input.category);
      }
      if (input.title_template !== undefined) {
        assignments.push('title_template = ?');
        values.push(input.title_template);
      }
      if (input.priority !== undefined) {
        assignments.push('priority = ?');
        values.push(input.priority);
      }
      if (input.due_date_offset_minutes !== undefined) {
        assignments.push('due_date_offset_minutes = ?');
        values.push(input.due_date_offset_minutes);
      }
      if (input.reminder_minutes !== undefined) {
        assignments.push('reminder_minutes = ?');
        values.push(input.reminder_minutes);
      }
      if (input.is_recurring !== undefined) {
        assignments.push('is_recurring = ?');
        values.push(input.is_recurring ? 1 : 0);
      }
      if (input.recurrence_pattern !== undefined) {
        assignments.push('recurrence_pattern = ?');
        values.push(input.recurrence_pattern);
      }
      if (input.subtasks_json !== undefined) {
        assignments.push('subtasks_json = ?');
        values.push(input.subtasks_json);
      }

      db.prepare(`UPDATE templates SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(
        ...values,
        templateId,
        userId
      );

      return templateDB.findById(templateId, userId);
    },
    delete(templateId: string, userId: string): boolean {
      const result = db.prepare(`DELETE FROM templates WHERE id = ? AND user_id = ?`).run(templateId, userId);
      return result.changes > 0;
    }
  };

  return templateDB;
}

export function createHolidayDB(db: DatabaseInstance) {
  const holidayDB = {
    findAll(): Holiday[] {
      const rows = db.prepare(`SELECT * FROM holidays ORDER BY date ASC`).all() as Record<string, unknown>[];
      return rows.map((row) => mapHoliday(row)).filter((row): row is Holiday => Boolean(row));
    },
    findByMonth(year: number, month: number): Holiday[] {
      const monthString = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
      const rows = db
        .prepare(`SELECT * FROM holidays WHERE date >= ? AND date < ? ORDER BY date ASC`)
        .all(`${monthString}-01`, month === 12 ? `${year + 1}-01-01` : `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`) as Record<string, unknown>[];
      return rows.map((row) => mapHoliday(row)).filter((row): row is Holiday => Boolean(row));
    },
    findByRange(startDate: string, endDate: string): Holiday[] {
      const rows = db
        .prepare(`SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date ASC`)
        .all(startDate, endDate) as Record<string, unknown>[];
      return rows.map((row) => mapHoliday(row)).filter((row): row is Holiday => Boolean(row));
    },
    upsertMany(items: Holiday[]) {
      const insert = db.prepare(`
        INSERT INTO holidays (date, name, created_at)
        VALUES (@date, @name, CURRENT_TIMESTAMP)
        ON CONFLICT(date) DO UPDATE SET name = excluded.name
      `);
      const transaction = db.transaction(() => {
        items.forEach((row) => insert.run({ date: row.date, name: row.name }));
      });
      transaction();
    }
  };

  return holidayDB;
}

export function createTodoDB(db: DatabaseInstance) {
  const subtaskDB = createSubtaskDB(db);

  function listSubtasksForTodoIds(todoIds: string[]): Map<string, Subtask[]> {
    const subtaskMap = new Map<string, Subtask[]>();

    if (todoIds.length === 0) {
      return subtaskMap;
    }

    const placeholders = todoIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT *
      FROM subtasks
      WHERE todo_id IN (${placeholders})
      ORDER BY position ASC, created_at ASC
    `).all(...todoIds) as Array<Record<string, unknown> & { todo_id: string }>;

    for (const todoId of todoIds) {
      subtaskMap.set(todoId, []);
    }

    for (const row of rows) {
      const subtask = mapSubtask(row);
      if (!subtask) {
        continue;
      }

      const todoId = String(row.todo_id);
      subtaskMap.set(todoId, [...(subtaskMap.get(todoId) ?? []), subtask]);
    }

    return subtaskMap;
  }

  function listTagsForTodoIds(todoIds: string[], userId: string): Map<string, Tag[]> {
    const tagMap = new Map<string, Tag[]>();

    if (todoIds.length === 0) {
      return tagMap;
    }

    const placeholders = todoIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT tt.todo_id, t.*
      FROM todo_tags tt
      INNER JOIN tags t ON t.id = tt.tag_id
      INNER JOIN todos td ON td.id = tt.todo_id
      WHERE td.user_id = ? AND t.user_id = ? AND tt.todo_id IN (${placeholders})
      ORDER BY t.name COLLATE NOCASE ASC, t.created_at ASC
    `).all(userId, userId, ...todoIds) as Array<Record<string, unknown> & { todo_id: string }>;

    for (const todoId of todoIds) {
      tagMap.set(todoId, []);
    }

    for (const row of rows) {
      const tag = mapTag(row);
      if (!tag) {
        continue;
      }

      const todoId = String(row.todo_id);
      tagMap.set(todoId, [...(tagMap.get(todoId) ?? []), tag]);
    }

    return tagMap;
  }

  function enrichTodos(todos: Todo[]): Todo[] {
    const subtaskMap = listSubtasksForTodoIds(todos.map((todo) => todo.id));
    const tagMap = listTagsForTodoIds(
      todos.map((todo) => todo.id),
      todos[0]?.user_id ?? ''
    );

    return todos.map((todo) => ({
      ...todo,
      subtasks: subtaskMap.get(todo.id) ?? [],
      tags: tagMap.get(todo.id) ?? []
    }));
  }

  function enrichTodo(todo: Todo | undefined): Todo | undefined {
    if (!todo) {
      return undefined;
    }

    return enrichTodos([todo])[0];
  }

  function syncTodoTags(todoId: string, userId: string, tagIds: string[] | undefined) {
    if (tagIds === undefined) {
      return;
    }

    const normalizedTagIds = [...new Set(tagIds)];

    if (normalizedTagIds.length > 0) {
      const placeholders = normalizedTagIds.map(() => '?').join(', ');
      const rows = db
        .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`)
        .all(userId, ...normalizedTagIds) as Array<{ id: string }>;

      if (rows.length !== normalizedTagIds.length) {
        throw new Error('One or more tags were not found');
      }
    }

    db.prepare(`DELETE FROM todo_tags WHERE todo_id = ?`).run(todoId);

    for (const tagId of normalizedTagIds) {
      db.prepare(`INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)`).run(todoId, tagId);
    }
  }

  const todoDB = {
    create(input: CreateTodoInput): Todo {
      const todoId = randomUUID();
      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO todos (
            id, user_id, title, notes, due_date, completed, priority,
            is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent,
            created_at, updated_at, completed_at
          ) VALUES (
            @id, @user_id, @title, @notes, @due_date, @completed, @priority,
            @is_recurring, @recurrence_pattern, @reminder_minutes, @last_notification_sent,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, @completed_at
          )
        `).run({
          id: todoId,
          user_id: input.user_id,
          title: input.title,
          notes: input.notes ?? null,
          due_date: input.due_date ?? null,
          completed: 0,
          priority: input.priority ?? 'medium',
          is_recurring: input.is_recurring ? 1 : 0,
          recurrence_pattern: input.recurrence_pattern ?? null,
          reminder_minutes: input.reminder_minutes ?? null,
          last_notification_sent: null,
          completed_at: null
        });

        syncTodoTags(todoId, input.user_id, input.tag_ids);
        if (input.subtasks) {
          subtaskDB.replaceForTodo(todoId, input.subtasks);
        }
      });

      transaction();

      const created = todoDB.findByIdForUser(todoId, input.user_id);
      if (!created) {
        throw new Error('Failed to create todo');
      }

      return created;
    },
    findAllByUser(userId: string): Todo[] {
      const rows = db
        .prepare(`SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId) as Record<string, unknown>[];
      return enrichTodos(rows.map((row) => mapTodo(row)).filter((row): row is Todo => Boolean(row)));
    },
    findAllWithRelations(userId: string): Todo[] {
      return todoDB.findAllByUser(userId);
    },
    findById(todoId: string): Todo | undefined {
      const row = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(todoId) as Record<string, unknown> | undefined;
      return enrichTodo(mapTodo(row));
    },
    findByIdForUser(todoId: string, userId: string): Todo | undefined {
      const row = db
        .prepare(`SELECT * FROM todos WHERE id = ? AND user_id = ?`)
        .get(todoId, userId) as Record<string, unknown> | undefined;
      return enrichTodo(mapTodo(row));
    },
    update(todoId: string, userId: string, input: UpdateTodoInput): Todo | undefined {
      const existing = todoDB.findByIdForUser(todoId, userId);
      if (!existing) {
        return undefined;
      }

      const assignments: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [];

      if (input.title !== undefined) {
        assignments.push('title = ?');
        values.push(input.title);
      }
      if (input.notes !== undefined) {
        assignments.push('notes = ?');
        values.push(input.notes);
      }
      if (input.due_date !== undefined) {
        assignments.push('due_date = ?');
        values.push(input.due_date);
      }
      if (input.completed !== undefined) {
        assignments.push('completed = ?');
        values.push(input.completed ? 1 : 0);
      }
      if (input.priority !== undefined) {
        assignments.push('priority = ?');
        values.push(input.priority);
      }
      if (input.is_recurring !== undefined) {
        assignments.push('is_recurring = ?');
        values.push(input.is_recurring ? 1 : 0);
      }
      if (input.recurrence_pattern !== undefined) {
        assignments.push('recurrence_pattern = ?');
        values.push(input.recurrence_pattern);
      }
      if (input.reminder_minutes !== undefined) {
        assignments.push('reminder_minutes = ?');
        values.push(input.reminder_minutes);
      }
      if (input.last_notification_sent !== undefined) {
        assignments.push('last_notification_sent = ?');
        values.push(input.last_notification_sent);
      }
      if (input.completed_at !== undefined) {
        assignments.push('completed_at = ?');
        values.push(input.completed_at);
      }

      const transaction = db.transaction(() => {
        db.prepare(`UPDATE todos SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(
          ...values,
          todoId,
          userId
        );

        syncTodoTags(todoId, userId, input.tag_ids);
        if (input.subtasks !== undefined) {
          subtaskDB.replaceForTodo(todoId, input.subtasks);
        }
      });

      transaction();

      return todoDB.findByIdForUser(todoId, userId);
    },
    delete(todoId: string, userId: string): boolean {
      const result = db.prepare(`DELETE FROM todos WHERE id = ? AND user_id = ?`).run(todoId, userId);
      return result.changes > 0;
    },
    importAll(userId: string, items: Array<{
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
    }>): ImportResult {
      let tagsCreated = 0;
      let tagsReused = 0;

      const transaction = db.transaction(() => {
        for (const item of items) {
          const todoId = randomUUID();
          db.prepare(`
            INSERT INTO todos (
              id, user_id, title, notes, due_date, completed, priority,
              is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent,
              created_at, updated_at, completed_at
            ) VALUES (
              @id, @user_id, @title, @notes, @due_date, @completed, @priority,
              @is_recurring, @recurrence_pattern, @reminder_minutes, NULL,
              @created_at, CURRENT_TIMESTAMP, @completed_at
            )
          `).run({
            id: todoId,
            user_id: userId,
            title: item.title,
            notes: item.notes,
            due_date: item.due_date,
            completed: item.completed ? 1 : 0,
            priority: item.priority,
            is_recurring: item.is_recurring ? 1 : 0,
            recurrence_pattern: item.recurrence_pattern,
            reminder_minutes: item.reminder_minutes,
            created_at: item.created_at,
            completed_at: item.completed_at
          });

          item.subtasks.forEach((subtask, index) => {
            subtaskDB.create({
              todo_id: todoId,
              title: subtask.title,
              completed: subtask.completed,
              position: subtask.position ?? index
            });
          });

          for (const tag of item.tags) {
            const existingRow = db.prepare(`
              SELECT * FROM tags
              WHERE user_id = ? AND lower(name) = lower(?)
              LIMIT 1
            `).get(userId, tag.name) as Record<string, unknown> | undefined;

            let tagId: string;
            if (existingRow) {
              tagId = String(existingRow.id);
              tagsReused += 1;
            } else {
              tagId = randomUUID();
              db.prepare(`
                INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(tagId, userId, tag.name, tag.color);
              tagsCreated += 1;
            }

            db.prepare(`INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)`).run(todoId, tagId);
          }
        }
      });

      transaction();

      return {
        imported: items.length,
        tagsCreated,
        tagsReused
      };
    }
  };

  return todoDB;
}

let databaseInstance: DatabaseInstance | undefined;

export function getDatabase(): DatabaseInstance {
  if (!databaseInstance) {
    databaseInstance = createDatabase();
  }

  return databaseInstance;
}

export function getUserDB() {
  return createUserDB(getDatabase());
}

export function getAuthenticatorDB() {
  return createAuthenticatorDB(getDatabase());
}

export function getTagDB() {
  return createTagDB(getDatabase());
}

export function getSubtaskDB() {
  return createSubtaskDB(getDatabase());
}

export function getTemplateDB() {
  return createTemplateDB(getDatabase());
}

export function getHolidayDB() {
  return createHolidayDB(getDatabase());
}

export function getTodoDB() {
  return createTodoDB(getDatabase());
}
