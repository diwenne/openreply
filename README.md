# CampaignCue

Open-source Instagram comment-to-DM campaign OS for businesses, creators, and agencies.

CampaignCue turns comments like `LINK`, `PRICE`, or `GUIDE` into Meta-compliant private replies. The core engine is MIT licensed and self-hostable. The hosted SaaS layer is being built for agencies that want campaign templates, analytics, client reports, and managed reliability.

[Templates](app/templates) | [Roadmap](ROADMAP.md) | [Deployment](DEPLOYMENT.md) | [Production readiness](docs/production-readiness.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) | [Open-core model](docs/open-core.md)

## Why This Exists

Instagram comment-to-DM is one of the clearest social-commerce loops:

```text
Customer comments "LINK" on a post or reel
Meta sends a webhook
CampaignCue matches the keyword
The worker sends a private reply using the comment ID
The business gets a warm conversation
```

Most tools in this market are broad chatbot platforms. CampaignCue is intentionally narrower: a focused campaign operating system for Instagram comment-triggered DMs.

## Current Product

- Email magic-link signup with workspace tenancy.
- Instagram professional account connection as an integration.
- Keyword campaigns for posts and reels.
- Meta webhook verification and event storage.
- BullMQ worker for private reply delivery.
- Idempotent DM logs per campaign/comment.
- Atomic monthly usage reservations and Redis-backed hourly DM reservations.
- Stripe Checkout, Customer Portal, and subscription webhooks.
- Plan limits for campaigns and monthly DMs.
- Vercel cron for token refresh and usage maintenance.
- Health checks and authenticated production diagnostics.
- Public Privacy, Terms, Data Deletion, and Meta App Review support pages.
- Public campaign template library.
- Tracked redirect links with click, CTR, and keyword analytics.
- Shareable read-only client report pages.
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

Screenshots and GIFs are planned in issue [#17](https://github.com/im-anishraj/instagram-comment-to-dm/issues/17). Good launch assets to add:

- Landing page hero screenshot.
- Dashboard overview screenshot.
- Campaign builder screenshot.
- Logs page screenshot.
- 30 second "comment LINK -> private reply" demo GIF using a Meta test account.

## Hosted SaaS

The hosted product will focus on agencies and campaign teams:

- Managed Vercel/Railway infrastructure.
- Public campaign templates.
- Tracked links and click analytics.
- Shareable client reports.
- Multi-account agency workspaces.
- Priority support and onboarding.

The core remains public so builders can self-host, audit, fork, and contribute.

## Self-Host Quick Start

### Requirements

- Node.js 20+
- PostgreSQL
- Redis
- Meta Developer App
- Instagram Business or Creator account
- Resend account for magic-link email
- Stripe account for subscriptions

### Install

```bash
git clone https://github.com/im-anishraj/instagram-comment-to-dm.git
cd instagram-comment-to-dm
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
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_AGENCY`
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

## Roadmap

The public launch roadmap is tracked in GitHub issues:

- [#7 Production readiness](https://github.com/im-anishraj/instagram-comment-to-dm/issues/7) - done
- [#8 Campaign OS repositioning](https://github.com/im-anishraj/instagram-comment-to-dm/issues/8) - done
- [#9 Public campaign templates](https://github.com/im-anishraj/instagram-comment-to-dm/issues/9) - done
- [#10 Tracked links and analytics](https://github.com/im-anishraj/instagram-comment-to-dm/issues/10) - done
- [#11 Shareable client reports](https://github.com/im-anishraj/instagram-comment-to-dm/issues/11) - done
- [#12 Agency multi-account support](https://github.com/im-anishraj/instagram-comment-to-dm/issues/12)
- [#13 Founding agency offer and referrals](https://github.com/im-anishraj/instagram-comment-to-dm/issues/13)
- [#14 SEO landing pages](https://github.com/im-anishraj/instagram-comment-to-dm/issues/14)

See [ROADMAP.md](ROADMAP.md) for the grouped plan.

## Good First Issues

Want to help? Start with the public issue list:

- [Good first issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Atype%3Agood-first-issue)
- [Documentation issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Atype%3Adocs)
- [Template issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Atemplates)

If you build a campaign template that works for your niche, open an issue or pull request.

## Development Checks

Every pull request should pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Community

- Use GitHub Issues for bugs, roadmap tasks, and feature requests.
- Use GitHub Discussions for launch ideas, self-hosting questions, and campaign templates.
- Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT. See [LICENSE](LICENSE).

The open-source core is MIT licensed. The hosted SaaS, managed infrastructure, support, and future agency features are monetized separately. See [docs/open-core.md](docs/open-core.md).
