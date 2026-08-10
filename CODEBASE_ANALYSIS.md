# Codebase Analysis: ToDoApp

## Overview
A **Next.js 16** (React 19) full-stack ToDo application with WebAuthn authentication, calendar views, recurring tasks, subtasks, tags, templates, notifications, export/import, and Singapore holidays. Deployed on Railway or Coolify with PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.0.0 (App Router) |
| UI | React 19.0.0 + Tailwind CSS 4 |
| Database | PostgreSQL via `pg` driver — **Drizzle ORM** (`drizzle-orm` ^0.45.2) with schema in `lib/db-schema.ts` + raw SQL fallbacks |
| Auth | WebAuthn (`@simplewebauthn/browser` + `@simplewebauthn/server` v13.x) + JWT (`jose` v5.x) |
| Testing | Playwright (E2E) + tsx (unit tests) |
| Linting | ESLint 9 + TypeScript 5 |

**Dependencies**: 8 production, 14 dev — total 22

---

## Architecture

### Directory Structure
```
app/                              # Next.js App Router
  layout.tsx                      # Root layout
  page.tsx                        # Home page (todo list)
  error.tsx                       # Error boundary
  globals.css                     # Global styles + Tailwind
  login/
    page.tsx                      # Login/register UI (WebAuthn)
  calendar/
    page.tsx                      # Calendar view
  api/                            # API routes (20 route files)
    auth/                         # Auth endpoints (6 routes)
      login-options/route.ts
      login-verify/route.ts
      logout/route.ts
      me/route.ts
      register-options/route.ts
      register-verify/route.ts
    holidays/route.ts             # Holiday data
    notifications/check/route.ts  # Notification polling
    subtasks/[id]/route.ts        # Subtask update/delete
    tags/route.ts                 # Tag collection (CRUD)
    tags/[id]/route.ts            # Tag item operations
    templates/route.ts            # Template collection
    templates/[id]/route.ts       # Template item
    templates/[id]/use/route.ts   # Apply template
    todos/route.ts                # Todo collection (GET, POST)
    todos/[id]/route.ts           # Todo item (GET, PATCH, DELETE)
    todos/[id]/subtasks/route.ts  # Subtask sub-collection
    todos/[id]/tags/route.ts      # Tag sub-collection
    todos/export/route.ts         # Export (JSON/CSV)
    todos/import/route.ts         # Import (JSON)

lib/                              # Business logic (20 .ts modules + 2 hooks)
  db.ts                           # Database layer: Drizzle ORM + raw SQL, DDL, facades (~1250 lines)
  db-schema.ts                    # Drizzle ORM schema definitions (93 lines, 9 tables)
  todo-core.ts                    # Core todo CRUD logic
  todo-types.ts                   # TypeScript type definitions
  tag-core.ts                     # Tag management
  subtask-core.ts                 # Subtask management
  template-core.ts                # Template system
  recurrence.ts                   # Recurrence calculations
  calendar.ts                     # Calendar view logic
  notifications.ts                # Notification logic
  auth.ts                         # Auth helpers (sessions, cookies)
  auth-challenges.ts              # Auth challenge flows
  auth-core.ts                    # Auth core utilities
  auth-server.ts                  # Auth server logic
  auth-webauthn.ts                # WebAuthn implementation
  import-core.ts                  # Import logic
  export-core.ts                  # Export logic (JSON/CSV)
  filters.ts                      # Search/filter helpers
  singapore-holidays.ts           # Singapore holidays data
  timezone.ts                     # Timezone utilities (Singapore/Asia)
  hooks/                          # React hooks (lib-level)
    useDebounce.ts
    useNotifications.ts

tests/                            # 12 Playwright E2E + 15 unit tests
  unit/                           # 15 test files
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
  smoke.spec.ts                   # Health checks
  global-setup.ts                 # Test setup (virtual authenticator)
  helpers.ts                      # Reusable test helpers

PRPs/                             # 11 Product Requirement Profiles
mcp-configs/                      # MCP server configuration
scripts/                          # CLI scripts
  migrate.ts                      # Database migration script
  seed-holidays.ts                # Seed Singapore holidays
types/                            # Type declarations
  better-sqlite3.d.ts             # Legacy type declaration (kept for compatibility)
```

