#!/usr/bin/env bash
set -euo pipefail

curl \
  --fail \
  --silent \
  --show-error \
  --max-time 15 \
  https://openreply.yoyaku.fr/api/health \
  >/dev/null
