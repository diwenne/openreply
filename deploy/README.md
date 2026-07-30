# YOYAKU production deployment

OpenReply runs as four isolated services on `yoyaku-automation`:

- Next.js web/API on host loopback port `3048`
- long-running BullMQ worker
- dedicated PostgreSQL 16
- dedicated Redis 7

The public edge is `https://openreply.yoyaku.fr` through nginx. PostgreSQL and
Redis have no host ports. Persistent data and backups live under
`/mnt/data/openreply`.

## Deploy

1. Clone this fork into `/opt/openreply`.
2. Copy `deploy/openreply.env.example` to `.env`, replace every placeholder,
   and set mode `0600`.
3. Create `/mnt/data/openreply/{postgres,redis,backups}` with ownership suitable
   for the official container images.
4. Run:

   ```bash
   docker compose -f compose.production.yml config --quiet
   docker compose -f compose.production.yml build
   docker compose -f compose.production.yml up -d
   ```

5. Install the nginx vhost and systemd units from `deploy/`.
6. Confirm `/api/health` returns `status: ok` and `worker.healthy: true`.

The populated `.env` must never enter Git. `ENCRYPTION_KEY` is irreplaceable:
losing it forces every Instagram account to reconnect.