### Database Architecture — Drizzle ORM + Raw SQL Hybrid

**Schema Definitions (`lib/db-schema.ts`, 93 lines)**
- 9 Drizzle `pgTable` definitions: `todos`, `tags`, `todoTags`, `subtasks`, `templates`, `holidays`, `notifications`, `users`, `authenticators`
- Imported by `lib/db.ts` and `lib/auth-webauthn.ts` — actively used across the app

**Database Layer — Drizzle ORM with raw SQL fallbacks (`lib/db.ts`, ~1250 lines)**
- Primary pattern: Drizzle query builder via `schema.*` references
  - `db.insert(schema.todos).values({...})` — inserts
  - `db.select().from(schema.todos).where(eq(...))` — selects
  - `db.update(schema.todos).set({...}).where(eq(...))` — updates
  - `db.delete(schema.todos).where(eq(...))` — deletes
- Raw SQL (`sql\`...\``) used for: complex joins, ON CONFLICT, subqueries, bulk operations, date queries (~30% of operations)
- DDL in `createTables()` (lines 99–204) runs at startup to create tables if missing
- Facade pattern: `TodoFacade`, `TagFacade`, `SubtaskFacade`, `TemplateFacade`, `HolidayFacade`, `AuthFacade`
- **Facade accessors are the PRIMARY API consumption pattern** — all API routes use `getTodoDB()`, `getTagDB()`, etc.

**Schema vs DDL alignment (confirmed):**
The Drizzle schema in `lib/db-schema.ts` is now fully aligned with the PostgreSQL DDL in `createTables()`:
- `holidays.date` uses `date('date')` (maps to PostgreSQL `DATE`)
- `authenticators.counter` uses `bigint('counter', { mode: 'number' })` (maps to PostgreSQL `BIGINT`)

### API Structure (confirmed via filesystem scan)

