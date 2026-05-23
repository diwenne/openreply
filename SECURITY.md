# Security Policy

CampaignCue handles Instagram account tokens, webhook payloads, billing events, and customer campaign data. Please report security issues responsibly.

## Supported Versions

The active public branch is `main`.

Security fixes should target `main` unless a maintainer asks otherwise.

## Reporting A Vulnerability

Please do not open a public GitHub issue for a vulnerability.

Send a private report to the repository owner through GitHub, or email the maintainer address listed on the GitHub profile.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Impact.
- Whether credentials, tokens, customer data, or billing data may be exposed.
- Suggested fix, if known.

## Sensitive Areas

Pay special attention to:

- Instagram OAuth state verification.
- Encrypted Instagram access tokens.
- Meta webhook signature verification.
- Stripe webhook signature verification.
- Workspace isolation.
- Public report pages.
- Tracked link redirects.
- Worker retry and dedupe behavior.
- Environment variable handling.

## Dependency Audit Exceptions

Production dependency audit status is tracked in [docs/production-readiness.md](docs/production-readiness.md).

As of May 24, 2026, the known audit exceptions are a `postcss` advisory pulled through the current stable `next@16.2.6` release and a Prisma CLI tooling advisory through `@hono/node-server`. CampaignCue does not process customer-authored CSS, and Prisma development tooling should not run on public infrastructure. Maintainers should upgrade Next.js and Prisma as soon as patched stable releases are available.

## Secrets

Never commit:

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `INSTAGRAM_APP_SECRET`
- `FACEBOOK_APP_SECRET`
- Live webhook payloads that contain user data

## Disclosure

We aim to acknowledge valid reports quickly and prioritize fixes based on severity and exploitability.
