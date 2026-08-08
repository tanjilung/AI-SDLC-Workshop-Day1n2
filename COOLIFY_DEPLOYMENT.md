# Deploying to Coolify

This guide walks you through deploying the Todo App to Coolify in a few minutes.

## Prerequisites

- A Coolify instance (self-hosted or Cloud)
- A PostgreSQL database (Coolify managed or external)
- The app code pushed to a Git repository (GitHub, GitLab, etc.)

## Step 1: Push Your Code

Ensure your code is pushed to a Git remote:

```bash
git add .
git commit -m "Update deployment configuration"
git push
```

## Step 2: Create a PostgreSQL Database

### Option A — Use Coolify's Managed PostgreSQL (Recommended)

1. Log in to your Coolify dashboard.
2. Go to **Resources** → **Create Resource** → **Database** → **Add PostgreSQL**.
3. Fill in the details:
   - **Name**: `todo-app-db`
   - **Root Password**: Generate or set a strong password
   - **Version**: 15 or 16
   - **Resources**: Leave defaults for small workloads
4. Click **Create** and wait until the database is running.
5. Click on the created database and copy:
   - **Connection URL** (format: `postgresql://user:password@host:port/dbname`)

### Option B — Use an External PostgreSQL

Any PostgreSQL 15+ instance works. Copy the connection URL from your provider.

## Step 3: Deploy the Application

1. In Coolify, go to **Resources** → **Create Resource** → **Add Git-based Project**.
2. Connect your Git repository (GitHub/GitLab/Bitbucket).
3. Select the repository and branch (`main`).
4. Configure deployment settings:

   | Setting | Value |
   |---|---|
   | **Build Pack** | `Nixpacks` or `Dockerfile` |
   | **Node.js Version** | `20` |
   | **Start Command** | (leave blank — uses Dockerfile CMD) |

5. Under **Environment Variables**, add the following:

   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://user:password@host:port/dbname
   JWT_SECRET=<generate-a-long-random-string>
   RP_ID=<your-domain.com>
   RP_NAME=Todo App
   RP_ORIGIN=https://<your-domain.com>
   DATABASE_PATH=./todos.db
   ```

   **Important notes:**
   - Replace `<your-domain.com>` with your actual domain/URL.
   - `JWT_SECRET` should be at least 32 characters — generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - If using Coolify's managed PostgreSQL, copy the `DATABASE_URL` from Step 2.

6. Click **Deploy** (or **Save & Deploy**).

## Step 4: Configure Domain (Optional but Recommended)

1. After deployment, go to your application settings in Coolify.
2. Under **Domains**, add your custom domain (e.g., `todo.yourdomain.com`).
3. Update environment variables:
   - `RP_ID` → your domain without protocol
   - `RP_ORIGIN` → `https://yourdomain.com`
4. Save — Coolify will auto-redeploy with the new values.
5. Configure DNS and SSL as directed by Coolify (usually automatic).

## Step 5: First-Time Setup

1. Visit your deployed URL in a browser.
2. Register an account using WebAuthn (passkeys) or username/password.
3. Your PostgreSQL database tables will be created automatically on first access.
4. Seed Singapore holidays:
   - Run the seed script via Coolify's **Console** / SSH, or:
   ```bash
   npm run seed:holidays
   ```

## Environment Variables Reference

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `DATABASE_PATH` | No | SQLite fallback path (local dev) | `./todos.db` |
| `JWT_SECRET` | Yes | Secret for session signing | 64-char hex string |
| `RP_ID` | Yes | WebAuthn Realm ID (domain) | `todo.yourdomain.com` |
| `RP_NAME` | No | Display name for WebAuthn | `Todo App` |
| `RP_ORIGIN` | Yes | Allowed origin for WebAuthn | `https://todo.yourdomain.com` |
| `NODE_ENV` | Yes | Environment mode | `production` |

## Troubleshooting

### Build Fails
- Ensure your Git branch is correctly selected in Coolify.
- Check the build logs for specific errors.
- Verify `package.json` dependencies are correct.

### Database Connection Error
- Confirm `DATABASE_URL` is set and accessible from Coolify.
- If using Coolify's managed PostgreSQL, ensure the database resource is running.
- Check that the connection URL uses `postgresql://` protocol (not `postgres://`).

### WebAuthn / Passkey Login Fails
- Ensure `RP_ID` matches your domain exactly (no `https://`).
- Ensure `RP_ORIGIN` includes the correct protocol (`https://`).
- WebAuthn only works over HTTPS — make sure your domain is properly configured.

### App Shows 502 Bad Gateway
- Wait a minute after deployment for the container to start.
- Check application logs in Coolify for startup errors.
- Verify `NODE_ENV=production` is set.

## Updating the App

1. Push new commits to your Git repository.
2. Coolify will automatically detect changes and trigger a redeployment.
3. Or manually trigger a redeploy from the Coolify dashboard.

## Database Migrations

This app uses Drizzle ORM with `CREATE TABLE IF NOT EXISTS` — tables are auto-created on first access. Additionally, a migration script is included to verify/initialize tables explicitly:

```bash
npm run db:migrate
```

### How it works

- **`lib/db.ts`** configures the PostgreSQL pool with `ssl: false` for internal Docker connections (required when connecting between Coolify services).
- **`nixpacks.toml`** runs `npm run db:migrate` before starting Next.js, ensuring tables exist on first deploy.

If you need to reset the database:
1. Delete the database in Coolify.
2. Create a new one and update `DATABASE_URL`.
3. Redeploy the app — migrations will recreate tables automatically.
