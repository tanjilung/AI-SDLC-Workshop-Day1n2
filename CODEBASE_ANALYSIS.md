# Codebase Analysis: ToDoApp

## Overview
A **Next.js 16** (React 19) full-stack ToDo application with authentication, calendar views, recurring tasks, subtasks, tags, templates, and Singapore holidays. Deployed on Railway with PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.0.0 (App Router) |
| UI | React 19.0.0 + Tailwind CSS 4 |
| Database | PostgreSQL via `pg` driver — **Drizzle ORM** (`drizzle-orm` ^0.45.2) with `lib/db-schema.ts` type definitions + raw SQL fallbacks |
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
  api/                            # API routes (20 route files)
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

lib/                              # Business logic (20 .ts + 2 hooks)
  db.ts                           # Database layer: Drizzle ORM + raw SQL, DDL, facades (1250 lines)
  db-schema.ts                    # Drizzle ORM schema definitions (93 lines, 9 tables)
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
  auth-webauthn.ts                # WebAuthn implementation (imports db-schema)
  import-core.ts                  # Import logic
  export-core.ts                  # Export logic
  filters.ts                      # Search/filter helpers
  singapore-holidays.ts           # Singapore holidays data
  timezone.ts                     # Timezone utilities
  todo-types.ts                   # TypeScript type definitions
  hooks/                          # React hooks (lib-level)
    useDebounce.ts
    useNotifications.ts

tests/                            # 12 Playwright E2E + 15 unit tests
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

### Database Architecture — **Drizzle ORM + Raw SQL Hybrid**

**Schema Definitions (`lib/db-schema.ts`, 93 lines)**
- 9 Drizzle `pgTable` definitions: `todos`, `tags`, `todoTags`, `subtasks`, `templates`, `holidays`, `notifications`, `users`, `authenticators`
- Imported by `lib/db.ts` (line 4) and `lib/auth-webauthn.ts` — actively used across the app

**Layer — Drizzle ORM with raw SQL fallbacks (`lib/db.ts`, 1250 lines)**
- Primary pattern: Drizzle query builder via `schema.*` references
  - `db.insert(schema.todos).values({...})` — inserts
  - `db.select().from(schema.todos).where(eq(...))` — selects
  - `db.update(schema.todos).set({...}).where(eq(...))` — updates
  - `db.delete(schema.todos).where(eq(...))` — deletes
- Raw SQL (`sql\`...\``) used for: complex joins, ON CONFLICT, subqueries, bulk operations, date queries
- DDL in `createTables()` (lines 99–204) runs at startup to create tables if missing
- Facade pattern: `TodoFacade`, `TagFacade`, `SubtaskFacade`, `TemplateFacade`, `HolidayFacade`, `AuthFacade` (lines 931–1250)
- **Facade accessors are the PRIMARY API consumption pattern** — all API routes use `getTodoDB()`, `getTagDB()`, etc.

**Schema vs DDL differences (confirmed):**
| Feature | db-schema.ts (Drizzle) | createTables() (DDL) |
|---------|----------------------|---------------------|
| `holidays.date` | `varchar('date', { length: 10 })` | `DATE` |
| `authenticators.counter` | `integer` | `BIGINT` |

### API Structure (confirmed via filesystem scan)

```
app/login/page.tsx          → Login/register UI
app/calendar/page.tsx       → Calendar view
app/api/auth/*              → 6 auth endpoints
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
app/api/todos/export        → Export todos as JSON/CSV
app/api/todos/import        → Import todos from JSON
Total: 20 route files across 7 API modules
```

---

## Business Logic Highlights

### Facade Pattern (confirmed active)
All API routes consume the database layer through facade accessors:
- `getTodoDB()` — used in 15+ API routes (todos, tags, templates, notifications, export/import)
- `getTagDB()` — used in tag routes + todo-tags routes
- `getSubtaskDB()` — used in subtask routes + template-use route
- `getTemplateDB()` — used in template routes + template-use route
- `getHolidayDB()` — used in holidays route + seed script
- `getAuthenticatorDB()` / `getUserDB()` — used in auth flows

Each facade adds user-scoped authorization checks (ownership verification) before delegating to the underlying Drizzle/raw SQL functions.

### Recurrence System (`lib/recurrence.ts`, `lib/db.ts`)
- Supports: daily, weekly, monthly, yearly
- `calculateNextOccurrence()` at `db.ts` line 906–923 — basic date math (no timezone handling)
- `expandRecurrence()` at `db.ts` line 785–799 — raw SQL query for recurring todos within a date range

