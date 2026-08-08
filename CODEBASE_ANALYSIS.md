# Codebase Analysis: ToDoApp

## Overview
A **Next.js 16** (React 19) full-stack ToDo application with authentication, calendar views, recurring tasks, subtasks, tags, templates, and Singapore holidays. Deployed on Railway with PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.0.0 (App Router) |
| UI | React 19.0.0 + Tailwind CSS 4 |
| Database | PostgreSQL via `pg` driver — raw SQL throughout (Drizzle ORM schema removed as dead code) |
| Auth | WebAuthn (`@simplewebauthn/browser/server`) + JWT (`jose`) |
| Testing | Playwright (E2E) + tsx (unit) |
| Linting | ESLint 9 + TypeScript 5 |

**Dependencies: 8 production, 14 dev — total 22**

---

## Architecture

### Directory Structure
```
app/                              # Next.js App Router
  layout.tsx                      # Root layout
  page.tsx                        # Home page (todo list)
  error.tsx                       # Error boundary
  login/
    page.tsx                      # Login/register UI
  calendar/
    page.tsx                      # Calendar view
  api/                            # API routes (15+ route files)
    auth/                         # Auth endpoints
      login-options/route.ts
      login-verify/route.ts
      logout/route.ts
      me/route.ts
      register-options/route.ts
      register-verify/route.ts
    holidays/route.ts
    notifications/check/route.ts
    subtasks/[id]/route.ts
    tags/
      route.ts
      [id]/route.ts
    templates/
      route.ts
      [id]/route.ts
      [id]/use/route.ts
    todos/
      route.ts
      [id]/route.ts
      [id]/subtasks/route.ts
      [id]/tags/route.ts
      export/route.ts
      import/route.ts

lib/                              # Business logic (20 .ts files + hooks/)
  db.ts                           # Database layer: raw SQL, DDL, facades (1201 lines)
  todo-core.ts                    # Core todo CRUD logic
  tag-core.ts                     # Tag management
  subtask-core.ts                 # Subtask management
  template-core.ts                # Template system
  recurrence.ts                   # Recurrence calculations
  calendar.ts                     # Calendar view logic
  notifications.ts                # Notification logic
  auth.ts                         # Auth helpers
  auth-challenges.ts              # Auth challenge flows
  auth-core.ts                    # Auth core
  auth-server.ts                  # Auth server logic
  auth-webauthn.ts                # WebAuthn implementation
  import-core.ts                  # Import logic
  export-core.ts                  # Export logic
  filters.ts                      # Search/filter helpers
  singapore-holidays.ts           # Singapore holidays data
  timezone.ts                     # Timezone utilities
  todo-types.ts                   # TypeScript type definitions
  hooks/                          # React hooks (lib-level)

tests/                            # 11 Playwright E2E + 15 unit tests
  unit/                           # 15 test files (see below)
  01-todo-crud-operations.spec.ts
  02-priority-system.spec.ts
  03-recurring-todos.spec.ts
  04-reminders-notifications.spec.ts
  05-subtasks-progress.spec.ts
  06-tag-system.spec.ts
  07-template-system.spec.ts
  08-search-filtering.spec.ts
  09-export-import.spec.ts
  10-calendar-view.spec.ts
  11-authentication-webauthn.spec.ts
  smoke.spec.ts
  global-setup.ts
  helpers.ts

PRPs/                             # 11 Product Requirements Profiles
mcp-configs/                      # MCP server configuration
scripts/                          # CLI scripts
  migrate.ts
  seed-holidays.ts
types/                            # Type declarations
  better-sqlite3.d.ts
```

### Database Architecture — **CRITICAL ISSUE**

**Layer — Raw SQL (production, `lib/db.ts`)**
- ALL queries use raw `sql\`...\`` statements via `db.execute()`
- Tables created on first access via `createTables()` DDL (lines 80–186)
- Facade pattern wraps raw SQL: `TodoFacade`, `TagFacade`, etc. (lines 885–1201)
- No type-safe column references — everything is string-based
- **Note:** The former Drizzle schema (`lib/drizzle-schema.ts`) was deleted on 2026-09-08 as confirmed dead code (0 imports across the codebase). DDL in `createTables()` is now the single source of truth.

