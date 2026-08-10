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
   | **Build Pack** | `Nixpacks` (recommended — uses project's `nixpacks.toml`) |
   | **Node.js Version** | `22` |

5. Under **Environment Variables**, add the following:

   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://user:password@host:port/dbname
   JWT_SECRET=<generate-a-long-random-string>
   RP_ID=<your-domain.com>
   RP_NAME=Todo App
   RP_ORIGIN=https://<your-domain.com>
   COOKIE_SECURE=true
   ```

   **Important notes:**
   - Replace `<your-domain.com>` with your actual domain/URL.
   - `JWT_SECRET` should be at least 32 characters — generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - If using Coolify's managed PostgreSQL, copy the `DATABASE_URL` from Step 2.
   - Set `COOKIE_SECURE=true` since Coolify deployments use HTTPS automatically.

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
2. Register an account using WebAuthn (passkeys/biometric).
3. Database tables are auto-created on first access.
4. Seed Singapore holidays:
   - Migrations run automatically during the build phase (via `nixpacks.toml` start command)
   - To seed holidays, run via Coolify's **Console** / SSH:
   ```bash
   npm run seed:holidays
   ```

## Environment Variables Reference

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Yes | Secret for session signing (32+ char hex) | 96-char hex string |
| `RP_ID` | Yes | WebAuthn relying party ID (domain without protocol) | `todo.yourdomain.com` |
| `RP_NAME` | No | Display name for WebAuthn prompts | `Todo App` |
| `RP_ORIGIN` | Yes | Full origin URL for WebAuthn (with protocol) | `https://todo.yourdomain.com` |
| `COOKIE_SECURE` | Yes (prod) | Set `"true"` only with valid HTTPS | `true` |
| `NODE_ENV` | Yes | Environment mode | `production` |
| `DEBUG_WEBAUTHN` | No | Enable verbose WebAuthn debug logging to stderr | `true` |

**Note:** `DEBUG_WEBAUTHN` is useful for troubleshooting registration/login failures. Set it to any truthy value (`true`, `1`) during debugging, then remove or unset it in production.

## Troubleshooting

### Build Fails
- Ensure your Git branch is correctly selected in Coolify.
- Check the build logs for specific errors.
- Verify `package.json` dependencies are correct.
- Test locally: `npm run build` should succeed before pushing.

### Database Connection Error
- Confirm `DATABASE_URL` is set and accessible from Coolify.
- If using Coolify's managed PostgreSQL, ensure the database resource is running.
- Check that the connection URL uses `postgresql://` protocol (not `postgres://`).
- The app connects with `ssl: false` which works for internal Docker networks.

### WebAuthn / Passkey Login Fails
- Ensure `RP_ID` matches your domain exactly (no `https://`, no path).
- Ensure `RP_ORIGIN` includes the correct protocol (`https://`).
- WebAuthn only works over HTTPS — make sure your domain has a valid certificate.
- For local testing, use `localhost` as RP_ID and `http://localhost:3000` as RP_ORIGIN.

### App Shows 502 Bad Gateway
- Wait a minute after deployment for the container to start.
- Check application logs in Coolify for startup errors.
- Verify `NODE_ENV=production` is set.

## Updating the App

1. Push new commits to your Git repository.
2. Coolify will automatically detect changes and trigger a redeployment.
3. Or manually trigger a redeploy from the Coolify dashboard.

## Database Migrations

This app uses Drizzle ORM with `CREATE TABLE IF NOT EXISTS` — tables are auto-created on first access. Additionally, the migration script runs automatically during deployment via `nixpacks.toml`:

```toml
[start]
cmd = "npm run db:migrate && npm run start"
```

### How it works

- **`lib/db.ts`** configures the PostgreSQL pool with `ssl: false` for internal Docker connections (required when connecting between Coolify services).
- **`nixpacks.toml`** runs `npm run db:migrate` before starting Next.js, ensuring tables exist on first deploy.

If you need to reset the database:
1. Delete the database in Coolify.
2. Create a new one and update `DATABASE_URL`.
3. Redeploy the app — migrations will recreate tables automatically.
