# Jarvis-01 Deployment Guide

Complete guide for deploying the jarvis-01 monorepo from scratch.

---

## Architecture Overview

```
jarvis-01/                     # npm workspaces monorepo
├── apps/
│   ├── web/                   # Next.js 16 dashboard        → Vercel (sfo1)
│   └── pipeline/              # TypeScript workers + Express → Railway
│       └── gradescope-service/# Python sidecar (FastAPI)     → Railway (separate service)
├── packages/
│   └── db/                    # Shared Prisma schema, migrations, generated client
└── package.json               # Workspace root
```

| Service            | Platform | Runtime      | Region |
| ------------------ | -------- | ------------ | ------ |
| `apps/web`         | Vercel   | Node 20+     | sfo1   |
| `apps/pipeline`    | Railway  | Node 20+     | us-west |
| `gradescope-service` | Railway | Python 3.11 | us-west |
| Database           | Neon     | PostgreSQL   | us-west-2 |
| Cache / Queue      | Railway  | Redis (BullMQ) | us-west |

---

## 1. Prerequisites

- GitHub account with access to `sharanvamsi/jarvis-01`
- Vercel account linked to GitHub
- Railway account linked to GitHub
- Neon database already provisioned (shared between both apps)
- Google Cloud project with OAuth credentials (calendar scope)
- Node.js >= 20 locally

---

## 2. Push to GitHub

```bash
cd ~/jarvis-01
gh repo create jarvis-01 --private --source=. --push
```

Or manually:
1. Create `jarvis-01` repo at github.com/new (private)
2. ```bash
   cd ~/jarvis-01
   git remote add origin https://github.com/sharanvamsi/jarvis-01.git
   git push -u origin main
   ```

---

## 3. Deploy apps/web on Vercel

### 3A. Create or update the Vercel project

**Option A — New project (recommended for clean cut-over):**
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `jarvis-01` repo
3. Set **Root Directory** to `apps/web`
4. Framework preset: **Next.js** (auto-detected)
5. Click Deploy

**Option B — Update existing jarvis-web project:**
1. Go to Vercel dashboard → jarvis-web project → Settings → General
2. Change **Connected Git Repository** to `jarvis-01`
3. Change **Root Directory** from `.` to `apps/web`
4. Redeploy

### 3B. How the build works

The `apps/web/vercel.json` configures custom install and build commands that
handle the monorepo structure:

```
installCommand: cd ../.. && npm install
buildCommand:   cd ../.. && npm run db:generate && cd apps/web && npm run build
```

This means Vercel:
1. Sets cwd to `apps/web` (the root directory setting)
2. Runs install from the workspace root (hoists all deps)
3. Generates the Prisma client in `packages/db/generated/`
4. Builds the Next.js app

### 3C. Environment variables

Add these in Vercel dashboard → Settings → Environment Variables:

| Variable | Value | Environments |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled connection string (`postgresql://...?sslmode=require`) | Production, Preview |
| `DIRECT_URL` | Neon direct (non-pooled) connection string | Production, Preview |
| `NEXTAUTH_SECRET` | Random 32+ char secret (`openssl rand -base64 32`) | Production, Preview |
| `NEXTAUTH_URL` | `https://jarvis-web-bice.vercel.app` (or custom domain) | Production |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console | Production, Preview |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console | Production, Preview |
| `ENCRYPTION_KEY` | 64-character hex string (`openssl rand -hex 32`) | Production, Preview |
| `PIPELINE_INTERNAL_URL` | Railway pipeline URL (e.g., `https://jarvis-pipeline-production.up.railway.app`) | Production |
| `PIPELINE_SECRET` | Shared secret for web→pipeline API calls | Production, Preview |

### 3D. Domain setup (optional)

1. Vercel dashboard → Settings → Domains
2. Add your custom domain
3. Update `NEXTAUTH_URL` to match

### 3E. Function config

All API routes run with 1024 MB memory (configured in `vercel.json`).
Deployed to `sfo1` region for proximity to Neon (us-west-2).

---

## 4. Deploy apps/pipeline on Railway

### 4A. Create or update the Railway service

