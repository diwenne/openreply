# Production Readiness

ManyChat Alternative is designed as an open-core product with a hosted SaaS path. This checklist is the launch gate for the hosted version.

## Runtime Health

- Web/API runs on Vercel.
- The persistent DM worker runs separately with `npm run worker`.
- `/api/health` checks database connectivity, Redis connectivity, BullMQ queue counts, and worker heartbeat age.
- The worker writes a Redis heartbeat every 30 seconds with a 120 second TTL.
- Worker failures are recorded in Redis alerts and `OperationalEvent` rows.
- Authenticated operators can view diagnostics at `/diagnostics`.

## Diagnostics

The diagnostics surface includes:

- Worker heartbeat and recent worker alerts.
- Queue counts for waiting, active, delayed, and failed jobs.
- Failed Meta webhook events.
- Failed or skipped DM logs.
- Token refresh failures from the cron job.
- Operational event timeline.

## Atomic Limits

- Monthly DM usage is reserved in a database transaction with a conditional `updateMany`.
- If a Meta private reply send fails, the monthly reservation is released for the same usage period.
- Hourly Instagram DM limits are reserved through one Redis Lua script so concurrent workers cannot all pass the rate limit before incrementing.
- Rate-limit requeues release monthly reservations before scheduling a delayed retry.

## Legal And Meta Review Pages

Public launch pages:

- `/privacy`
- `/terms`
- `/data-deletion`
- `/meta-review`

These pages are intentionally product-specific and should be reviewed by counsel before paid public launch.

## Audit Status

Run:

```bash
npm audit --omit=dev --audit-level=moderate
```

Known documented exceptions as of May 24, 2026:

- `next@16.2.6` currently resolves a transitive `postcss@8.4.31` advisory in the production dependency tree. The app does not accept customer-authored CSS, does not expose CSS stringification to user input, and should upgrade Next.js as soon as a stable patched version is available.
- `prisma@7.8.0` currently resolves `@prisma/dev` with `@hono/node-server<1.19.13` in the lockfile. This is Prisma CLI/build tooling, not the deployed web or worker runtime when production installs omit dev dependencies. Do not run Prisma's development server on public infrastructure; upgrade Prisma when a patched release is available.

Also monitor dev-only Prisma tooling advisories with:

```bash
npm audit --audit-level=moderate
```

Dev/build tooling advisories should still be tracked before public contributor campaigns.

## Staging Smoke Checklist

1. Deploy web/API to Vercel with production-like environment variables.
2. Deploy worker to Railway with the same `DATABASE_URL`, `REDIS_URL`, and secrets.
3. Run `npm run db:migrate` against staging Postgres.
4. Confirm `/api/health` returns `status: ok` after the worker starts.
5. Sign in by magic link and confirm a workspace is created.
6. Connect a Meta test Instagram professional account.
7. Create one keyword campaign for a test post or reel.
8. Send a signed Meta webhook test payload and confirm one BullMQ job is queued.
9. Comment the keyword from a test user and confirm one private reply is sent.
10. Confirm `/logs` shows one `SENT` log and `/diagnostics` has no new failures.
11. Trigger `/api/cron/refresh-tokens` with `Authorization: Bearer CRON_SECRET` and confirm token failures appear in diagnostics.
