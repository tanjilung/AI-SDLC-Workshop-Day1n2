# ToDo App — Complete Setup Guide

A full-stack **Next.js 16** ToDo application with WebAuthn/Passkey authentication, PostgreSQL persistence, calendar views, recurring tasks, subtasks, tags, templates, notifications, export/import (JSON + CSV), and Singapore holidays support.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Run the Application](#run-the-application)
5. [Verify Core Features](#verify-core-features)
6. [Testing](#testing)
7. [Deployment](#deployment)
8. [Project Structure](#project-structure)
9. [Troubleshooting](#troubleshooting)
10. [Additional Resources](#additional-resources)

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 22.13.0+ | As specified in `package.json` engines |
| npm | 10.x+ | Bundled with Node.js 22 |
| PostgreSQL | 15+ | Local or remote database instance |
| Git | Latest | For cloning the repository |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/tanjilung/AI-SDLC-Workshop-Day1n2.git
cd AI-SDLC-Workshop-Day1n2

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your settings (see below)

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**.

---

## Environment Configuration

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgres://user:pass@localhost:5432/todos` |
| `JWT_SECRET` | Yes | Secret for signing session cookies (32+ chars) | `openssl rand -hex 32` |
| `RP_ID` | Yes | WebAuthn relying party ID (domain) | `localhost` (dev), `your-domain.com` (prod) |
| `RP_NAME` | No | Display name for passkey prompts | `Todo App` |
| `RP_ORIGIN` | Yes | Full origin URL for WebAuthn | `http://localhost:3000` (dev), `https://your-domain.com` (prod) |
| `COOKIE_SECURE` | No | Set `"true"` only with valid HTTPS; `"false"` for HTTP/local dev | `false` |
| `DEBUG_WEBAUTHN` | No | Enable verbose WebAuthn debug logging (set to any truthy value) | `true` |

Generate a secure `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Run the Application

### Development Mode
```bash
npm run dev
```

Expected output:
```
  ▲ Next.js 16.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local
```

### First-Time Setup
1. **Register a new account** at `http://localhost:3000/login`
   - Enter a username
   - Complete the WebAuthn/Passkey registration prompt (fingerprint, Face ID, PIN, or security key)
2. **Create your first todo** from the main page
3. Tables are auto-created on first access — no manual setup required

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Playwright E2E tests |
| `npm run test:ui` | Run Playwright in interactive UI mode |
| `npm run test:unit` | Run unit tests |
| `npm run test:report` | View HTML test report |
| `npm run db:migrate` | Run database migrations |
| `npm run seed:holidays` | Seed Singapore holidays |

---

## Verify Core Features

### Authentication
- Register with a username → WebAuthn prompt appears → Complete registration
- Logout and login again → Session persists after page reload

### Todo CRUD
- Create, edit, complete, and delete todos
- Set priority (High/Medium/Low) and due dates

### Recurring Todos
- Mark a todo as recurring with daily/weekly/monthly/yearly patterns
- Completing a recurring todo automatically creates the next instance

### Subtasks & Progress
- Expand any todo to add subtasks
- Watch the progress bar update in real-time as you complete subtasks

### Tags
- Open "Manage Tags" → Create colored tags → Assign to todos → Filter by tag

### Templates
- Save a configured todo as a template → Later create new todos instantly from it

### Calendar View
- Navigate to `/calendar` → See monthly view with todos and Singapore holidays

### Export/Import
- Export todos as JSON or CSV → Import JSON files back to restore data

---

## Testing

```bash
# Run all E2E tests (Playwright)
npm test

# Run unit tests
npm run test:unit

# Interactive test UI
npm run test:ui

# View test report
npm run test:report
```

**Note:** E2E tests use virtual WebAuthn authenticators configured in `playwright.config.ts`. Ensure browsers are installed:
```bash
npx playwright install
```

---

## Deployment

This app supports multiple deployment platforms. See the dedicated guides:

| Platform | Guide | Notes |
|----------|-------|-------|
| Railway (Simple) | [`RAILWAY_SIMPLE_SETUP.md`](./RAILWAY_SIMPLE_SETUP.md) | Recommended — built-in GitHub integration |
| Railway (Advanced) | [`RAILWAY_DEPLOYMENT.md`](./RAILWAY_DEPLOYMENT.md) | GitHub Actions + CLI secrets |
| Coolify | [`COOLIFY_DEPLOYMENT.md`](./COOLIFY_DEPLOYMENT.md) | Self-hosted deployment with Docker |

### Pre-Deployment Checklist
```bash
npm run build       # Ensure production build succeeds
npm run lint        # No linting errors
npm test            # All tests passing
```

---

## Project Structure

```
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Main todo list page
│   ├── error.tsx               # Error boundary
│   ├── globals.css             # Global styles (Tailwind)
│   ├── login/page.tsx          # WebAuthn login/register
│   ├── calendar/page.tsx       # Calendar view
│   └── api/                    # 20 API route files
├── lib/                        # 20 business logic modules + 2 hooks
│   ├── db.ts                   # Database layer (~1250 lines)
│   ├── db-schema.ts            # Drizzle ORM schema (9 tables)
│   ├── todo-types.ts           # Shared TypeScript types
│   ├── auth*.ts                # Authentication modules (4 files)
│   └── *-core.ts               # Feature logic modules
├── tests/                      # Test suite
│   ├── *.spec.ts               # 12 Playwright E2E specs
│   ├── unit/*.test.ts          # 15 unit test files
│   ├── helpers.ts              # Shared test helpers
│   └── global-setup.ts         # Virtual authenticator setup
├── PRPs/                       # 11 Product Requirement Profiles
├── scripts/                    # CLI utilities
│   ├── migrate.ts              # Database migration script
│   └── seed-holidays.ts        # Holiday seeder
├── .env.example                # Environment variable template
├── nixpacks.toml               # Railway/Nixpacks build config
├── playwright.config.ts        # Playwright configuration
├── package.json                # Dependencies + scripts
└── tsconfig.json               # TypeScript configuration
```

---

## Troubleshooting

### Port 3000 Already in Use

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**macOS/Linux:**
```bash
lsof -ti:3000 | xargs kill -9
```

Or use a different port:
```bash
npm run dev -- -p 3001
```

### npm install Fails
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Issues
- Verify `DATABASE_URL` is set in `.env.local`
- Ensure PostgreSQL is running and accessible
- Tables are auto-created on first access — no manual DDL needed

### WebAuthn Not Working in Browser
1. Use a supported browser: Chrome, Edge, Firefox, or Safari
2. Must use HTTPS or `localhost` (WebAuthn requirement)
3. Check WebAuthn support at https://webauthn.io
4. For local dev, ensure `RP_ID=localhost` and `RP_ORIGIN=http://localhost:3000`

### Tests Fail to Run
```bash
# Install Playwright browsers
npx playwright install

# Run a specific test to debug
npx playwright test tests/smoke.spec.ts --headed
```

---

## Additional Resources

- **User Guide**: [`USER_GUIDE.md`](./USER_GUIDE.md) — Comprehensive feature documentation
- **Codebase Analysis**: [`CODEBASE_ANALYSIS.md`](./CODEBASE_ANALYSIS.md) — Architecture deep dive
- **Evaluation Checklist**: [`EVALUATION.md`](./EVALUATION.md) — Feature completeness tracker
- **Claude Instructions**: [`CLAUDE.md`](./CLAUDE.md) — Development conventions for AI assistants
- **Product Requirements**: [`PRPs/`](./PRPs/) — 11 detailed PRPs covering all features
- **Next.js Docs**: https://nextjs.org/docs
- **Playwright Docs**: https://playwright.dev/
- **WebAuthn Guide**: https://webauthn.guide/

---

## Success Criteria

Your setup is complete when:

- ✅ `npm run dev` starts without errors
- ✅ App loads at http://localhost:3000
- ✅ You can register/login with WebAuthn
- ✅ You can create, edit, and delete todos
- ✅ Tests pass (`npm test` and `npm run test:unit`)

---

**App Version**: 0.1.0 | **Node.js**: ≥22.13.0 | **Database**: PostgreSQL
