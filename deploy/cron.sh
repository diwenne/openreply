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

status=0
for route in refresh-tokens snapshot-followers attach-next-reel sync-releases; do
  code=$(curl -sS -o /tmp/openreply-cron-last.json -w '%{http_code}' \
    --max-time 120 \
    -H "Authorization: Bearer ${secret}" \
    "${BASE_URL}/api/cron/${route}") || code=000
  if [ "$code" != "200" ]; then
    echo "openreply-cron: ${route} returned ${code}: $(head -c 300 /tmp/openreply-cron-last.json)" >&2
    status=1
  else
    echo "openreply-cron: ${route} ok $(head -c 200 /tmp/openreply-cron-last.json)"
  fi
done

exit "$status"
