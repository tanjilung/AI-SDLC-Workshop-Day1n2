# Codebase Analysis: AI-SDLC-Workshop-Day1n2

## Project Overview

A **full-stack Todo Application** built with Next.js 15 (App Router) featuring WebAuthn (passkey) authentication, rich todo management, calendar views, and Singapore timezone support. Built for an AI-SDLC workshop demonstrating the complete software development lifecycle.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, Server Components) |
| **Language** | TypeScript 5.x |
| **Database** | PostgreSQL (via `pg` + `drizzle-orm/node-postgres`) |
| **Auth** | WebAuthn/Passkeys (`@simplewebauthn/server` + `@simplewebauthn/browser`) |
| **Styling** | Tailwind CSS 4.x |
| **Testing** | Vitest (unit) + Playwright (E2E) |
| **Linting** | ESLint (Next.js config) |
| **Deployment** | Railway (Linux/x86-64, nixpacks) |

---

## Architecture

### Directory Structure

```
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout (providers, globals)
│   ├── page.tsx              # Home page (~2200 lines, monolithic client component)
│   ├── login/                # Login/register route group
│   ├── calendar/             # Calendar view
│   └── api/                  # API routes (REST)
│       ├── auth/             # WebAuthn auth flow (6 endpoints)
│       ├── todos/            # CRUD + export/import (+ subtasks/tags per todo)
│       ├── tags/             # Tag management
│       ├── templates/        # Template CRUD + use endpoint
│       ├── subtasks/         # Subtask management
│       ├── notifications/    # Notification check endpoint
│       └── holidays/         # Singapore holidays
├── lib/                      # Business logic (server-safe)
│   ├── db.ts                 # PostgreSQL connection (pg + drizzle)
│   ├── todo-types.ts         # Shared type definitions
│   ├── todo-core.ts          # Validation, sorting, sectioning
│   ├── subtask-core.ts       # Subtask progress calculation
│   ├── tag-core.ts           # Tag defaults/helpers
│   ├── template-core.ts      # Template logic
│   ├── recurrence.ts         # Recurring todo generation
│   ├── filters.ts            # Filter presets + applyFilters
│   ├── calendar.ts           # Calendar view logic
│   ├── timezone.ts           # Singapore timezone utilities
│   ├── singapore-holidays.ts # Holiday data + helpers
│   ├── notifications.ts      # Notification helpers
│   ├── export-core.ts        # Export logic
│   ├── import-core.ts        # Import logic
│   ├── auth.ts               # Auth helpers
│   ├── auth-core.ts          # Core auth primitives
│   ├── auth-server.ts        # Server-side auth (sessions)
│   ├── auth-challenges.ts    # Challenge-based auth
│   ├── auth-webauthn.ts      # WebAuthn registration/authentication
│   ├── hooks/                # React hooks
│       ├── useDebounce.ts
│       └── useNotifications.ts
├── tests/                    # Playwright E2E tests (11 feature suites)
├── PRPs/                     # Product Requirement Documents (11 specs)
├── scripts/                  # Utility scripts (seed-holidays.ts)
├── middleware.ts             # Next.js middleware (auth enforcement)
└── plugins/                  # MCP server configs
```

### Client/Server Boundary

| Category | Examples | Notes |
|----------|----------|-------|
| **Pure logic** (safe everywhere) | `todo-core`, `subtask-core`, `tag-core`, `template-core`, `filters`, `timezone`, `recurrence` | No DB/auth imports — can be used in client or server |
| **Server-only** | `db`, `auth-webauthn`, `auth-server`, `calendar`, `holidays`, `notifications`, `export-core`, `import-core` | Import pg/Node APIs, or WebAuthn server libs |
| **Client-only** | React hooks (`useDebounce`, `useNotifications`) | Use browser APIs (Window, Notification) |

**Key pattern:** API routes in `app/api/` are Server Components that import `db` and core libraries. The home page (`app/page.tsx`) is `'use client'` and imports only pure-logic libraries for validation/computation, calling REST endpoints via `fetch`.

---

## API Surface (18 endpoints)

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register-options` | Get WebAuthn registration options |
| POST | `/api/auth/register-verify` | Verify registration credential |
| POST | `/api/auth/login-options` | Get WebAuthn authentication options |
| POST | `/api/auth/login-verify` | Verify authentication credential |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/me` | Get current user (session check) |

### Todos
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/todos` | List all todos |
| POST | `/api/todos` | Create todo |
| GET/PUT/DELETE | `/api/todos/[id]` | Read/update/delete todo |
| GET | `/api/todos/export?format=` | Export (JSON/CSV) |
| POST | `/api/todos/import` | Import from JSON/CSV |
| GET | `/api/todos/[id]/subtasks` | List subtasks for todo |
| POST | `/api/todos/[id]/tags` | Attach tags to todo |

### Tags
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag |
| GET/PUT/DELETE | `/api/tags/[id]` | Read/update/delete tag |

### Templates
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/templates` | List all templates |
| POST | `/api/templates` | Create template |
| GET/PUT/DELETE | `/api/templates/[id]` | Read/update/delete template |
| POST | `/api/templates/[id]/use` | Create todo from template |

