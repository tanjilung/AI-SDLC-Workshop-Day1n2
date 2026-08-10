# Railway Deployment Guide (Advanced — GitHub Actions + CLI)

⚠️ **This guide covers advanced CI/CD deployment via GitHub Actions and Railway CLI secrets.**

**👉 For a simpler approach, see [RAILWAY_SIMPLE_SETUP.md](./RAILWAY_SIMPLE_SETUP.md) — Uses Railway's built-in GitHub integration (recommended for most projects).**

---

## Why This Guide Exists

If you need granular control over deployments (e.g., conditional deploys, custom build steps, or triggering deploys from alternative CI systems), the GitHub Actions + Railway CLI approach provides that flexibility. For standard setups, [RAILWAY_SIMPLE_SETUP.md](./RAILWAY_SIMPLE_SETUP.md) is easier and equally reliable.

## How It Works

1. A `railway.secrets.json` file (stored in `.github/workflows/`) defines the environment variables Railway needs
2. GitHub Secrets store your Railway API token (`RAILWAY_TOKEN`)
3. On push to your deployment branch, a GitHub Action runs `railway up --commit-data` which:
   - Authenticates using your Railway token
   - Applies secrets to your project
   - Triggers a redeployment

## Setup Steps

### 1. Get Railway Token

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click profile icon (top right) → **"Account Settings"**
3. Navigate to **"Tokens"** section
4. Click **"Create Token"** → give it a name (e.g., "GitHub CI/CD")
5. **Copy the token** — you'll need it for GitHub Secrets

### 2. Configure GitHub Secrets

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add:
   - **Name:** `RAILWAY_TOKEN`
   - **Value:** Your Railway token from step 1

### 3. Deploy

Push to your deployment branch:

```bash
git add .
git commit -m "Deploy to Railway"
git push origin main
```

The GitHub Action will:
- Install Node.js and dependencies
- Build the Next.js app
- Apply secrets via Railway CLI
- Trigger deployment

## Railway Configuration (`nixpacks.toml`)

The `nixpacks.toml` file in the project root configures how Railway builds your app:

```toml
providers = ["node"]

[env]
NIXPACKS_NODE_VERSION = "22.13.0"

[phases.setup]
nixPkgs = ["nodejs", "python3", "gcc", "gnumake", "pkg-config"]

[phases.install]
command = "npm ci --include=dev"

[phases.build]
command = "npm run build"
cacheDirectories = [".next/cache", "node_modules/.cache"]

[start]
cmd = "npm run db:migrate && npm run start"
```

This tells Nixpacks (Railway's build system):
- **`[env]`** — Sets Node.js 22.13.0 (matching `package.json` engines)
- **`phases.install`** — Uses `npm ci` for deterministic builds; includes devDependencies required for Next.js build
- **`phases.build`** — Builds the Next.js app with cached directories
- **`start`** — Runs database migrations (`scripts/migrate.ts`) before starting the server

## Database Configuration

Your app uses **PostgreSQL** via the `pg` driver + Drizzle ORM:

- **Connection:** Uses `DATABASE_URL` environment variable (set in Railway Dashboard → Variables)
- **SSL:** Disabled (`ssl: false`) for internal Docker connections between Railway services
- **ORM:** Drizzle ORM with raw SQL fallbacks for complex queries

### Required Environment Variables

Set these in **Railway Dashboard → Your Service → Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT session signing (32+ chars) | Generate with `openssl rand -hex 32` |
| `RP_ID` | WebAuthn relying party ID | `your-domain.railway.app` |
| `RP_NAME` | WebAuthn display name | `Todo App` |
| `RP_ORIGIN` | WebAuthn origin URL | `https://your-app.up.railway.app` |
| `DEBUG_WEBAUTHN` | Optional — verbose WebAuthn debug logging | `true` (dev only) |

### Adding PostgreSQL to Railway

1. In Railway Dashboard → your project → **"New"** → **"Database"** → **"Postgres"**
2. Railway auto-provisions it and sets `DATABASE_URL` in your environment
3. Your app will automatically use it — no code changes needed

## Troubleshooting

### Build Fails on Railway

1. Check Railway Dashboard → Deployments → click failed deployment → view logs
2. Ensure `package.json` has all production dependencies listed
3. Test locally: `npm run build` (should succeed before pushing)

### App Crashes After Deploy

1. Check runtime logs in Railway Dashboard
2. Verify `DATABASE_URL` is set in Railway Variables
3. Verify `JWT_SECRET` and other required secrets are present
4. Railway auto-sets `PORT` — do not override it manually

### Database Connection Fails

Your app connects to PostgreSQL via `lib/db.ts`:
- Uses `new Pool({ connectionString, ssl: false })` for internal Docker links
- SSL is **not needed** when connecting between Railway services on the same network
- If you use an external PostgreSQL (e.g., Supabase), change `ssl: false` → `ssl: { rejectUnauthorized: false }` in `lib/db.ts`

### "railway command not found" in CI

The GitHub Action installs Railway CLI automatically via npm. If it fails, check:
1. The workflow file has the correct npm install step for `@railway/cli`
2. Your network allows downloading from npmjs.com

## Architecture Overview

```
GitHub Push → GitHub Actions Workflow → Railway CLI (railway up --commit-data) → Railway Deploys App + PostgreSQL
```

Your app uses **PostgreSQL** for production. The `DATABASE_URL` env var configures the connection — ensure it is set before deploying.

## Links

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
