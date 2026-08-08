# Railway Deployment Guide

⚠️ **This guide covers GitHub Actions deployment via CI/CD secrets, which is more advanced.**

**👉 For a much simpler approach, see [RAILWAY_SIMPLE_SETUP.md](./RAILWAY_SIMPLE_SETUP.md) - Uses Railway's built-in GitHub integration (recommended!)**

---

## Why This Guide Exists

If you need granular control over deployments (e.g., conditional deploys, custom build steps, or triggering deploys from other CI systems), the GitHub Actions + Railway Secrets approach gives you that flexibility. However, for most projects, [RAILWAY_SIMPLE_SETUP.md](./RAILWAY_SIMPLE_SETUP.md) is easier and equally reliable.

## How It Works

1. A `railway.secrets.json` file (in `.github/workflows/`) defines the environment variables Railway needs
2. GitHub Secrets store your Railway API token (`RAILWAY_TOKEN`)
3. On push to `main`/`solution`, a GitHub Action runs `railway up --commit-data` which:
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

Push to your deployment branch (`main` or `solution`):

```bash
git add .
git commit -m "Deploy to Railway"
git push origin solution
```

The GitHub Action will:
- ✅ Install Node.js and dependencies
- ✅ Build the Next.js app
- ✅ Apply secrets via Railway CLI
- ✅ Trigger deployment

## Railway Configuration (`nixpacks.toml`)

The `nixpacks.toml` file configures how Railway builds your app:

```toml
[phases.setup]
nixPkgs = ["...", "python3", "gcc", "gnumake"]

[phases.install]
command = "npm install --include=dev"

[phases.build]
command = "npm run build"
cacheDirectories = [".next/cache", "node_modules/.cache"]

[start]
cmd = "npm run db:migrate && next start"
```

This tells Nixpacks (Railway's build system):
- **`phases.install`** — installs all dependencies (including devDependencies for building)
- **`phases.build`** — builds the Next.js app with cached `.next` directory
- **`start`** — runs database migrations before starting the server

## Database Configuration

Your app is **already configured** for PostgreSQL via the `pg` library:

- **Connection:** Uses `DATABASE_URL` environment variable (set in Railway Dashboard → Variables)
- **SSL:** Disabled (`ssl: false`) for internal Docker connections between Railway services
- **ORM:** Drizzle ORM with `drizzle-orm/node-postgres`

### Required Environment Variables

Set these in **Railway Dashboard → Your Service → Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT signing | (generate with `openssl rand -hex 32`) |
| `RP_ID` | WebAuthn Realm ID | `your-domain.railway.app` |
| `RP_NAME` | WebAuthn Display Name | `Todo App` |
| `RP_ORIGIN` | WebAuthn Origin URL | `https://your-app.up.railway.app` |

### Adding PostgreSQL to Railway

1. In Railway Dashboard → your project → **"New"** → **"Database"** → **"Postgres"**
2. Railway auto-provisions it and sets `DATABASE_URL` in your environment
3. Your app will automatically use it — no code changes needed

## Troubleshooting

### Build fails on Railway

1. Check Railway Dashboard → Deployments → click failed deployment → view logs
2. Ensure `package.json` has all production dependencies
3. Test locally: `npm run build` (should succeed before pushing)

### App crashes after deploy

1. Check runtime logs in Railway Dashboard
2. Verify `DATABASE_URL` is set in Railway Variables
3. Verify `JWT_SECRET` and other required secrets are present
4. Railway auto-sets `PORT` — do not override it

### Database connection fails

Your app connects to PostgreSQL via `lib/db.ts`:
- Uses `new Pool({ connectionString, ssl: false })` for internal Docker links
- SSL is **not needed** when connecting between Railway services on the same network
- If you use an external PostgreSQL (e.g., Supabase), change `ssl: false` → `ssl: { rejectUnauthorized: false }`

### "railway command not found" in CI

The GitHub Action installs Railway CLI automatically via npm. If it fails, check:
1. The workflow file has the correct npm install step
2. Your network allows downloading from npmjs.com

## Architecture Overview

```
GitHub Push → GitHub Actions Workflow → Railway CLI (railway up --commit-data) → Railway Deploys App + PostgreSQL
```

Your app uses **PostgreSQL** (not SQLite) for production. SQLite (`DATABASE_PATH=./todos.db`) is only used locally during development. The `DATABASE_URL` env var takes precedence when set.

## Links

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
