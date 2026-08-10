# Todo App — Feature Completeness Evaluation

This document provides a comprehensive checklist for evaluating the completeness of the Todo App implementation, including all core features, testing, and deployment readiness.

---

## Table of Contents
1. [Core Features Evaluation](#core-features-evaluation)
2. [Testing & Quality Assurance](#testing--quality-assurance)
3. [Performance & Optimization](#performance--optimization)
4. [Deployment Readiness](#deployment-readiness)
5. [Post-Deployment Checklist](#post-deployment-checklist)
6. [Evaluation Scoring](#evaluation-scoring)

---

## Core Features Evaluation

### Feature 01: Todo CRUD Operations
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database schema created with all required fields (id, user_id, title, notes, due_date, completed, priority, is_recurring, recurrence_pattern, reminder_minutes, timestamps)
- [ ] API endpoint: `POST /api/todos` (create)
- [ ] API endpoint: `GET /api/todos` (read all)
- [ ] API endpoint: `GET /api/todos/[id]` (read one)
- [ ] API endpoint: `PATCH /api/todos/[id]` (update)
- [ ] API endpoint: `DELETE /api/todos/[id]` (delete)
- [ ] Singapore timezone validation for due dates
- [ ] Todo title validation (non-empty, trimmed)
- [ ] Due date must be in future (minimum 1 minute)
- [ ] UI form for creating todos
- [ ] UI display in sections (Overdue, Pending, Completed)
- [ ] Toggle completion checkbox
- [ ] Edit todo modal/form
- [ ] Delete action (no confirmation dialog — immediate delete by design)

**Testing:**
- [ ] E2E test: Create todo with title only
- [ ] E2E test: Create todo with all metadata
- [ ] E2E test: Edit todo
- [ ] E2E test: Toggle completion
- [ ] E2E test: Delete todo
- [ ] E2E test: Past due date validation

**Acceptance Criteria:**
- [ ] Can create todo with just title
- [ ] Can create todo with priority, due date, recurring settings, and reminder
- [ ] Todos sorted by priority and due date
- [ ] Completed todos move to Completed section
- [ ] Delete cascades to subtasks and tag associations

---

### Feature 02: Priority System
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `priority` field in todos table (VARCHAR, default 'medium')
- [ ] Type definition: `type Priority = 'high' | 'medium' | 'low'`
- [ ] Priority validation in API routes
- [ ] Default priority set to 'medium'
- [ ] Priority badge display (red/yellow/blue color coding)
- [ ] Priority dropdown in create/edit forms
- [ ] Priority filter dropdown in UI
- [ ] Todos auto-sort by priority (high → medium → low)
- [ ] Dark mode color compatibility

**Testing:**
- [ ] E2E test: Create todo with each priority level
- [ ] E2E test: Edit priority
- [ ] E2E test: Filter by priority
- [ ] E2E test: Verify sorting (high → medium → low)

**Acceptance Criteria:**
- [ ] Three priority levels functional
- [ ] Color-coded badges visible in all views
- [ ] Automatic sorting by priority works
- [ ] Filter shows only selected priority

---

### Feature 03: Recurring Todos
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `is_recurring` (BOOLEAN) and `recurrence_pattern` (VARCHAR) fields
- [ ] Type: `type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly'`
- [ ] Validation: Recurring todos require a due date
- [ ] "Repeat" checkbox in create/edit forms
- [ ] Recurrence pattern dropdown (shown when Repeat enabled)
- [ ] Next instance creation on completion
- [ ] Due date calculation logic for each pattern
- [ ] Inherit: priority, tags, reminder, recurrence pattern
- [ ] Recurrence badge display with pattern name

**Testing:**
- [ ] E2E test: Create daily recurring todo
- [ ] E2E test: Create weekly recurring todo
- [ ] E2E test: Complete recurring todo creates next instance
- [ ] E2E test: Next instance has correct due date
- [ ] E2E test: Next instance inherits metadata

**Acceptance Criteria:**
- [ ] All four patterns work correctly
- [ ] Next instance created on completion
- [ ] Metadata inherited properly
- [ ] Date calculations accurate (uses JS Date arithmetic)
- [ ] Can disable recurring on existing todo

---

### Feature 04: Reminders & Notifications
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `reminder_minutes` and `last_notification_sent` fields in todos table
- [ ] Separate `notifications` table for notification logging
- [ ] Custom hook: `useNotifications` in `lib/hooks/`
- [ ] API endpoint: `GET /api/notifications/check`
- [ ] "Enable Notifications" button with browser permission request
- [ ] Reminder dropdown (7 timing options: 15m, 30m, 1h, 2h, 1d, 2d, 1w)
- [ ] Reminder dropdown disabled when no due date set
- [ ] Browser notification fires at reminder time
- [ ] Frontend polling system for pending reminders
- [ ] Duplicate prevention via `last_notification_sent` timestamp
- [ ] Reminder badge display with timing abbreviation

**Testing:**
- [ ] Manual test: Enable notifications (browser permission granted)
- [ ] Manual test: Receive notification at correct time
- [ ] E2E test: Set reminder on todo
- [ ] E2E test: Reminder badge displays correctly
- [ ] E2E test: API returns todos needing notification

**Acceptance Criteria:**
- [ ] Browser permission request works
- [ ] All 7 timing options available
- [ ] Notifications fire at correct time
- [ ] Only one notification per reminder (deduplication works)

---

### Feature 05: Subtasks & Progress Tracking
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `subtasks` table with CASCADE delete on parent todo
- [ ] API endpoint: `POST /api/todos/[id]/subtasks` (create subtask)
- [ ] API endpoint: `PATCH /api/subtasks/[id]` (update subtask)
- [ ] API endpoint: `DELETE /api/subtasks/[id]` (delete subtask)
- [ ] Expandable/collapsible subtasks section in UI
- [ ] Add subtask input field with Enter key support
- [ ] Subtask completion checkboxes
- [ ] Delete subtask button per item
- [ ] Progress bar component (0–100%)
- [ ] Progress text display: "X/Y subtasks"
- [ ] Position-based ordering for subtasks

**Testing:**
- [ ] E2E test: Expand/collapse subtasks section
- [ ] E2E test: Add multiple subtasks
- [ ] E2E test: Toggle subtask completion
- [ ] E2E test: Progress bar updates in real-time
- [ ] E2E test: Delete subtask
- [ ] E2E test: Delete todo cascades to subtasks

**Acceptance Criteria:**
- [ ] Can add unlimited subtasks per todo
- [ ] Can toggle individual subtask completion
- [ ] Progress updates in real-time
- [ ] Visual progress bar is accurate
- [ ] Cascade delete works (DB-level ON DELETE CASCADE)

---

### Feature 06: Tag System
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `tags` table + `todo_tags` junction table (M:N)
- [ ] API endpoint: `GET /api/tags` (list user tags)
- [ ] API endpoint: `POST /api/tags` (create tag)
- [ ] API endpoint: `PATCH /api/tags/[id]` (update tag)
- [ ] API endpoint: `DELETE /api/tags/[id]` (delete tag)
- [ ] API endpoint: `POST /api/todos/[id]/tags` (attach tag)
- [ ] API endpoint: `DELETE /api/todos/[id]/tags` (detach tag)
- [ ] "Manage Tags" modal
- [ ] Tag creation form (name + color picker with hex support)
- [ ] Tag list with edit/delete buttons
- [ ] Tag selection pills in todo create/edit forms
- [ ] Colored tag pills displayed on todos
- [ ] Tag filter dropdown

**Testing:**
- [ ] E2E test: Create tag with custom color
- [ ] E2E test: Edit tag name/color
- [ ] E2E test: Delete tag removes from all todos
- [ ] E2E test: Assign multiple tags to todo
- [ ] E2E test: Filter by tag

**Acceptance Criteria:**
- [ ] Tag names unique per user (enforced at application level)
- [ ] Custom hex colors work
- [ ] Editing tag name updates display on all associated todos
- [ ] Deleting tag removes associations (CASCADE via junction table)
- [ ] Tag filter works correctly

---

### Feature 07: Template System
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `templates` table with all metadata fields
- [ ] API endpoint: `GET /api/templates` (list)
- [ ] API endpoint: `POST /api/templates` (create)
- [ ] API endpoint: `PATCH /api/templates/[id]` (update)
- [ ] API endpoint: `DELETE /api/templates/[id]` (delete)
- [ ] API endpoint: `POST /api/templates/[id]/use` (create todo from template)
- [ ] "Save as Template" button in UI
- [ ] Save template modal (name, description, category)
- [ ] "Use Template" dropdown/button in todo form
- [ ] Template manager modal
- [ ] Subtasks JSON serialization (`subtasks_json` TEXT field)
- [ ] Due date offset calculation

**Testing:**
- [ ] E2E test: Save todo as template
- [ ] E2E test: Create todo from template
- [ ] E2E test: Template preserves settings (priority, recurrence, reminder)
- [ ] E2E test: Subtasks recreated from JSON when using template
- [ ] E2E test: Edit template
- [ ] E2E test: Delete template

**Acceptance Criteria:**
- [ ] Can save current todo configuration as template
- [ ] Templates preserve priority, recurrence, and reminder settings
- [ ] Using template creates a new todo with all saved settings
- [ ] Subtasks recreated from serialized JSON
- [ ] Deleting template does NOT affect todos created from it

---

### Feature 08: Search & Filtering
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Search input field at top of todo list
- [ ] Real-time debounced search (300ms via `useDebounce` hook)
- [ ] Case-insensitive search across todo titles AND subtask titles
- [ ] Priority filter dropdown
- [ ] Tag filter dropdown
- [ ] Advanced filters panel (toggleable):
  - Completion status (All / Incomplete / Completed)
  - Date range (From / To)
- [ ] Saved filter presets (stored in browser localStorage)
- [ ] Combined filters use AND logic
- [ ] "Clear All" button when any filter is active
- [ ] Empty state message when no results match

**Testing:**
- [ ] E2E test: Search by todo title
- [ ] E2E test: Search finds matching subtask content
- [ ] E2E test: Filter by priority
- [ ] E2E test: Filter by tag
- [ ] E2E test: Combine multiple filters (AND logic)
- [ ] E2E test: Save and apply filter preset
- [ ] E2E test: Clear all filters

**Acceptance Criteria:**
- [ ] Search is case-insensitive with partial matching
- [ ] Search includes subtask titles
- [ ] Filters combine with AND logic
- [ ] Real-time updates as you type
- [ ] Clear message for empty results

---

### Feature 09: Export & Import
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] API endpoint: `GET /api/todos/export?format=json|csv` (dual format)
- [ ] API endpoint: `POST /api/todos/import` (JSON import only)
- [ ] "Export JSON" button in UI
- [ ] "Export CSV" button in UI
- [ ] "Import" button with file picker
- [ ] JSON export includes: todos, subtasks, tags, and associations
- [ ] CSV export for spreadsheet compatibility
- [ ] Import validates JSON structure before processing
- [ ] ID remapping on import (new IDs assigned)
- [ ] Tag conflict resolution (reuse existing by name)
- [ ] Success message with import counts
- [ ] Error handling for invalid/corrupted files

**Testing:**
- [ ] E2E test: Export todos as JSON
- [ ] E2E test: Export todos as CSV
- [ ] E2E test: Import valid JSON file
- [ ] E2E test: Import invalid JSON shows error message
- [ ] E2E test: Imported todos appear immediately

**Acceptance Criteria:**
- [ ] JSON export creates valid, complete data dump
- [ ] CSV export opens correctly in spreadsheet apps
- [ ] Import validates format and rejects invalid files with clear errors
- [ ] All relationships preserved on import
- [ ] No duplicate tags created (existing tags reused by name)

---

### Feature 10: Calendar View
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `holidays` table seeded with Singapore holidays
- [ ] API endpoint: `GET /api/holidays`
- [ ] Calendar page route: `/calendar`
- [ ] 42-day calendar grid (up to 6 weeks)
- [ ] Month navigation (previous/next/today buttons)
- [ ] Day headers (Sun–Sat)
- [ ] Current day highlighted
- [ ] Weekend styling
- [ ] Holiday display with names
- [ ] Todos rendered on their due dates within calendar cells
- [ ] Priority color-coding on calendar

**Testing:**
- [ ] E2E test: Calendar loads current month
- [ ] E2E test: Navigate to previous/next month
- [ ] E2E test: Today button jumps to current month
- [ ] E2E test: Todo appears on correct date cell
- [ ] E2E test: Holiday displayed on correct date

**Acceptance Criteria:**
- [ ] Calendar grid displays correctly with padding days
- [ ] Singapore holidays shown on the calendar
- [ ] Todos appear on their correct due dates
- [ ] Month navigation works smoothly

---

### Feature 11: Authentication (WebAuthn)
**Status:** ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Verified

**Implementation Checklist:**
- [ ] Database: `users` and `authenticators` tables
- [ ] API endpoint: `POST /api/auth/register-options`
- [ ] API endpoint: `POST /api/auth/register-verify`
- [ ] API endpoint: `POST /api/auth/login-options`
- [ ] API endpoint: `POST /api/auth/login-verify`
- [ ] API endpoint: `POST /api/auth/logout`
- [ ] API endpoint: `GET /api/auth/me`
- [ ] Auth utilities: `lib/auth.ts`, `lib/auth-core.ts`, `lib/auth-server.ts`, `lib/auth-webauthn.ts`
- [ ] Middleware: `middleware.ts` (protects `/` and `/calendar`)
- [ ] Login/Register page at `/login`
- [ ] Session cookies (HTTP-only, Secure flag configurable via COOKIE_SECURE, 7-day expiry)
- [ ] Protected routes redirect unauthenticated users to `/login`

**Testing:**
- [ ] E2E test: Register new user (virtual authenticator)
- [ ] E2E test: Login existing user
- [ ] E2E test: Logout clears session
- [ ] E2E test: Protected route redirects unauthenticated user
- [ ] E2E test: Authenticated user redirected away from `/login`

**Acceptance Criteria:**
- [ ] Registration works with device passkey/biometric
- [ ] Login works with registered passkey
- [ ] Session persists across page reloads (up to 7 days)
- [ ] Logout clears session immediately
- [ ] All protected routes are secured

---

## Testing & Quality Assurance

### Unit Tests
- [ ] Database CRUD operations tested (`tests/unit/db.test.ts`)
- [ ] Date/time calculations tested (`tests/unit/timezone.test.ts`)
- [ ] Progress calculation tested (`tests/unit/subtask-core.test.ts`)
- [ ] Import/export logic tested
- [ ] Validation functions tested
- [ ] All utility modules have corresponding tests

### E2E Tests (Playwright)
- [ ] All 11 feature test files created and passing
- [ ] `tests/helpers.ts` provides reusable methods
- [ ] Virtual authenticator configured in `playwright.config.ts`
- [ ] Singapore timezone set in Playwright config
- [ ] `smoke.spec.ts` validates basic health checks
- [ ] Tests pass consistently (3 consecutive clean runs)

### Code Quality
- [ ] ESLint configured and passing (`npm run lint`)
- [ ] TypeScript strict mode enabled
- [ ] No TypeScript compilation errors
- [ ] Proper error handling in all API routes
- [ ] Loading states for async operations

---

## Performance & Optimization

### Frontend Performance
- [ ] Page load time < 2 seconds
- [ ] Todo CRUD operations respond < 500ms
- [ ] Search/filter updates < 100ms (debounced)

### Backend Performance
- [ ] API responses < 300ms (average)
- [ ] Database indexes on foreign keys and common query columns
- [ ] No N+1 query problems

### Database Indexes (confirmed in DDL)
| Index | Column(s) | Purpose |
|-------|-----------|---------|
| `idx_todos_user_id` | todos.user_id | User-scoped queries |
| `idx_todos_completed` | todos.completed | Completion filtering |
| `idx_todos_due_date` | todos.due_date | Date range queries |
| `idx_todos_priority` | todos.priority | Priority filtering |
| `idx_todos_user_completed` | todos(user_id, completed) | Composite filter |
| `idx_tags_user_id` | tags.user_id | User tag lookups |
| `idx_subtasks_todo_id` | subtasks.todo_id | Subtask loading |
| `idx_templates_user_id` | templates.user_id | Template lookups |
| `idx_notifications_todo_id` | notifications.todo_id | Notification queries |
| `idx_authenticators_user_id` | authenticators.user_id | Auth lookups |

---

## Deployment Readiness

### Environment Configuration
- [ ] `.env.example` documents all required variables
- [ ] `JWT_SECRET` configured (32+ characters)
- [ ] `RP_ID` set for production domain
- [ ] `RP_NAME` set for production
- [ ] `RP_ORIGIN` matches production URL
- [ ] `DATABASE_URL` points to managed PostgreSQL

### Security Checklist
- [ ] HTTP-only cookies enabled
- [ ] Secure flag on cookies (HTTPS deployments)
- [ ] SameSite cookies configured
- [ ] No sensitive data exposed in logs or client bundles
- [ ] SQL injection prevention (Drizzle parameterized queries + raw SQL with parameters)
- [ ] XSS prevention (React automatic escaping)
- [ ] User-scoped authorization via facade pattern

### Production Readiness
- [ ] Production build succeeds (`npm run build`)
- [ ] Error boundaries implemented (`app/error.tsx`)
- [ ] Database tables auto-created on first access
- [ ] Migration script available (`npm run db:migrate`)

---

## Deployment Guides

| Platform | Guide | Notes |
|----------|-------|-------|
| Railway (Simple) | [`RAILWAY_SIMPLE_SETUP.md`](./RAILWAY_SIMPLE_SETUP.md) | Recommended — built-in GitHub integration |
| Railway (Advanced) | [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md) | GitHub Actions + CLI secrets |
| Coolify | [`COOLIFY_DEPLOYMENT.md`](./COOLIFY_DEPLOYMENT.md) | Self-hosted Docker deployment |

---

## Post-Deployment Checklist

### Functional Testing (Production)
- [ ] Register new user account
- [ ] Login with registered account
- [ ] Create todo with all features (priority, due date, recurring, reminder, tags, subtasks)
- [ ] Create and complete a recurring todo (verify next instance created)
- [ ] Set reminder and receive browser notification
- [ ] Add and manage subtasks
- [ ] Create and assign tags
- [ ] Save and use a template
- [ ] Search and filter todos
- [ ] Export as JSON and CSV
- [ ] Import exported JSON file
- [ ] View calendar with holidays
- [ ] Logout and login again (session persistence)

### Performance Testing (Production)
- [ ] Run Lighthouse audit (target score > 80)
- [ ] Test with 100+ todos loaded
- [ ] Verify API response times are acceptable

### Security Testing (Production)
- [ ] HTTPS is enforced
- [ ] WebAuthn works on production domain
- [ ] Cookies are HTTP-only and Secure
- [ ] Protected routes reject unauthenticated access

---

## Evaluation Scoring

### Feature Completeness (0–110 points)
- Each core feature: 10 points (11 features × 10 = 110 points)
- Partial implementation: 5 points
- Not started: 0 points

**Total Feature Score:** _____ / 110

### Testing Coverage (0–30 points)
- E2E tests: 15 points
- Unit tests: 10 points
- Manual testing: 5 points

**Total Testing Score:** _____ / 30

### Deployment (0–30 points)
- Successful deployment: 15 points
- Environment configuration: 5 points
- Production testing: 5 points
- Documentation: 5 points

**Total Deployment Score:** _____ / 30

### Quality & Performance (0–30 points)
- Code quality: 10 points
- Performance: 10 points
- Accessibility: 5 points
- Security: 5 points

**Total Quality Score:** _____ / 30

---

## Final Score

**Total Score:** _____ / 200

### Rating Scale:
| Score Range | Rating | Description |
|-------------|--------|-------------|
| 180–200 | Excellent | Production ready, exceeds expectations |
| 160–179 | Very Good | Production ready, meets all requirements |
| 140–159 | Good | Mostly complete, minor issues |
| 120–139 | Adequate | Core features work, needs improvement |
| 100–119 | Incomplete | Missing critical features |
| < 100 | Not Ready | Significant work needed |

---

**Evaluation Date:** _____________
**Evaluator:** _____________
**Notes:**
