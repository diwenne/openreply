# Draft and event integrations

This optional extension depends on the read-only API/MCP, creator workflow and
durable delivery packages. Apply all prerequisite migrations before this one.
It adds `IntegrationEvent` only; existing service keys keep their exact scopes
and expiration dates. No migrations grant new scopes to existing keys.

## Permissions

Admins explicitly select additional scopes when creating a key:

- `drafts:write`: create inactive DRAFT campaigns and validate campaign content.
- `events:read`: pull workspace-scoped integration and delivery events.
- `conversions:write`: record an externally confirmed conversion.

The default remains `campaigns:read`. No key can publish/activate campaigns or
send messages. Draft creation always sets DRAFT and inactive regardless of
caller-supplied status, workspace or account fields. Account ownership is checked.
Review campaign content, actual post, keyword and links in the UI before Go Live.

## Drafts

`POST /api/v1/campaigns` and MCP `create_draft` accept campaign content,
`instagramAccountId` and an 8–128-character `idempotencyKey`. Use actual supplied
links only. Missing links are allowed in drafts, never guessed. Retries with
the same key/content return the same campaign; different content under the same
key returns 409. The campaign, links, initial revision and integration event are
committed atomically. MCP `validate_campaign` only checks configuration, not
Meta permissions, delivery eligibility or actual message receipt.

## Conversions

`POST /api/v1/conversions` accepts `campaignId`, stable `externalId` (8–128 chars),
`type` (`resource_downloaded`, `form_completed`, `qualified_inquiry`), optional
opaque `subjectRef` and non-negative `value`. The source must have observed the
conversion. A tracking click does not prove a conversion or identify an email.
Workspace ownership is enforced; retries are idempotent, changed payload is 409.
Do not place personal data in `subjectRef`; use a customer-owned opaque reference.

## Event feed

`GET /api/v1/events?since=<ISO timestamp>` requires `events:read`. Process every
page using the opaque `nextCursor` until it is null. Then checkpoint `nextSince`.
The feed is at-least-once: replay the provided 15-minute overlap and dedupe by
`eventId + data.status`. Database commit order is not timestamp order. Very long
transactions require a wider replay window. No push webhook or CRM connector is
automatically configured.

Delivery entries expose stage/status/version/timestamps, not recipients, raw
worker payloads or errors. Integration entries contain the supplied opaque
conversion reference and value, so grant `events:read` only to trusted consumers.

All routes reuse Bearer authentication, the Redis fail-closed rate limiter,
scope/workspace checks and no-store responses. Write bodies are limited to
64 KiB and a supplied Origin must match the instance origin.

## Verification

Run `npm test` with `TEST_DATABASE_URL` pointing to a disposable local PostgreSQL
database to exercise concurrent writes, workspace checks and tied-time event
pagination against the real schema. Without that variable the DB tests skip.

For actual HTTP verification, migrate a disposable local database and start the
web app with the same database, local Redis and loopback `NEXTAUTH_URL`, then run:

```sh
TEST_BASE_URL=http://127.0.0.1:3320 \
TEST_DATABASE_URL=postgresql://postgres:local-test-only@127.0.0.1:54459/postgres \
npx tsx scripts/verify-write-integrations.ts
```

The script uses dummy users, session-authenticated key creation and native HTTP
MCP/REST calls. It removes its fixtures in `finally`; it sends no Meta messages.
Never point it at a live deployment or a database tunneled through localhost.