**Option A — New service:**
1. Go to [railway.app](https://railway.app) → your project
2. Add a new service → Deploy from GitHub repo
3. Select `jarvis-01`
4. Set **Root Directory** to `apps/pipeline`
5. Railway auto-detects `railway.toml` for build/deploy config

**Option B — Update existing service:**
1. Railway dashboard → jarvis-pipeline service → Settings
2. Change source repo to `jarvis-01`
3. Set **Root Directory** to `apps/pipeline`
4. Redeploy

### 4B. How the build works

The `apps/pipeline/railway.toml` configures the build:

```toml
[build]
builder = "nixpacks"
buildCommand = "cd ../.. && npm install && npm run db:generate && cd apps/pipeline && npm run build"

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

This means Railway:
1. Sets cwd to `apps/pipeline` (the root directory setting)
2. Navigates to workspace root, installs all deps, generates Prisma client
3. Runs `tsc` to compile TypeScript to `dist/`
4. Starts with `node dist/index.js`
5. Auto-restarts up to 3 times on crash

### 4C. Environment variables

Add these in Railway dashboard → service → Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon direct connection string (pipeline does NOT use the Neon serverless adapter) |
| `ENCRYPTION_KEY` | Same 64-char hex as web (shared, decrypts user tokens) |
| `REDIS_URL` | Railway Redis internal URL (e.g., `redis://default:...@redis.railway.internal:6379`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for course website LLM extraction |
| `GRADESCOPE_SERVICE_URL` | Internal URL to the gradescope-service (e.g., `http://gradescope-service.railway.internal:8001`) |
| `WEB_ORIGIN` | The web app URL (e.g., `https://jarvis-web-bice.vercel.app`) |
| `PIPELINE_SECRET` | Same shared secret as web |
| `PORT` | `3001` (Express server port) |

**Important:** The pipeline uses a standard `PrismaClient` (no Neon adapter), so
`DATABASE_URL` should be the **direct** Neon connection string, not the pooled one.

### 4D. Redis setup

If you don't already have Redis on Railway:
1. Railway dashboard → Add service → Redis
2. Copy the `REDIS_URL` from the Redis service variables
3. Paste into the pipeline service variables

BullMQ uses Redis for job queues (sync workers).

---

## 5. Deploy gradescope-service on Railway

This is a standalone Python FastAPI service that handles Gradescope scraping.

### 5A. Create the service

1. Railway dashboard → Add service → Deploy from GitHub repo
2. Select `jarvis-01`
3. Set **Root Directory** to `apps/pipeline/gradescope-service`
4. Railway auto-detects the Dockerfile

### 5B. The Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=8001
EXPOSE 8001
CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT}
```

### 5C. Environment variables

| Variable | Value |
| --- | --- |
| `PORT` | `8001` |

No other env vars needed — the pipeline passes credentials per-request.

### 5D. Internal networking

Railway services in the same project can communicate over the internal network.
The pipeline references this service at its internal Railway URL.

---

## 6. Database (Neon)

### Connection strings

Neon provides two connection strings:

| Type | Used by | Purpose |
| --- | --- | --- |
| **Pooled** (`-pooler` in hostname) | `apps/web` | Serverless-friendly, goes through Neon's connection pooler |
| **Direct** (no `-pooler`) | `apps/pipeline`, migrations | Standard PostgreSQL connection |

### Running migrations

Migrations live in `packages/db/prisma/migrations/` and are run from the
workspace root:

```bash
# Local development
cd ~/jarvis-01
npm run db:migrate:dev

# Production (deploy pending migrations)
cd ~/jarvis-01
DATABASE_URL="<direct-neon-url>" DIRECT_URL="<direct-neon-url>" \
  npm run db:migrate:deploy
```

Or run directly:
```bash
cd ~/jarvis-01/packages/db
DATABASE_URL="..." DIRECT_URL="..." npx prisma migrate deploy --schema=./prisma/schema.prisma
```

### Prisma Studio

```bash
cd ~/jarvis-01
npm run db:studio
# Opens at http://localhost:5555
```

---

## 7. Environment Variable Reference

### Shared (both apps)

| Variable | Description | How to generate |
| --- | --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string | Neon dashboard → Connection Details |
| `DIRECT_URL` | Neon direct (non-pooled) connection | Neon dashboard → Connection Details |
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting user tokens | `openssl rand -hex 32` |
| `PIPELINE_SECRET` | HMAC secret for web↔pipeline auth | `openssl rand -base64 32` |

### Web only

| Variable | Description | How to generate |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | NextAuth session encryption | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Canonical app URL | Your Vercel deployment URL |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 secret | Google Cloud Console → Credentials |
| `PIPELINE_INTERNAL_URL` | Pipeline service URL | Railway service public URL |

### Pipeline only

| Variable | Description | How to generate |
| --- | --- | --- |
| `REDIS_URL` | Redis connection for BullMQ | Railway Redis service |
| `ANTHROPIC_API_KEY` | Claude API key for LLM extraction | console.anthropic.com |
| `GRADESCOPE_SERVICE_URL` | Internal URL to gradescope sidecar | Railway internal networking |
| `WEB_ORIGIN` | Web app URL (CORS + callbacks) | Your Vercel deployment URL |
| `PORT` | Express listen port | `3001` |

---

## 8. Local Development

### First-time setup

```bash
cd ~/jarvis-01

