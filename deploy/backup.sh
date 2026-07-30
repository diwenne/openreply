#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR="/opt/openreply"
readonly BACKUP_DIR="/mnt/data/openreply/backups"
readonly REMOTE_BACKUP_HOST="yoyaku-hetzner"
readonly REMOTE_BACKUP_DIR="/opt/backups/openreply-automation"
readonly LOCAL_RETENTION_DAYS=14
readonly REMOTE_RETENTION_DAYS=30
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

ssh "$REMOTE_BACKUP_HOST" install -d -m 0700 "$REMOTE_BACKUP_DIR"
rsync --archive --chmod=F600 \
  "$FINAL_PATH" "${FINAL_PATH}.sha256" \
  "${REMOTE_BACKUP_HOST}:${REMOTE_BACKUP_DIR}/"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  -name "openreply-*.dump" -mtime "+${LOCAL_RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f \
  -name "openreply-*.dump.sha256" -mtime "+${LOCAL_RETENTION_DAYS}" -delete

ssh "$REMOTE_BACKUP_HOST" \
  "find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'openreply-*.dump' -mtime '+$REMOTE_RETENTION_DAYS' -delete"
ssh "$REMOTE_BACKUP_HOST" \
  "find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'openreply-*.dump.sha256' -mtime '+$REMOTE_RETENTION_DAYS' -delete"

printf 'OpenReply backup created and replicated: %s -> %s:%s/\n' \
  "$FINAL_PATH" "$REMOTE_BACKUP_HOST" "$REMOTE_BACKUP_DIR"