### API Structure (confirmed via filesystem scan)

```
app/login/page.tsx          → Login/register UI
app/calendar/page.tsx       → Calendar view
app/api/auth/*              → 6 auth endpoints (login-options, login-verify, logout, me, register-options, register-verify)
app/api/holidays/route.ts   → Holiday CRUD
app/api/notifications/check → Notification check
app/api/subtasks/[id]       → Subtask update/delete
app/api/tags/               → Tag collection
app/api/tags/[id]           → Tag item
app/api/templates/          → Template collection
app/api/templates/[id]      → Template item
app/api/templates/[id]/use  → Apply template to create todo
app/api/todos/              → Todo collection (GET, POST)
app/api/todos/[id]          → Todo item (GET, PATCH, DELETE)
app/api/todos/[id]/subtasks → Subtask sub-collection
app/api/todos/[id]/tags     → Tag sub-collection
app/api/todos/export        → Export todos as JSON
app/api/todos/import        → Import todos from JSON
Total: 15+ route files across 7 API modules
```

---

## Business Logic Highlights

### Recurrence System (`lib/recurrence.ts`)
- Supports: daily, weekly, monthly, yearly
- `calculateNextOccurrence()` at `db.ts` line 860–877 — basic date math (no timezone handling)
- `expandRecurrence()` at `db.ts` line 742–756 — queries DB for recurring todos within a date range

### Tag System (`lib/tag-core.ts`, `lib/db.ts`)
- M:N relationship via `todo_tags` junction table
- Tags have name (VARCHAR 100) + color (VARCHAR 7)
- User-scoped (`user_id`)

### Subtask System (`lib/subtask-core.ts`, `lib/db.ts`)
- Position-based ordering
- Bulk position update support (`bulkUpdateSubtaskPositions`)
- Cascade delete on parent todo

### Template System (`lib/template-core.ts`, `lib/db.ts`)
- Reusable todo structures with subtasks_json stored as TEXT (JSON string)
- Supports recurrence, reminders, and priority in templates

### Authentication (`lib/auth-*.ts` — 4 auth modules)
- Username/password + WebAuthn (passkeys)
- JWT tokens via `jose`
- Users stored in `users` table with `password_hash`
- Authenticators in `authenticators` table linked to users
- Challenge flows in `auth-challenges.ts`

### Calendar View (`lib/calendar.ts`)
- Month view generation in `buildCalendarMonth()` at `db.ts` line 546–598 — hardcoded date math, ignores DB data for events
- Singapore holidays integration via `singapore-holidays.ts`

---

## Testing Coverage

### Unit Tests (15 files in tests/unit/)
| Test File | Feature | Status |
|-----------|---------|--------|
| `auth-webauthn.test.ts` | WebAuthn auth | EXISTS |
| `auth.test.ts` | Auth core | EXISTS |
| `calendar.test.ts` | Calendar logic | EXISTS |
| `db.test.ts` | Database layer | EXISTS |
| `export-core.test.ts` | Export logic | EXISTS |
| `filters.test.ts` | Filter helpers | EXISTS |
| `import-core.test.ts` | Import logic | EXISTS |
| `notifications.test.ts` | Notifications | EXISTS |
| `phase4-db.test.ts` | Phase 4 DB tests | EXISTS |
| `recurrence.test.ts` | Recurrence | EXISTS |
| `subtask-core.test.ts` | Subtask core | EXISTS |
| `tag-db.test.ts` | Tag DB operations | EXISTS |
| `template-core.test.ts` | Template core | EXISTS |
| `timezone.test.ts` | Timezone utilities | EXISTS |
| `todo-core.test.ts` | Todo core | EXISTS |

