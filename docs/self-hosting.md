# Self-hosting

This covers the environment and the production layout. For the Meta side, read [instagram-setup.md](instagram-setup.md), which is the harder half.

## Architecture

OpenReply is two processes and two datastores.

- Web app and API: Next.js. Handles the dashboard, the OAuth callback, and the incoming webhook. Runs well on Vercel.
- Worker: a long-running Node process (`npm run worker`) that consumes the send queue. It cannot run on Vercel, because serverless functions are short-lived and a queue consumer has to stay up. Railway, Render, Fly, or any box that runs a process works.
- PostgreSQL: campaigns, logs, accounts, sessions.
- Redis: the BullMQ send queue and the per-account rate limiter.

The web app and the worker must share the same `DATABASE_URL`, the same `REDIS_URL`, and the same `ENCRYPTION_KEY`. The web app writes an encrypted Instagram token; the worker decrypts it to send. Different keys mean every send fails to decrypt.

## Environment variables

Copy `.env.example` to `.env` and fill these in.

| Variable | What it is |
| --- | --- |
| `NEXTAUTH_URL` | Your public URL. Locally, your tunnel URL. |
| `NEXTAUTH_SECRET` | Random secret. `openssl rand -base64 32` |
| `CRON_SECRET` | Random secret protecting the token-refresh cron. |
| `ENCRYPTION_KEY` | 32-byte hex. `openssl rand -hex 32`. Encrypts Instagram tokens. Identical across web and worker. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string. Must support blocking commands, so an HTTP-only Redis will not work with BullMQ. |
| `RESEND_API_KEY` | Resend key. Login is email magic links only, so without this nobody can sign in. |
| `EMAIL_FROM` | A sender on a domain you verified in Resend. The placeholder will not deliver. |
| `META_GRAPH_API_VERSION` | Graph API version, for example `v25.0`. |
| `INSTAGRAM_APP_ID` | From the Meta app, see the Instagram setup guide. |
| `INSTAGRAM_APP_SECRET` | From the Meta app. |
| `FACEBOOK_APP_SECRET` | From the Meta app. |
| `WEBHOOK_VERIFY_TOKEN` | Any random string. You paste the same value into Meta's webhook config. |

`ENCRYPTION_KEY` must be exactly 64 hex characters or the app throws on boot.

## Local development

You need Postgres and Redis. The included `docker-compose.yml` starts both:

```bash
docker-compose up -d
npm run db:generate
npm run db:migrate
```

Or install them natively (macOS):

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
createdb openreply
```

Then set `DATABASE_URL` to match your local user, for example `postgresql://YOUR_USER@localhost:5432/openreply`.

Run the two processes in separate terminals:

```bash
npm run dev
npm run worker
```

For Meta to reach your local webhook, run a tunnel and point `NEXTAUTH_URL` and the Meta webhook and redirect URLs at the tunnel:

```bash
ngrok http 3000
```

## Production

The setup below uses Railway for Postgres, Redis, and the worker, and Vercel for the web app. Do Railway first, because Vercel needs the database URLs.

### Step 1: Railway (Postgres, Redis, worker)

1. Create a Railway account and a **New Project**.
2. In the project, click **New**, then **Database**, then **Add PostgreSQL**.
3. Click **New**, then **Database**, then **Add Redis**.
4. Add the worker: click **New**, then **GitHub Repo**, and select your fork of this repo. Railway detects the Node app.
5. Open the new service's **Settings** and set the **Start Command** to:
   ```
   npm run worker
   ```
6. Open the worker service's **Variables** and add all the environment variables from the table above. For the worker, use Railway's **internal** database and Redis hostnames (they look like `postgres.railway.internal` and `redis.railway.internal`); inside Railway's network they are faster and free of egress. `NEXTAUTH_URL` is your Vercel domain. `ENCRYPTION_KEY` must be the exact same value you will use on Vercel.

**Getting the connection URLs.** Open the Postgres service, then its **Variables** or **Connect** tab. You will see two URLs:

| Variable | Host | Use it for |
| --- | --- | --- |
| `DATABASE_URL` | `postgres.railway.internal` | the Railway worker only |
| `DATABASE_PUBLIC_URL` | `*.proxy.rlwy.net` | Vercel, and running migrations from your machine |

Redis is the same: `REDIS_URL` (internal) for the worker, `REDIS_PUBLIC_URL` (public proxy) for Vercel.

Vercel runs outside Railway's private network, so if you give Vercel an internal `*.railway.internal` URL it will hang and time out. Always give Vercel the **public** URLs.

### Step 2: Migrate the production database

Run once from your machine, using the public Postgres URL:

```bash
DATABASE_URL="postgresql://...proxy.rlwy.net.../railway" npm run db:migrate
```

### Step 3: Vercel (web app)

1. Create a Vercel account and **Add New Project**, importing your fork. It auto-detects Next.js.
2. Under the project's **Settings**, then **Environment Variables**, add every variable from the table above. Use these values:
   - `NEXTAUTH_URL`: your Vercel domain (for example `https://your-app.vercel.app`).
   - `DATABASE_URL` and `REDIS_URL`: the **public** Railway URLs (`DATABASE_PUBLIC_URL` and `REDIS_PUBLIC_URL` from Railway).
   - `ENCRYPTION_KEY`: the exact same value as on the worker.
3. Deploy. The build runs `prisma generate` before `next build`, so the Prisma client is generated even though it is gitignored.
4. The daily token-refresh cron is wired up in `vercel.json`.

Note on crons: Vercel's free plan allows each cron to run at most once per day. The repo's crons are set to daily for that reason. If you want a more frequent schedule you need the Pro plan.

### Step 4: Point Meta at the Vercel domain

In the Meta app, set the OAuth redirect URI and the webhook callback URL to your Vercel domain (see [instagram-setup.md](instagram-setup.md)). If you later add a custom domain and make it primary, update `NEXTAUTH_URL` and the Meta webhook callback to the new domain, and update the worker's `NEXTAUTH_URL` too, or tracked links in DMs will point at the old domain.

## Checking it is healthy

Hit `/api/health`. It reports the database, Redis, queue, and worker heartbeat. If `worker.healthy` is false, the worker is not running or cannot reach Redis, and no DM will send even though webhooks are being received.

## Security notes

- `.env` is gitignored. Keep it that way.
- Rotate any secret that has been pasted anywhere it could be logged, including a chat with an AI assistant.
- Instagram tokens are encrypted at rest with `ENCRYPTION_KEY`. Losing or changing it means every connected account has to reconnect.
