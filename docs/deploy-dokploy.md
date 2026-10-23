# Self-Hosting on Dokploy

This guide covers deploying OpenReply on your own server using [Dokploy](https://dokploy.com), as an alternative to the Vercel + Railway setup covered in `docs/setup.md`. Running everything on your own Dokploy instance means no per-seat hosting fees and no usage caps — but there are a few gotchas specific to this setup worth knowing up front.

## Overview

OpenReply needs four services running:
- **Web app** — the Next.js dashboard, OAuth callback, and webhook receiver
- **Worker** — a long-running Node process that sends the DMs (cannot run as a serverless function)
- **Postgres**
- **Redis**

On Dokploy, these become: one Postgres database service, one Redis database service, and **two separate Applications** pointing at the same repo (one for the web app, one for the worker), each with different start commands.

Since everything runs on the same Dokploy server, you don't need the "public vs internal database URL" split that the Vercel/Railway guide requires — both apps can just use Dokploy's internal service hostnames directly.

## Gotcha #1 — Node version

The app needs Node **24.22.1 or newer** (`engines.node` in `package.json`). Older runtimes are exposed to CVE-2026-111497, a remote code execution bug in Node's Brotli decoder that the built-in `fetch` reaches by default. Node 20 is end-of-life and will not get the fix, and on the 22 line only 22.23.4+ has it.

Nixpacks (Dokploy's default build system) reads the major version from `engines.node` and resolves it from whatever Nix package snapshot it ships, which typically lags security releases by weeks. The snapshot this guide used to recommend (`51ad838b…`, Node 22.13.1) is vulnerable, and it has no `nodejs_24` at all, so with `engines.node` on 24 the build fails with `undefined variable 'nodejs_24'`.

**Fix:** add a `nixpacks.toml` to the repo root that pins a Nix package snapshot whose `nodejs_24` is **24.22.1 or newer** (check the version at [search.nixos.org](https://search.nixos.org/packages?query=nodejs_24) before picking the commit):

```toml
[phases.setup]
nixpkgsArchive = "<nixpkgs commit with nodejs_24 >= 24.22.1>"
```

`NIXPACKS_NODE_VERSION` is no longer needed — remove it if an earlier setup set it.

Alternatively, set the **Build Type** of both apps to **Dockerfile**: the repo's `Dockerfile` pins `node:24.22.1-slim`, so the runtime no longer depends on the Nix snapshot. The Nixpacks build/start variables from Gotcha #2 do not apply to that build type, so the start commands (`prisma migrate deploy` for the web app, `npm run worker` for the worker) have to be set as the container command instead.

## Gotcha #2 — No dedicated "Build Command" field

Unlike Vercel/Railway, Dokploy's Nixpacks builder reads `package.json` scripts automatically and has no separate Build Command / Start Command UI field. To override the detected commands, set these as **environment variables** instead:

**Web app:**
```
NIXPACKS_BUILD_CMD=npx prisma generate && next build
NIXPACKS_START_CMD=npx prisma migrate deploy && npm start
```

**Worker app:**
```
NIXPACKS_BUILD_CMD=npm run db:generate
NIXPACKS_START_CMD=npm run worker
```

## Gotcha #3 — Migrations must run at start, not build

This is the one most likely to trip people up: **`prisma migrate deploy` cannot run during the Docker build step.** Docker builds run in an isolated environment with no access to Dokploy's internal service network, so the database isn't reachable yet — you'll see:

```
Error: P1001: Can't reach database server at `<db-service-name>:5432`
```

if you try to run migrations as part of the build (e.g. via the `vercel-build` script, which bundles `prisma generate && prisma migrate deploy && next build` together). The fix is the build/start command split shown above — `prisma generate` and `next build` happen at build time (no DB needed), while `prisma migrate deploy` runs in the start command, once the container is actually live and on the network.

## Gotcha #4 — Nothing runs the cron jobs

The three jobs under `/api/cron` are scheduled by the `crons` block in
`vercel.json`. Nothing outside Vercel reads that file, so on a self-hosted
instance they simply never run — and none of them fails loudly:

- **`refresh-tokens`** is the one that hurts. The Instagram token expires and
  every automation stops, with no error anywhere: comments keep arriving and
  nothing answers them.
- **`attach-next-reel`** binds a campaign created ahead of time to the reel
  published after it. Without it, a "next reel" campaign stays inert forever.
- **`snapshot-followers`** keeps the follower history, which Instagram only
  retains for ~30 days.

**Fix:** run `scripts/cron.sh` as a fourth service, from the same image as the
web app — the same pattern as the worker, so the jobs live and die with the app
they belong to:

```yaml
  cron:
    image: <same image as web>
    restart: unless-stopped
    command: ["sh", "scripts/cron.sh"]
    environment:
      CRON_BASE_URL: http://web:3000
      CRON_SECRET: ${CRON_SECRET}
    depends_on:
      web:
        condition: service_healthy
```

`condition: service_healthy` matters: started alone, the first run fires while
the web app is still booting and dies on connection refused.

The script calls `attach-next-reel` every five minutes and the other two once a
day. Five minutes is deliberate — on Vercel this runs daily, which means a
campaign prepared before publishing stays inactive for the whole first evening,
when most of the comments arrive.

## Step-by-step

1. Fork this repo.
2. In Dokploy: **Create → Database → PostgreSQL** and **Create → Database → Redis**. Note their internal service hostnames.
3. In Dokploy: **Create → Application**, connect your fork, `main` branch. This is the web app.
4. Add the `nixpacks.toml` file (Gotcha #1) to your fork's root, and set the environment variables from Gotcha #2 (web app version) plus the standard variables from `.env.example` — pointing `DATABASE_URL` and `REDIS_URL` at the internal hostnames from step 2.
5. Assign a domain to the web app only (not the worker) in Dokploy's Domains section, container port `3000`. This becomes your `NEXTAUTH_URL`.
6. Repeat step 3 for a second Application — this is the worker. Use the worker's build/start commands from Gotcha #2, and the same full set of environment variables as the web app, especially `DATABASE_URL`, `REDIS_URL`, and `ENCRYPTION_KEY` (these three must match exactly between both apps, or DM sends will fail to decrypt).
7. Deploy both apps.
8. Add the cron service from Gotcha #4, so the scheduled jobs actually run.
9. Check `https://your-domain/api/health` — confirms database, Redis, queue, and worker heartbeat are all healthy.

From here, the Meta app setup, OAuth redirect, and webhook configuration are identical to the standard setup in `docs/setup.md`.
