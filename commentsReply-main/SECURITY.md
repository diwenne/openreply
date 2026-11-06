# Security policy

OpenReply handles Instagram access tokens, webhook payloads, and campaign data. Please report security issues responsibly.

## Supported versions

The active branch is `main`. Security fixes target `main` unless a maintainer asks otherwise.

## Reporting a vulnerability

Do not open a public GitHub issue for a vulnerability. Send a private report to the repository owner through GitHub, or email the address on the maintainer's GitHub profile.

Include a description, steps to reproduce, the impact, whether tokens or user data may be exposed, and a suggested fix if you have one.

## Sensitive areas

The parts most worth scrutiny:

- Instagram OAuth state verification
- Encrypted Instagram access tokens
- Meta webhook signature verification
- Workspace isolation
- Public report pages
- Tracked link redirects
- Worker retry and dedupe behavior
- Environment variable handling

## Secrets

Never commit any of these, and rotate one if it is exposed anywhere it could be logged:

- `DATABASE_URL`, `REDIS_URL`
- `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`
- Live webhook payloads that contain user data

## Disclosure

Valid reports get acknowledged quickly, and fixes are prioritized by severity.