# Install all workspace dependencies
npm install

# Generate Prisma client
npm run db:generate

# Copy env files
cp .env.example apps/web/.env
cp .env.example apps/pipeline/.env
# Then fill in real values in each .env file
```

### Running locally

```bash
# Terminal 1 — Web (http://localhost:3000)
npm run dev:web

# Terminal 2 — Pipeline (http://localhost:3001)
npm run dev:pipeline

# Terminal 3 — Prisma Studio (optional, http://localhost:5555)
npm run db:studio
```

### After schema changes

```bash
# Create a migration
npm run db:migrate:dev

# Regenerate the client (both apps pick it up automatically)
npm run db:generate
```

### Type checking

```bash
# Check all workspaces
npm run typecheck

# Or individually
cd apps/web && npx tsc --noEmit
cd apps/pipeline && npx tsc --noEmit
```

---

## 9. CI / CD Flow

### Vercel (web)

- **Trigger:** Push to `main` on GitHub
- **Build:** `cd ../.. && npm install` → `npm run db:generate` → `next build`
- **Deploy:** Automatic, zero-downtime

### Railway (pipeline)

- **Trigger:** Push to `main` on GitHub
- **Build:** `npm install` (workspace root) → `npm run db:generate` → `tsc`
- **Deploy:** Rolling restart with `on_failure` retry (max 3)

### Deployment order for schema changes

When a migration changes the database schema:

1. **Run `prisma migrate deploy`** against production Neon first
2. **Deploy pipeline** (it reads new columns/tables)
3. **Deploy web** (it reads new columns/tables)

Prisma migrations are additive by default (add columns, add tables), so both
apps continue working during the rollout. For destructive changes (drop column,
rename), coordinate carefully.

---

## 10. Monitoring and Health Checks

### Web

- Vercel dashboard → Deployments tab for build logs
- Vercel dashboard → Logs tab for runtime logs
- Check: `curl https://jarvis-web-bice.vercel.app` returns 200

### Pipeline

- Railway dashboard → Deployments tab for build logs
- Railway dashboard → Logs tab for runtime output
- Health endpoint: `curl https://<pipeline-url>/health`
- BullMQ dashboard: accessible via Railway logs (job completion/failure)

### Database

- Neon dashboard → Monitoring for query stats
- `npm run db:studio` for direct data inspection

---

## 11. Rollback Procedures

### Web (Vercel)

1. Vercel dashboard → Deployments
2. Find the last working deployment
3. Click the three-dot menu → **Promote to Production**

### Pipeline (Railway)

1. Railway dashboard → Deployments
2. Click **Rollback** on the last working deployment

### Database

Prisma migrations are forward-only. To undo a migration:
1. Write a new migration that reverses the changes
2. `npm run db:migrate:dev` locally to create it
3. Deploy the reversal migration to production

---

## 12. Troubleshooting

### "Cannot find module @jarvis/db"

The Prisma client hasn't been generated. Run:
```bash
npm run db:generate
```

### Vercel build fails with "Cannot resolve @jarvis/db"

Ensure `vercel.json` has the custom `installCommand` that runs from the
workspace root:
```json
"installCommand": "cd ../.. && npm install"
```

### Railway build fails with missing deps

Ensure `railway.toml` `buildCommand` starts from the workspace root:
```toml
buildCommand = "cd ../.. && npm install && npm run db:generate && cd apps/pipeline && npm run build"
```

### "Environment variable not found: DATABASE_URL"

Env vars must be set in the deployment platform (Vercel/Railway), not just
in local `.env` files. Double-check the platform dashboard.

### Pipeline can't connect to Redis

Verify `REDIS_URL` uses the Railway **internal** URL format:
`redis://default:<password>@redis.railway.internal:6379`

### Schema drift between environments

Always run migrations through `prisma migrate deploy`, never `prisma db push`,
in production. The migration history in `packages/db/prisma/migrations/` is
the source of truth.

### Type errors after schema change

After modifying `packages/db/prisma/schema.prisma`:
```bash
npm run db:migrate:dev    # create migration
npm run db:generate       # regenerate client
npm run typecheck         # verify both apps
```

---

## 13. Archiving Old Repos

After confirming production works on `jarvis-01`:

1. Wait at least 1 week with stable production
2. Go to github.com/sharanvamsi/jarvis-web → Settings → **Archive this repository**
3. Go to github.com/sharanvamsi/jarvis-pipeline → Settings → **Archive this repository**

Archived repos remain readable but cannot be pushed to. This prevents
accidental commits to the old repos.
