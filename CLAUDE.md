# Todo App - Claude Code Instructions

## Repository State

This repository contains a **fully implemented** Next.js 16 ToDo application with WebAuthn authentication, PostgreSQL persistence, and Playwright E2E tests. All source code (`app/`, `lib/`, `middleware.ts`, `package.json`, `tests/`, etc.) is present and functional.

## Architecture Overview

A **Next.js 16** (App Router) full-stack ToDo application with authentication, calendar views, recurring tasks, subtasks, tags, templates, notifications, and Singapore holidays. Deployed on Railway or Coolify with PostgreSQL.

### Core Stack
- **Framework**: Next.js 16.0.0 (App Router)
- **UI**: React 19.0.0 + Tailwind CSS 4
- **Database**: PostgreSQL via `pg` driver + **Drizzle ORM** (`drizzle-orm` ^0.45.2) with schema definitions in `lib/db-schema.ts`
- **Auth**: WebAuthn/Passkeys (`@simplewebauthn/browser` + `@simplewebauthn/server`) + JWT sessions (`jose`)
- **Testing**: Playwright (E2E) + tsx (unit tests)
- **Linting**: ESLint 9 + TypeScript 5

**Dependencies**: 8 production, 14 dev — total 22

---

## Critical Patterns

### 1. Authentication Flow (WebAuthn/Passkeys)
- **WebAuthn only** — no traditional passwords (users table has optional `password_hash` but app uses passkeys)
- Uses `@simplewebauthn/server` and `@simplewebauthn/browser` libraries (v13.x)
- Session tokens stored as HTTP-only cookies via `lib/auth.ts` (JWT with 7-day expiry)
- Middleware (`middleware.ts`) protects `/` and `/calendar` routes
- When modifying authenticator logic, **always use `?? 0` for counter field** to handle undefined values:
  ```typescript
  counter: authenticator.counter ?? 0
  ```

**WebAuthn Flow Pattern:**
1. Client calls `/api/auth/register-options` or `/api/auth/login-options` to get challenge
2. Client uses `@simplewebauthn/browser` to interact with authenticator
3. Client posts response to `/api/auth/register-verify` or `/api/auth/login-verify`
4. Server verifies response using `@simplewebauthn/server` and creates JWT session

**Buffer Encoding:** WebAuthn credentials require base64/base64url conversions. Use `isoBase64URL` from `@simplewebauthn/server/helpers` for credential_id handling.

### 2. Database Architecture — Drizzle ORM + Raw SQL Hybrid

**Schema Definitions**: `lib/db-schema.ts` (93 lines, 9 `pgTable` definitions: `todos`, `tags`, `todoTags`, `subtasks`, `templates`, `holidays`, `notifications`, `users`, `authenticators`)

**Database Layer**: `lib/db.ts` (~1250 lines) is the single source of truth for all DB operations.
- Primary pattern: Drizzle query builder via `schema.*` references
  - `db.insert(schema.todos).values({...})` — inserts
  - `db.select().from(schema.todos).where(eq(...))` — selects
  - `db.update(schema.todos).set({...}).where(eq(...))` — updates
  - `db.delete(schema.todos).where(eq(...))` — deletes
- Raw SQL (`sql\`...\``) used for: complex joins, ON CONFLICT, subqueries, bulk operations, date queries (~30% of operations)
- DDL in `createTables()` runs at startup to create tables if missing (no formal migration system)
- Facade pattern: `TodoFacade`, `TagFacade`, `SubtaskFacade`, `TemplateFacade`, `HolidayFacade`, `AuthFacade` — all API routes consume DB through facade accessors (`getTodoDB()`, `getTagDB()`, etc.) which add user-scoped authorization checks

**Schema vs DDL differences (known):**
| Feature | db-schema.ts (Drizzle) | createTables() (DDL) |
|---------|----------------------|---------------------|
| `holidays.date` | `varchar('date', { length: 10 })` | `DATE` |
| `authenticators.counter` | `integer` | `BIGINT` |

Key tables and relationships:
- `users` → `authenticators` (one-to-many)
- `users` → `todos` → `subtasks` (one-to-many with CASCADE delete)
- `todos` ↔ `tags` (many-to-many via `todo_tags`)
- `users` → `templates` (reusable todo patterns with JSON-serialized subtasks)
- `holidays` (Singapore public holidays, timezone-aware)
- `notifications` (reminder tracking)

**When adding database features:**
- Add schema to `lib/db-schema.ts` first
- Add DDL to `createTables()` in `lib/db.ts`
- Add facade methods for user-scoped access
- Export DB types from `lib/db.ts`

### 3. Singapore Timezone (Mandatory)
All date/time operations **must** use `lib/timezone.ts`:
```typescript
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';
const now = getSingaporeNow(); // NOT new Date()
```
This applies to: due dates, reminders, recurring todos, holiday calculations.

### 4. API Route Patterns
All API routes follow this structure:
```typescript
export async function GET/POST/PUT/DELETE(request: NextRequest) {
  const session = await getSession(); // Always check auth first
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // For routes with params (Next.js 16):
  const { id } = await params; // params is a Promise in Next.js 16

  // Use session.userId for all DB queries via facade accessors
  const todoDB = getTodoDB();
}
```

### 5. Feature-Rich Todo Model
Todos support: priority (high/medium/low), recurring patterns (daily/weekly/monthly/yearly), reminders (15m/30m/1h/2h/1d/2d/1w before), subtasks with progress tracking, tags, and notes.

**When completing recurring todos**: Create next instance with same priority, tags, reminder offset, and recurrence pattern. See `app/api/todos/[id]/route.ts` PUT handler.

---

## Development Workflows

### Setup & Run
```bash
npm install
npm run dev           # Start dev server on :3000
npm run build         # Production build
npm run lint          # ESLint check
```

