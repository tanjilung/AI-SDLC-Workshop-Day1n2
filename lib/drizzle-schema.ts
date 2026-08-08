import {
  pgTable,
  varchar,
  boolean,
  integer,
  text,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const authenticators = pgTable('authenticators', {
  credentialId: varchar('credential_id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').default(0).notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tags = pgTable('tags', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  color: varchar('color', { length: 7 }).default('#3B82F6').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subtasks = pgTable('subtasks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  todoId: varchar('todo_id', { length: 255 })
    .notNull()
    .references(() => todos.id),
  title: text('title').notNull(),
  completed: boolean('completed').default(false).notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const templates = pgTable('templates', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 255 }),
  titleTemplate: varchar('title_template', { length: 512 }).notNull(),
  priority: varchar('priority', { length: 10 })
    .default('medium')
    .notNull(),
  dueDateOffsetMinutes: integer('due_date_offset_minutes'),
  reminderMinutes: integer('reminder_minutes'),
  isRecurring: boolean('is_recurring').default(false).notNull(),
  recurrencePattern: varchar('recurrence_pattern', { length: 50 }),
  subtasksJson: text('subtasks_json').default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const holidays = pgTable('holidays', {
  date: varchar('date', { length: 10 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const todos = pgTable('todos', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  notes: text('notes'),
  dueDate: varchar('due_date', { length: 10 }),
  completed: boolean('completed').default(false).notNull(),
  priority: varchar('priority', { length: 10 }).default('medium').notNull(),
  isRecurring: boolean('is_recurring').default(false).notNull(),
  recurrencePattern: varchar('recurrence_pattern', { length: 50 }),
  reminderMinutes: integer('reminder_minutes'),
  lastNotificationSent: timestamp('last_notification_sent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const todoTags = pgTable('todo_tags', {
  todoId: varchar('todo_id', { length: 255 })
    .notNull()
    .references(() => todos.id),
  tagId: varchar('tag_id', { length: 255 })
    .notNull()
    .references(() => tags.id),
}, (t) => [primaryKey({ columns: [t.todoId, t.tagId] })]);
