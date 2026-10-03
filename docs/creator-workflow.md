# Creator workflow

Campaigns can be saved as incomplete drafts, activated, paused, or archived.
Only ACTIVE campaigns with isActive=true send messages. Existing campaigns
retain their original active or paused state during the additive migration.
Archiving retains tracked links and public reports; it does not delete data.
Imports and copies always start as drafts and require explicit activation.

## Rules and simulation

Specific-post campaigns take precedence over all-post campaigns. Within the
same post scope, higher priority wins; creation time and ID resolve ties.
Excluded keywords are checked before positive keywords using the configured
whole-word matching option. Incoming DMs use priority without post specificity.
The simulator runs the same selection function as the worker. It does not
enqueue jobs, contact Instagram, or confirm external delivery permissions.

## Templates, resources, and history

Workspace owners and admins may save templates or resources, and create draft
copies for a connected Instagram account. Members can view library items.
Templates contain whitelisted content only, excluding account tokens, post
bindings, IDs, statuses, and statistics. Each copy has independent content and
tracked links; editing the library does not update earlier copies.
Version-checked resource updates reject stale edits. Repeated requests using
the same idempotency key create only one draft; using that key with changed
content returns a conflict.

Campaign saves, imports, copies, and automatic next-reel attachment record
immutable setting and destination snapshots. History returns only whitelisted
content. Changes before this feature was installed are not reconstructed.
Old tracked URLs continue to resolve according to their existing destination
records; do not treat link edits as immutable recipient-level snapshots.

## Next reel and rollout

Only one ACTIVE waiting campaign may be armed per account. It starts waiting
when activated, not when saved as a draft. Concurrent activation is serialized
by a PostgreSQL transaction advisory lock. Historical overlapping waiting rows
are preserved and flagged for manual resolution instead of silently rebound.
Run prisma migrate deploy and prisma generate before restarting both web and
worker processes. Use matching versions of both processes: older workers do
not implement priority and excluded keyword selection.

This package does not introduce service keys, MCP endpoints, conversion feeds,
or durable delivery-stage snapshots. Those can be added separately. The
existing send-retry behavior is retained; deterministic selection here does
not freeze a winner across campaign edits between retries.

## Acceptance checks

- Run the normal unit suite, typecheck, and build.
- Set TEST_DATABASE_URL to an isolated PostgreSQL database to run the lifecycle
  suite. It creates and removes a randomly named schema and never sends messages.
- Check draft activation validation, one armed reel under concurrent requests,
  imported draft state, workspace isolation, library optimistic concurrency,
  immutable revision links, and equal-position link order.
- In a non-production account, verify post-specific and all-post precedence,
  excluded keywords, DM priority, archived suppression, and next-reel binding.