### Testing
```bash
npm test                            # Run all E2E tests (Playwright)
npx playwright test --ui            # Interactive UI mode
npx playwright test tests/01-todo-crud-operations.spec.ts  # Single test file
npx playwright show-report          # View HTML report
npm run test:unit                   # Run unit tests (tsx)
```

**Virtual WebAuthn Authenticators:**
- Tests use virtual authenticators (configured in `playwright.config.ts` with Chromium flags)
- Set `timezoneId: 'Asia/Singapore'` in Playwright config to match app timezone
- Test files organized by feature (`01-todo-crud-operations`, `02-priority-system`, etc.)
- Helper class `tests/helpers.ts` provides reusable methods: `createTodo()`, `addSubtask()`, `createTag()`

### Database Management
```bash
# Run migrations (creates/verifies tables)
npm run db:migrate

# Seed Singapore holidays
npm run seed:holidays

# Inspect database (psql)
psql "$DATABASE_URL" -c '\dt'     # list tables
psql "$DATABASE_URL" -c 'SELECT * FROM todos LIMIT 5;'
```

---

## Project-Specific Conventions

### 1. Client vs Server Components
- Main pages (`app/page.tsx`, `app/calendar/page.tsx`) are `'use client'` — they manage state and fetch from API routes
- API routes handle all database operations server-side
- Never import `lib/db.ts` directly in client components

### 2. Error Handling in API Routes
Always use null coalescing for potentially undefined database fields:
```typescript
counter: authenticator.counter ?? 0
reminder_minutes: todo.reminder_minutes ?? null
```

### 3. Monolithic UI Pattern
Main todo page (`app/page.tsx`) is intentionally a large client component with all features:
- Single file handles: todos, subtasks, tags, templates, filtering, export/import
- State management via React hooks (no external state library)
- All API calls made directly from component using fetch
- Pattern chosen for simplicity over modularity — keep additions in this file unless creating new routes

### 4. Type Safety & Code Generation
Shared types live in `lib/todo-types.ts` and are re-exported from `lib/db.ts`:
```typescript
import { Priority, RecurrencePattern, Todo, Template } from '@/lib/db';
```

---

## Key Integration Points

### Notification System
- Browser notifications use `lib/hooks/useNotifications.ts` hook
- Backend checks due reminders via `app/api/notifications/check/route.ts`
- Frontend polls this endpoint periodically and triggers browser notifications
- Respects `last_notification_sent` to prevent duplicates

### Template System
- Templates in `templates` table store todo patterns with JSON-serialized subtasks (`subtasks_json`)
- `POST /api/templates/[id]/use` creates todo from template, calculating due date from offset
- Subtasks JSON structure: `[{ title: string, position: number }]`
- When creating templates, serialize subtasks array to JSON string before storing

### Export/Import
- `GET /api/todos/export?format=json|csv` exports todos in JSON or CSV format
- `POST /api/todos/import` accepts JSON format, remaps IDs, preserves relationships

---

## Common Pitfalls

1. **Don't use `new Date()` directly** — always use `getSingaporeNow()` from `lib/timezone.ts` for timezone-sensitive operations
2. **params is async in Next.js 16** — use `const { id } = await params`
3. **Database fields can be null/undefined** — use `?? 0` or `|| null` when passing to functions
4. **Recurring todos need special handling** — see PUT `/api/todos/[id]` for completion logic
5. **WebAuthn credentials use base64/base64url encoding** — buffer conversions required
6. **Don't override pg-types DATE/TIMESTAMP parsers** — on some pg versions it corrupts VARCHAR column parsing (use `safeToIso` helpers instead)

---

## File Reference

- **Auth**: `lib/auth.ts`, `lib/auth-core.ts`, `lib/auth-server.ts`, `lib/auth-webauthn.ts`, `lib/auth-challenges.ts`, `middleware.ts`, `app/api/auth/**`
- **Database**: `lib/db.ts` (~1250 lines, all operations), `lib/db-schema.ts` (9 Drizzle table definitions)
- **Types**: `lib/todo-types.ts` (shared TypeScript types)
- **Timezone**: `lib/timezone.ts`
- **Business Logic**: `lib/*-core.ts` files (todo, tag, subtask, template, import, export, filters, recurrence, calendar, notifications)
- **Main UI**: `app/page.tsx` (large client component), `app/calendar/page.tsx`, `app/login/page.tsx`
- **API Routes**: `app/api/**/*.ts` (20 route files across 7 API modules)
- **Tests**: `tests/*.spec.ts` (12 Playwright E2E specs), `tests/unit/*.test.ts` (15 unit tests), `tests/helpers.ts`, `tests/global-setup.ts`

---

## Related Documentation

- **`PRPs/`** — Product Requirement Profiles, one per feature (schema, endpoints, UI, edge cases, acceptance criteria, tests). Read the relevant PRP before implementing or modifying a feature. Start at `PRPs/README.md`.
- **`USER_GUIDE.md`** — Comprehensive user-facing feature documentation (2000+ lines)
- **`EVALUATION.md`** — Feature completeness checklist, acceptance criteria, and deployment guidance
- **`CODEBASE_ANALYSIS.md`** — Detailed codebase architecture analysis with file inventory, dependency counts, and issue tracking
- **`README.md`** — Setup guide for developers (install VS Code, Node.js, GitHub Copilot, clone, run)
- **`RAILWAY_DEPLOYMENT.md`** — Advanced Railway deployment via GitHub Actions + CLI secrets
- **`RAILWAY_SIMPLE_SETUP.md`** — Simple Railway deployment using built-in GitHub integration (recommended)
- **`COOLIFY_DEPLOYMENT.md`** — Coolify self-hosted deployment guide
