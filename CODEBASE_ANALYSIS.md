# Codebase Analysis: ToDoApp

## Overview
A **Next.js 16** (React 19) full-stack ToDo application with authentication, calendar views, recurring tasks, subtasks, tags, templates, and Singapore holidays. Deployed on Railway with PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.0.0 (App Router) |
| UI | React 19.0.0 + Tailwind CSS 4 |
| Database | PostgreSQL via `pg` driver + Drizzle ORM (query builder only) |
| Auth | WebAuthn (`@simplewebauthn/browser/server`) + JWT (`jose`) |
| Testing | Playwright (E2E) + tsx (unit) |
| Linting | ESLint 9 + TypeScript 5 |

---

## Architecture

### Directory Structure
```
app/                    # Next.js App Router
  layout.tsx            # Root layout
  page.tsx              # Home page (todo list)
  login/                # Authentication pages
  calendar/             # Calendar view route
  api/                  # API routes
lib/                    # Business logic (no ORM models used — raw SQL throughout)
  db.ts                 # Database layer: raw SQL queries + table DDL + facade pattern
  todo-core.ts          # Core todo CRUD logic
  tag-core.ts           # Tag management
  subtask-core.ts       # Subtask management
  template-core.ts      # Template system
  recurrence.ts         # Recurrence calculations
  calendar.ts           # Calendar view logic
  notifications.ts      # Notification logic
  auth-*.ts             # Authentication: core, webauthn, challenges, server
  import-core.ts        # Import/export
  export-core.ts        # Export logic
  filters.ts            # Search/filter helpers
  holiday modules       # Singapore holidays, timezone
  hooks/                # React hooks (lib-level)
tests/                  # 11 Playwright E2E tests matching PRP feature IDs
PRPs/                   # 11 Product Requirements Profiles
mcp-configs/            # MCP server configuration
scripts/                # CLI scripts (seed-holidays.ts)
```

### Database Architecture — **CRITICAL ISSUE**

The codebase has **two incompatible database layers**:

#### Layer 1: Raw SQL (Production code — `lib/db.ts`)
- ALL queries use raw `sql\`...\`` statements via `db.execute()`
- Tables are created on first access via `createTables()` (DDL embedded)
- Facade pattern wraps raw queries: `TodoFacade`, `TagFacade`, `SubtaskFacade`, etc.
- No type-safe column references anywhere — everything is string-based

#### Layer 2: Drizzle Schema Definitions (`lib/drizzle-schema.ts`)
- Uses `pgTable()` to define schema for 8 tables
- **Never imported by any application code** — dead code
- Incomplete — missing `notifications` table that exists in the raw SQL DDL

### Key Mismatch Details

| Field | Raw SQL (db.ts) | Drizzle Schema | Status |
|-------|-----------------|---------------|--------|
| `due_date` | `DATE` type | `varchar(10)` | TYPE MISMATCH |
| `title` | `VARCHAR(255)` | `text()` | DIFFERENT TYPES |
| `notes` | `TEXT` | `text()` | OK |
| `transports` | `TEXT` | `text()` | OK |
| `counter` | `BIGINT` | `integer()` | PRECISION MISMATCH |
| `notifications` table | EXISTS (DDL line 148) | **ABSENT** | MISSING FROM SCHEMA |

### Database Schema (from raw SQL DDL in `db.ts`)

**8 tables:**
1. **todos** — core todo items (id, user_id, title, notes, due_date, completed, priority, is_recurring, recurrence_pattern, reminder_minutes, created_at, updated_at, completed_at)
2. **tags** — user tags (id, user_id, name, color, created_at, updated_at)
3. **todo_tags** — junction table for todo-tag many-to-many
4. **subtasks** — subtask items (id, todo_id, title, completed, position, timestamps)
5. **templates** — todo templates (id, user_id, name, description, category, title_template, priority, recurrence fields, subtasks_json, timestamps)
6. **holidays** — Singapore public holidays (date, name, created_at)
7. **notifications** — reminder notifications (id SERIAL, todo_id, notification_type, scheduled_for, status, timestamps)
8. **users** — auth users (id, username UNIQUE, password_hash, timestamps)
9. **authenticators** — WebAuthn credentials (credential_id PK, user_id FK, public_key, counter, transports, timestamps)

### API Structure

```
app/login/          → Login/register pages
app/calendar/       → Calendar view page
app/api/            → API routes (unspecified in tree)
middleware.ts       → Route protection middleware
```

---

## Business Logic Highlights

### Recurrence System (`lib/recurrence.ts`)
- Supports: daily, weekly, monthly, yearly
- `calculateNextOccurrence()` in `db.ts` line 881-898 — basic date math
- `expandRecurrence()` — finds recurring todos within a date range

