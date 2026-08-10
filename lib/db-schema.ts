import { pgTable, varchar, text, timestamp, integer, serial, boolean, date, bigint } from 'drizzle-orm/pg-core';

export const todos = pgTable('todos', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  notes: text('notes'),
  dueDate: timestamp('due_date'),
  completed: boolean('completed').default(false),
  priority: varchar('priority', { length: 20 }).default('medium'),
  isRecurring: boolean('is_recurring').default(false),
  recurrencePattern: varchar('recurrence_pattern', { length: 20 }),
  reminderMinutes: integer('reminder_minutes'),
  lastNotificationSent: timestamp('last_notification_sent'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const tags = pgTable('tags', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).default('#3b82f6'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const todoTags = pgTable('todo_tags', {
  todoId: varchar('todo_id', { length: 255 }).notNull(),
  tagId: varchar('tag_id', { length: 255 }).notNull(),
});

export const subtasks = pgTable('subtasks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  todoId: varchar('todo_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  completed: boolean('completed').default(false),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const templates = pgTable('templates', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  titleTemplate: text('title_template').notNull(),
  priority: varchar('priority', { length: 20 }).default('medium'),
  isRecurring: boolean('is_recurring').default(false),
  recurrencePattern: varchar('recurrence_pattern', { length: 20 }),
  reminderMinutes: integer('reminder_minutes'),
  dueDateOffsetMinutes: integer('due_date_offset_minutes'),
  subtasksJson: text('subtasks_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const holidays = pgTable('holidays', {
  date: date('date').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  todoId: varchar('todo_id', { length: 255 }).notNull(),
  notificationType: varchar('notification_type', { length: 50 }).notNull(),
  scheduledFor: timestamp('scheduled_for').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const authenticators = pgTable('authenticators', {
  credentialId: varchar('credential_id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).default(0),
  transports: text('transports'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