### E2E Tests (12 Playwright spec files)
| Test File | Feature | Status |
|-----------|---------|--------|
| `01-todo-crud-operations.spec.ts` | Create/Read/Update/Delete todos | Exists |
| `02-priority-system.spec.ts` | Priority levels (high/medium/low) | Exists |
| `03-recurring-todos.spec.ts` | Recurrence patterns | Exists |
| `04-reminders-notifications.spec.ts` | Reminder system | Exists |
| `05-subtasks-progress.spec.ts` | Subtask progress tracking | Exists |
| `06-tag-system.spec.ts` | Tag management | Exists |
| `07-template-system.spec.ts` | Todo templates | Exists |
| `08-search-filtering.spec.ts` | Search + filters | Exists |
| `09-export-import.spec.ts` | Data portability | Exists |
| `10-calendar-view.spec.ts` | Calendar display | Exists |
| `11-authentication-webauthn.spec.ts` | WebAuthn auth | Exists |
| `smoke.spec.ts` | Health checks | Exists |

---

## Product Requirements Profiles (PRPs)

11 PRPs exist in `PRPs/` matching the test IDs — this is your requirement-to-implementation traceability.

---

## Critical Issues Summary

### 1. **Dead Drizzle Schema** ✅ RESOLVED (deleted 2026-09-08)
`lib/drizzle-schema.ts` has been removed. It was never imported anywhere in the app and had numerous type mismatches with actual DDL. The app runs entirely on raw SQL — DDL in `createTables()` is now the single source of truth.

### 2. **No Migration System** (HIGH PRIORITY)
- No `drizzle.config.*`, no `migrations/` directory, no `drizzle-kit` in dependencies
- Table creation is hardcoded DDL in `createTables()` function (lines 80–186 of db.ts)
- New environments rely on this runtime DDL — prone to drift between dev/staging/prod

**Impact:** Manual schema changes must be coordinated across all instances. No rollback capability.

### 3. **No Type-Safe Queries** (MEDIUM PRIORITY)
All queries use string column names — typos won't be caught at compile time:
```typescript
// db.ts line 196 - hardcoded strings, no compiler safety
await db.execute(sql`
  INSERT INTO todos (id, user_id, title, notes, due_date, ...)
  VALUES (...)`)
```

### 4. **pg Pool SSL for Docker/Internal Connections** (RESOLVED)
`lib/db.ts` line 55 — `ssl: false` is set for internal Docker/Railway/Coolify connections where the pool connects to PostgreSQL via localhost or internal network. If deploying with external PostgreSQL over public internet, re-enable SSL with `rejectUnauthorized: true`.

### 5. **Facade Pattern Overhead** (LOW PRIORITY)
`db.ts` lines 885–1201 define facade interfaces and factory functions (`TodoFacade`, `TagFacade`, etc.) that are thin wrappers around the raw SQL functions. Adds indirection without adding value since they're not used by any application code outside db.ts.

---

## Recommended Actions

### Immediate (Fix DB layer consistency):
1. **Option A: Fully adopt Drizzle ORM** — Migrate all raw SQL queries to Drizzle's query builder, add `drizzle-kit` migrations
2. ✅ **Option B complete** — `lib/drizzle-schema.ts` deleted; DDL in `createTables()` is the single source of truth.

### Short-term:
3. Add proper migration system (drizzle-kit or similar)
4. Fix SSL config for production (`rejectUnauthorized: true`)
5. Review existing unit tests for coverage gaps and test quality

### Long-term:
6. Consider type generation (e.g., `drizzle-kit generate` → auto-generated TS types for all tables)
7. Migrate from `pg` to a more modern wrapper if desired (Kysely, Prisma, etc.) — but only after deciding on Option A or B above

---

## Files Count
- **lib/**: 19 TypeScript modules + hooks/ subdirectory
- **tests/unit/**: 15 unit test files
- **tests/**: 12 Playwright E2E spec files (11 feature + smoke)
- **PRPs/**: 11 requirement docs
- **API routes**: 15+ route files across 7 API modules
- **Total deps**: 8 production + 14 dev = 22 total
