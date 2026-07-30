# syntax=docker/dockerfile:1.7

FROM node:22.22.0-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && apt-get clean

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM dependencies AS builder
COPY . .

# These build-only placeholders are never copied into the runtime environment.
# Server-side OpenReply configuration is read from the container environment.
ENV NEXTAUTH_URL=http://127.0.0.1:3000 \
    NEXTAUTH_SECRET=build-only-nextauth-secret \
    CRON_SECRET=build-only-cron-secret \
    ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    DATABASE_URL=postgresql://openreply:build-only@127.0.0.1:5432/openreply \
    REDIS_URL=redis://127.0.0.1:6379 \
    INSTAGRAM_APP_ID=build-only \
    INSTAGRAM_APP_SECRET=build-only \
    FACEBOOK_APP_SECRET=build-only \
    WEBHOOK_VERIFY_TOKEN=build-only
RUN npm run build

FROM base AS web
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 openreply \
    && useradd --system --uid 1001 --gid openreply --home-dir /app openreply

COPY --from=builder --chown=openreply:openreply /app/.next/standalone ./
COPY --from=builder --chown=openreply:openreply /app/.next/static ./.next/static
COPY --from=builder --chown=openreply:openreply /app/public ./public

USER openreply
EXPOSE 3000
CMD ["node", "server.js"]

FROM base AS worker
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 openreply \
    && useradd --system --uid 1001 --gid openreply --home-dir /app openreply

COPY --from=production-dependencies --chown=openreply:openreply /app/node_modules ./node_modules
COPY --chown=openreply:openreply . .
COPY --from=builder --chown=openreply:openreply /app/app/generated ./app/generated

USER openreply
CMD ["npm", "run", "worker"]
