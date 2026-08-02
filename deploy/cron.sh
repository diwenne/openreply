#!/usr/bin/env bash
# Calls OpenReply's application cron endpoints. Upstream relies on Vercel's
# scheduler (vercel.json); self-hosted deployments must drive these routes
# themselves or Instagram tokens silently expire after 60 days, follower
# history never accumulates, and pending campaigns never bind to posts.
set -euo pipefail

readonly APP_DIR="/opt/openreply"
readonly BASE_URL="http://127.0.0.1:3048"

secret="$(grep -m1 '^CRON_SECRET=' "$APP_DIR/.env" | cut -d= -f2-)"
if [ -z "$secret" ]; then
  secret="$(grep -m1 '^NEXTAUTH_SECRET=' "$APP_DIR/.env" | cut -d= -f2-)"
fi
test -n "$secret"

# Unpredictable temp path (no symlink attacks in shared /tmp), cleaned on exit.
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

status=0
for route in refresh-tokens snapshot-followers attach-next-reel sync-releases; do
  # The auth header goes through curl's config-from-stdin so the secret never
  # appears in the process argv (visible to every local user via ps).
  code=$(curl -sS -o "$body_file" -w '%{http_code}' \
    --max-time 120 \
    --config <(printf 'header = "Authorization: Bearer %s"\n' "$secret") \
    "${BASE_URL}/api/cron/${route}") || code=000
  if [ "$code" != "200" ]; then
    echo "openreply-cron: ${route} returned ${code}" >&2
    status=1
  else
    echo "openreply-cron: ${route} ok $(head -c 200 "$body_file")"
  fi
done

exit "$status"
