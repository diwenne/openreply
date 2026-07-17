# ManyChat Alternative Production Deployment

This app is designed as two deployable services:

- **Web/API**: Next.js on Vercel.
- **Worker**: a persistent Railway service running `npm run worker`.

Postgres and Redis should be provisioned on Railway or another managed provider and shared by both services.

## Required Environment Variables

Copy `.env.example` and set every value in Vercel and Railway:

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `META_GRAPH_API_VERSION`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `FACEBOOK_APP_SECRET`
- `WEBHOOK_VERIFY_TOKEN`

`ENCRYPTION_KEY` must be 64 hex characters. Generate one with:

```bash
openssl rand -hex 32
```

## Database

Run migrations before starting production traffic:

```bash
npm ci
npm run db:generate
npm run db:migrate
```

## Vercel Web/API

1. Create a Vercel project from this repository.
2. Add all environment variables.
3. Set the production domain as `NEXTAUTH_URL`.
4. Deploy.
5. Vercel Cron will call `/api/cron/refresh-tokens` daily using `vercel.json`.

## Railway Worker

Create a second Railway service from the same repository.

Start command:

```bash
npm run worker
```

Use the same `DATABASE_URL`, `REDIS_URL`, Meta, and encryption environment variables as the Vercel app.

## Meta

Configure the webhook callback URL:

```text
https://your-domain.com/api/webhook
```

Use `WEBHOOK_VERIFY_TOKEN` as the verify token. Public customer launch requires Meta App Review for Instagram messaging/comment permissions.
