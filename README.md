# manychat_alternative

A self-hosted ManyChat alternative for Instagram comment-to-DM automation.

Someone comments a keyword like `LINK`, `PRICE`, or `GUIDE` on your post or reel, and they get a DM automatically. Turns comments into Meta-compliant private replies.

Completely free. No subscriptions, no checkout, no usage caps. Campaigns, DMs, and connected Instagram accounts are unlimited.

[Templates](app/templates) | [Deployment](DEPLOYMENT.md) | [Production readiness](docs/production-readiness.md) | [Security](SECURITY.md)

## Why This Exists

Instagram comment-to-DM is one of the clearest social-commerce loops:

```text
Customer comments "LINK" on a post or reel
Meta sends a webhook
The app matches the keyword
The worker sends a private reply using the comment ID
The business gets a warm conversation
```

Most tools in this market are broad chatbot platforms. This one is intentionally narrower: a focused campaign tool for Instagram comment-triggered DMs.

## Current Product

- Email magic-link signup with workspace tenancy.
- Instagram professional account connection as an integration.
- Keyword campaigns for posts and reels.
- Meta webhook verification and event storage.
- BullMQ worker for private reply delivery.
- Idempotent DM logs per campaign/comment.
- Redis-backed hourly DM rate limiting, set to Meta's documented cap of 750 private replies/hour per account.
- Monthly DM usage counting for the dashboard, with no cap enforced.
- Vercel cron for token refresh and usage maintenance.
- Health checks and authenticated production diagnostics.
- Public Privacy, Terms, Data Deletion, and Meta App Review support pages.
- Public campaign template library.
- Tracked redirect links with click, CTR, and keyword analytics.
- Shareable read-only client report pages.
- Agency-ready multi-account workspaces with member roles and invite links.
- Production deployment docs for Vercel, Railway, Postgres, and Redis.

## Demo

The landing page is available locally at:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Self-Host Quick Start

### Requirements

- Node.js 20+
- PostgreSQL
- Redis
- Meta Developer App
- Instagram Business or Creator account
- Resend account for magic-link email (free tier)

### Install

```bash
git clone https://github.com/diwenne/manychat_alternative.git
cd manychat_alternative
npm install
```

### Start Services

```bash
docker-compose up -d
```

### Configure Environment

```bash
cp .env.example .env
```

Fill in all required values:

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

Generate `ENCRYPTION_KEY` with:

```bash
openssl rand -hex 32
```

### Database

```bash
npm run db:generate
npm run db:migrate
```

### Run Web And Worker

```bash
npm run dev
npm run worker
```

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Meta App Setup

The Meta side is the only part that can't be skipped:

1. Create a Meta Developer App and add the Instagram product.
2. Point the webhook at `https://your-domain.com/api/webhook` using your `WEBHOOK_VERIFY_TOKEN`, and subscribe to the `comments` field.
3. Connect an Instagram Business or Creator account in Settings.

While the app is in development mode it works against your own account and any accounts added as testers. App Review is only needed to send DMs on behalf of other people's accounts.

## Development Checks

Every pull request should pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
