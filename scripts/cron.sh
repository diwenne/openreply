#!/bin/sh
# Scheduler for the periodic jobs under /api/cron.
#
# On Vercel these run from the "crons" block in vercel.json. Nothing reads that
# file anywhere else, so a self-hosted instance has no scheduler at all and the
# jobs simply never run — silently. The one that hurts is refresh-tokens: the
# Instagram token expires and every automation stops without a single error.
#
# Run as its own container from the app image (see the compose file), so the
# jobs live with the app they belong to and keep working even if every other
# stack on the host is taken down.

set -u

BASE_URL="${CRON_BASE_URL:-http://web:3000}"
# Same fallback as the routes themselves: they accept either secret.
SECRET="${CRON_SECRET:-${NEXTAUTH_SECRET:-}}"

if [ -z "$SECRET" ]; then
  echo "[cron] neither CRON_SECRET nor NEXTAUTH_SECRET is set — the routes would answer 401" >&2
  exit 1
fi

call() {
  route="$1"
  stamp=$(date -u '+%Y-%m-%d %H:%M:%S')

  if body=$(wget -q -O- --timeout=180 \
      --header="Authorization: Bearer $SECRET" \
      "$BASE_URL/api/cron/$route" 2>&1); then
    echo "[cron] $stamp $route ok $body"
  else
    # A failure is worth shouting about: these jobs have no user watching them.
    echo "[cron] $stamp $route FAILED ${body:-no response}" >&2
  fi
}

echo "[cron] scheduler started, target $BASE_URL"

last_slot=""
last_daily=""

while true; do
  now=$(date -u '+%Y-%m-%d %H:%M')
  today=${now% *}
  hhmm=${now#* }
  hour=${hhmm%:*}
  minute=${hhmm#*:}

  # attach-next-reel every 5 minutes rather than once a day: a campaign created
  # before its reel is published stays inert until this binds it, and a daily
  # run would cost the whole first evening of comments.
  case "$minute" in
    00|05|10|15|20|25|30|35|40|45|50|55)
      if [ "$last_slot" != "$hhmm" ]; then
        last_slot="$hhmm"
        call attach-next-reel
      fi
      ;;
  esac

  # Once a day, early: the token refresh has a 10-day window before expiry, so
  # the exact hour does not matter — only that it happens every day.
  if [ "$hour" = "05" ] && [ "$last_daily" != "$today" ]; then
    last_daily="$today"
    call refresh-tokens
    call snapshot-followers
  fi

  # Half a minute: short enough never to skip a slot, long enough to stay idle.
  sleep 30
done
