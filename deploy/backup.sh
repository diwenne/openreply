#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR="/opt/openreply"
readonly BACKUP_DIR="/mnt/data/openreply/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly TIMESTAMP
readonly FINAL_PATH="${BACKUP_DIR}/openreply-${TIMESTAMP}.dump"
readonly TEMP_PATH="${FINAL_PATH}.tmp"

umask 077
install -d -m 0700 "$BACKUP_DIR"

cd "$APP_DIR"
docker compose -f compose.production.yml exec -T postgres \
  pg_dump --username=openreply --dbname=openreply --format=custom \
  > "$TEMP_PATH"

test -s "$TEMP_PATH"
mv "$TEMP_PATH" "$FINAL_PATH"
sha256sum "$FINAL_PATH" > "${FINAL_PATH}.sha256"

printf 'OpenReply backup created: %s\n' "$FINAL_PATH"