### Subtasks
| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT/DELETE | `/api/subtasks/[id]` | Update/detach subtask |

### Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/notifications/check` | Check for due reminders |

### Holidays
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/holidays` | Singapore public holidays |

---

## Database Schema

PostgreSQL database (`db.ts`, Drizzle ORM) with these tables:

| Table | Key Columns |
|-------|------------|
| **users** | id, username (unique), password_hash, created_at, updated_at |
| **authenticators** | credential_id (PK), user_id (FK), public_key, counter, transports |
| **todos** | id, user_id, title, notes, due_date, completed, priority, is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent, created_at, updated_at, completed_at |
| **subtasks** | id, todo_id (FK), title, completed, position |
| **tags** | id, user_id, name (unique per user), color |
| **todo_tags** | todo_id (FK), tag_id (FK) — composite PK |
| **templates** | id, user_id, name, description, category, title_template, priority, is_recurring, recurrence_pattern, reminder_minutes, due_date_offset_minutes, subtasks_json, created_at, updated_at |
| **notifications** | id (SERIAL PK), todo_id (FK), notification_type, scheduled_for, status |
| **holidays** | date (PK), name, created_at |

**ID strategy:** `crypto.randomUUID()` (UUID v4) for all entities. `user_id` on todos/templates/tags enables multi-tenant isolation. PostgreSQL enforces foreign keys natively.

---

## Key Code Quality Observations

### Strengths
1. **Strict TypeScript** — Full type safety across shared types, API responses, and client components
2. **Clean separation of concerns** — Core logic in `lib/` (pure functions), I/O in API routes
3. **Optimistic UI** — Home page uses optimistic updates with rollback on failure
4. **Singapore timezone focus** — All date operations use `Asia/Singapore` as the reference timezone
5. **WebAuthn-first auth** — Passkey-based authentication is properly implemented (register → verify flow)
6. **Filter presets** — Persisted filter combinations with named presets
7. **11 E2E test suites** — Comprehensive Playwright tests covering all features
8. **11 PRD documents** — Complete requirement traceability from specs to implementation

### Concerns
1. **Monolithic home page** (~2179 lines) — `app/page.tsx` contains ALL UI logic, forms, handlers. Should be split into smaller components.
2. **Client-side auth state** — Session verification done via `/api/auth/me` fetches on every page load rather than server-component session management
3. **No rate limiting** — Auth endpoints have no brute-force protection
4. **Inline error handling** — Repetitive try/catch patterns across handlers with duplicated error display logic
5. **Raw SQL in Drizzle** — Heavy use of `sql\`raw\`` queries instead of Drizzle's query builder; loses type-safe query compilation benefits

### Architectural Notes

- The middleware (`middleware.ts`) enforces authentication by redirecting unauthenticated users to `/login`
- Calendar view uses the Singapore timezone for all date calculations
- Recurring todos are expanded on-the-fly rather than stored as instances
- Subtasks are scoped per-todo via API path nesting (`/api/todos/[id]/subtasks`)
- Tags use a junction table (`todo_tags`) for N:M relationships
- Browser notifications are used for reminders (with permission gating)

---

## Test Coverage (Playwright E2E)

| Suite | Feature | File |
|-------|---------|------|
| 01 | Todo CRUD operations | `tests/01-todo-crud-operations.spec.ts` |
| 02 | Priority system | `tests/02-priority-system.spec.ts` |
| 03 | Recurring todos | `tests/03-recurring-todos.spec.ts` |
| 04 | Reminders/notifications | `tests/04-reminders-notifications.spec.ts` |
| 05 | Subtasks | `tests/05-subtasks-progress.spec.ts` |
| 06 | Tags | `tests/06-tag-system.spec.ts` |
| 07 | Templates | `tests/07-template-system.spec.ts` |
| 08 | Search/filtering | `tests/08-search-filtering.spec.ts` |
| 09 | Export/import | `tests/09-export-import.spec.ts` |
| 10 | Calendar view | `tests/10-calendar-view.spec.ts` |
| 11 | WebAuthn auth | `tests/11-authentication-webauthn.spec.ts` |

---

## File Metrics

| Category | Count | Notes |
|----------|-------|-------|
| API route files | ~19 | REST endpoints across 7 feature areas |
| Core library modules | ~20 | Business logic + auth + utilities |
| React hooks | 2 | `useDebounce`, `useNotifications` |
| E2E test suites | 11 | Feature-parity with PRDs |
| PRD documents | 11 | Complete specification coverage |
| Total source files | ~50 | TypeScript + config files |

---

## Deployment

- **Platform:** Railway
- **Build:** nixpacks (auto-detected Node.js + PostgreSQL client library)
- **Config files:** `nixpacks.toml`, `railway.json`
- **Environment:** `.env.example` provides required variables template
- **CI/CD:** GitHub Actions workflow (`github/workflows/ci.yml`)