### Tag System (`lib/tag-core.ts`, `lib/db.ts`)
- M:N relationship via `todo_tags` junction table
- Tags have name + color
- User-scoped (`user_id`)

### Subtask System (`lib/subtask-core.ts`, `lib/db.ts`)
- Position-based ordering
- Bulk position update support
- Cascade delete on parent todo

### Template System (`lib/template-core.ts`, `lib/db.ts`)
- Reusable todo structures with subtasks_json stored as TEXT (JSON string)
- Supports recurrence, reminders, and priority in templates

### Authentication (`lib/auth-*.ts`)
- Username/password + WebAuthn (passkeys)
- JWT tokens via `jose`
- Users stored in `users` table with password_hash
- Authenticators in `authenticators` table linked to users

### Calendar View (`lib/calendar.ts`)
- Month view generation in `buildCalendarMonth()` — hardcoded date math
- Singapore holidays integration via `singapore-holidays.ts`

---

## Testing Coverage

| Test File | Feature | Status |
|-----------|---------|--------|
| `01-todo-crud-operations.spec.ts` | Create/Read/Update/Delete todos | Planned |
| `02-priority-system.spec.ts` | Priority levels (high/medium/low) | Planned |
| `03-recurring-todos.spec.ts` | Recurrence patterns | Planned |
| `04-reminders-notifications.spec.ts` | Reminder system | Planned |
| `05-subtasks-progress.spec.ts` | Subtask progress tracking | Planned |
| `06-tag-system.spec.ts` | Tag management | Planned |
| `07-template-system.spec.ts` | Todo templates | Planned |
| `08-search-filtering.spec.ts` | Search + filters | Planned |
| `09-export-import.spec.ts` | Data portability | Planned |
| `10-calendar-view.spec.ts` | Calendar display | Planned |
| `11-authentication-webauthn.spec.ts` | WebAuthn auth | Planned |
| `smoke.spec.ts` | Health checks | Planned |

**Gap:** No unit tests (tests/unit/ dir exists but empty). Only Playwright E2E tests.

---

## Product Requirements Profiles (PRPs)

11 PRPs exist in `PRPs/` matching the test IDs — this is your requirement-to-implementation traceability.

---

## Critical Issues Summary

### 1. **Dead Drizzle Schema** (HIGH PRIORITY)
`lib/drizzle-schema.ts` defines 8 tables but:
- Is never imported anywhere in the app
- Has type mismatches with actual DDL (due_date, title, counter columns)
- Missing `notifications` table

**Impact:** If you delete it, nothing breaks. The app runs entirely on raw SQL.

### 2. **No Migration System** (HIGH PRIORITY)
- No `drizzle.config.*`, no `migrations/` directory
- Table creation is hardcoded DDL in `createTables()` function
- New environments rely on this runtime DDL — prone to drift between dev/staging/prod

**Impact:** Manual schema changes must be coordinated across all instances. No rollback capability.

### 3. **No Type-Safe Queries** (MEDIUM PRIORITY)
All queries use string column names — typos won't be caught at compile time:
```typescript
// db.ts line 82 - hardcoded strings, no compiler safety
await db.execute(sql`SELECT * FROM todos WHERE user_id = ${userId}`)
```

### 4. **pg Pool SSL in Production** (MEDIUM PRIORITY)
`lib/db.ts` line 55 — `ssl: { rejectUnauthorized: false }` in production. Accepts any certificate.

### 5. **Facade Pattern Overhead** (LOW PRIORITY)
`db.ts` lines 906-1221 define facade interfaces (`TodoFacade`, `TagFacade`, etc.) that are just thin wrappers around the raw SQL functions. Adds indirection without adding value.

---

## Recommended Actions

### Immediate (Fix DB layer consistency):
1. **Option A: Fully adopt Drizzle ORM** — Migrate all raw SQL queries to Drizzle's query builder, add `drizzle-kit` migrations
2. **Option B: Drop dead schema** — Delete `lib/drizzle-schema.ts`, keep raw SQL, but ensure DDL is the single source of truth

### Short-term:
3. Add Drizzle/Kysely migrations from existing DDL
4. Fix SSL config for production (`rejectUnauthorized: true`)
5. Add unit tests (currently 0 coverage)

### Long-term:
6. Consider type generation (e.g., `drizzle-kit generate` → auto-generated TS types for all tables)
7. Migrate from `pg` to a more modern wrapper if desired (Kysely, Prisma, etc.) — but only after deciding on Option A or B above

---

## Files Count
- **lib/**: 18 modules (core business logic)
- **tests/**: 12 spec files (11 feature + smoke)
- **PRPs/**: 11 requirement docs
- **App routes**: login/, calendar/, api/
- **Total deps**: ~14 (6 production, 8 dev)