### Tag System (`lib/tag-core.ts`, `lib/db.ts`)
- M:N relationship via `todo_tags` junction table
- Tags have name (VARCHAR 100) + color (VARCHAR 7)
- User-scoped via facade authorization

### Subtask System (`lib/subtask-core.ts`, `lib/db.ts`)
- Position-based ordering
- Bulk position update support (`bulkUpdateSubtaskPositions`)
- Cascade delete on parent todo (DB-level ON DELETE CASCADE)

### Template System (`lib/template-core.ts`, `lib/db.ts`)
- Reusable todo structures with subtasks_json stored as TEXT (JSON string)
- Supports recurrence, reminders, and priority in templates
- Template-use flow creates a new todo + all subtasks from template

### Authentication (`lib/auth-*.ts` — 4 auth modules)
- Username/password + WebAuthn (passkeys)
- JWT tokens via `jose`
- Users stored in `users` table with `password_hash`
- Authenticators in `authenticators` table linked to users
- Challenge flows in `auth-challenges.ts`

### Calendar View (`lib/calendar.ts`)
- Month view generation in `buildCalendarMonth()` at `db.ts` line 577–629
- 42-day grid (6 weeks), padding from prev/next months
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

### 1. **Drizzle Schema vs DDL Type Mismatches** (MEDIUM PRIORITY)
`lib/db-schema.ts` defines types that don't match the actual PostgreSQL DDL in `createTables()`:
- `holidays.date`: Drizzle = `varchar(10)` vs DDL = `DATE` (line 160)
- `authenticators.counter`: Drizzle = `integer` vs DDL = `BIGINT` (line 187)

**Impact:** Potential runtime type mismatches when Drizzle maps rows. BIGINT values may truncate to integer in JS mappings.

### 2. **No Migration System** (HIGH PRIORITY)
- No `drizzle.config.*`, no `migrations/` directory, no `drizzle-kit` in devDependencies
- Table creation is hardcoded DDL in `createTables()` function (lines 99–204 of db.ts)
- New environments rely on runtime DDL — prone to drift between dev/staging/prod
- Schema changes require manual coordination

### 3. **Mixed Query Styles** (LOW PRIORITY)
Both Drizzle ORM (`db.select().from(schema.todos)`) and raw SQL (`db.execute(sql\`...\``) coexist in the same file. This creates maintenance ambiguity — it's unclear which pattern to follow for new features. Raw SQL is used for ~30% of operations (complex joins, subqueries, ON CONFLICT clauses).

### 4. **pg Pool SSL for Docker/Internal Connections** (RESOLVED)
`lib/db.ts` line 73 — `ssl: false` is set for internal Docker/Railway/Coolify connections where the pool connects to PostgreSQL via localhost or internal network. If deploying with external PostgreSQL over public internet, re-enable SSL with `rejectUnauthorized: true`.

### 5. **Facade Pattern Adds Indirection** (LOW PRIORITY)
6 facade interfaces + factory functions (lines 931–1246) add ~300 lines of indirection between API routes and DB functions. However, facades DO provide value: they enforce user-scoped authorization checks before every DB operation. This is not pure overhead — it's a security pattern.

---

## Recommended Actions

### Immediate (Fix schema consistency):
1. **Align `db-schema.ts` with DDL** — Fix `holidays.date` to use `date()` type and `authenticators.counter` to use `bigint()` instead of `integer()`

### Short-term:
2. Add proper migration system (install `drizzle-kit`, create `drizzle.config.ts`, generate initial migration)
3. Review raw SQL usage — migrate remaining raw queries to Drizzle builder where feasible for consistency
4. Fix SSL config for production deployments (`rejectUnauthorized: true` when needed)

### Long-term:
5. Consider type generation (e.g., `drizzle-kit generate`) for auto-generated TS types from actual DB schema
6. Evaluate whether to standardize on Drizzle ORM fully or document the hybrid approach as intentional

---

## Files Count
- **lib/**: 20 TypeScript modules + 2 hooks = 22 files total
- **tests/unit/**: 15 unit test files
- **tests/**: 12 Playwright E2E spec files (11 feature + smoke) + global-setup.ts + helpers.ts = 14 files
- **PRPs/**: 11 requirement docs
- **API routes**: 20 route files across 7 API modules
- **app/ pages**: 6 files (layout, page, error, login, calendar + globals.css)
- **Total deps**: 8 production + 14 dev = 22 total