```
app/login/page.tsx          Login/register UI
app/calendar/page.tsx       Calendar view
app/api/auth/*              6 auth endpoints
app/api/holidays/route.ts   Holiday data
app/api/notifications/check Notification polling endpoint
app/api/subtasks/[id]       Subtask update/delete
app/api/tags/               Tag collection (CRUD)
app/api/tags/[id]           Tag item operations
app/api/templates/          Template collection
app/api/templates/[id]      Template item
app/api/templates/[id]/use  Apply template to create todo
app/api/todos/              Todo collection (GET, POST)
app/api/todos/[id]          Todo item (GET, PATCH, DELETE)
app/api/todos/[id]/subtasks Subtask sub-collection
app/api/todos/[id]/tags     Tag sub-collection
app/api/todos/export        Export todos as JSON/CSV
app/api/todos/import        Import todos from JSON
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
- `calculateNextOccurrence()` at `db.ts` line 906–923 — basic date math (uses local JS Date arithmetic)
- `expandRecurrence()` at `db.ts` line 785–799 — raw SQL query for recurring todos within a date range

### Tag System (`lib/tag-core.ts`, `lib/db.ts`)
- M:N relationship via `todo_tags` junction table
- Tags have name (VARCHAR 100) + color (VARCHAR 7, hex format)
- User-scoped via facade authorization

### Subtask System (`lib/subtask-core.ts`, `lib/db.ts`)
- Position-based ordering
- Bulk position update support (`bulkUpdateSubtaskPositions`)
- Cascade delete on parent todo (DB-level ON DELETE CASCADE)

### Template System (`lib/template-core.ts`, `lib/db.ts`)
- Reusable todo structures with `subtasks_json` stored as TEXT (JSON string)
- Supports recurrence, reminders, and priority in templates
- Template-use flow creates a new todo + all subtasks from template
- Templates include: name, description, category, title_template, due_date_offset_minutes

### Authentication (`lib/auth-*.ts` — 4 auth modules)
- WebAuthn (passkeys) via `@simplewebauthn` v13.x
- JWT tokens via `jose` v5.x
- Users stored in `users` table with optional `password_hash` (reserved for future use)
- Authenticators in `authenticators` table linked to users
- Challenge flows in `lib/auth-challenges.ts`

### Calendar View (`lib/calendar.ts`)
- Month view generation in `buildCalendarMonth()` at `db.ts` line 577–629
- 42-day grid (6 weeks max), padding from prev/next months
- Singapore holidays integration via `lib/singapore-holidays.ts`

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
| `01-todo-crud-operations.spec.ts` | Create/Read/Update/Delete todos | EXISTS |
| `02-priority-system.spec.ts` | Priority levels (high/medium/low) | EXISTS |
| `03-recurring-todos.spec.ts` | Recurrence patterns | EXISTS |
| `04-reminders-notifications.spec.ts` | Reminder system | EXISTS |
| `05-subtasks-progress.spec.ts` | Subtask progress tracking | EXISTS |
| `06-tag-system.spec.ts` | Tag management | EXISTS |
| `07-template-system.spec.ts` | Todo templates | EXISTS |
| `08-search-filtering.spec.ts` | Search + filters | EXISTS |
| `09-export-import.spec.ts` | Data portability | EXISTS |
| `10-calendar-view.spec.ts` | Calendar display | EXISTS |
| `11-authentication-webauthn.spec.ts` | WebAuthn auth | EXISTS |
| `smoke.spec.ts` | Health checks | EXISTS |

---

## Product Requirement Profiles (PRPs)

11 PRPs exist in `PRPs/` matching the test IDs — providing requirement-to-implementation traceability for each feature.

---

## Critical Issues Summary

### ~~1. **Drizzle Schema vs DDL Type Mismatches**~~ (RESOLVED)
~~`lib/db-schema.ts` defined types that didn't match the actual PostgreSQL DDL in `createTables()`:~~
- ~~`holidays.date`: Drizzle = `varchar(10)` vs DDL = `DATE`~~ → **Fixed:** Now uses `date('date')`
- ~~`authenticators.counter`: Drizzle = `integer` vs DDL = `BIGINT`~~ → **Fixed:** Now uses `bigint('counter', { mode: 'number' })`

### 2. **No Formal Migration System** (HIGH PRIORITY)
- No `drizzle.config.*`, no `migrations/` directory, no `drizzle-kit` in devDependencies
- Table creation is hardcoded DDL in `createTables()` function (lines 99–204 of `db.ts`)
- New environments rely on runtime DDL — prone to drift between dev/staging/prod
- Schema changes require manual coordination

### 3. **Mixed Query Styles** (LOW PRIORITY)
Both Drizzle ORM (`db.select().from(schema.todos)`) and raw SQL (`sql\`...\``) coexist in the same file. This creates maintenance ambiguity — it's unclear which pattern to follow for new features. Raw SQL is used for ~30% of operations (complex joins, subqueries, ON CONFLICT clauses).

### 4. **pg Pool SSL Configuration** (INFO)
`lib/db.ts` line 73 — `ssl: false` is set for internal Docker/Railway/Coolify connections where the pool connects to PostgreSQL via localhost or internal network. If deploying with external PostgreSQL over public internet, re-enable SSL with `rejectUnauthorized: true`.

### 5. **Facade Pattern Adds Indirection** (LOW PRIORITY)
6 facade interfaces + factory functions add ~300 lines of indirection between API routes and DB functions. However, facades DO provide value: they enforce user-scoped authorization checks before every DB operation. This is not pure overhead — it's a security pattern.

---

## Recommended Actions

### ✅ Completed:
1. **Align `db-schema.ts` with DDL** — Fixed `holidays.date` to use `date()` type and `authenticators.counter` to use `bigint()` instead of `integer()` (schema now matches DDL)

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
- **tests/**: 12 Playwright E2E spec files (11 feature + smoke) + `global-setup.ts` + `helpers.ts` = 14 files
- **PRPs/**: 11 requirement docs
- **API routes**: 20 route files across 7 API modules
- **app/ pages**: 6 files (layout, page, error, login, calendar + globals.css)
- **Total deps**: 8 production + 14 dev = 22 total
