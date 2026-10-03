# Comment delivery retries

A failed API response is not proof that Instagram did not deliver a message.
In particular, Meta error 1 has been observed alongside actual inbox delivery.
Do not retry that outcome as a plain-text fallback or a new polling job.

The comment worker claims each DM/public-reply leg with an atomic DmLog update
before calling Instagram. The existing delivery-unconfirmed flags serve as
in-flight claims. Success replaces a claim with the corresponding sent state.
Only explicit provider rejections release a claim. Network/unknown API errors,
process crashes and failed result writes leave the claim in place. This favors
avoiding duplicate messages; inspect the inbox before manually retrying an
uncertain delivery, including a crash between the claim and the network call.

DM send attempts are incremented in the database, with a limit of three across
all webhook, retry and polling jobs for the campaign/comment pair. New job IDs
cannot reset that limit. Polling skips finished, uncertain or exhausted DM legs
while still allowing an unfinished public reply leg to be handled independently.
Historical Meta code 1/2/5xx failures are treated as uncertain on both paths.

A text fallback requires an explicit Meta code 100 template/button rejection.
If that fallback fails, its own outcome is preserved instead of being replaced
by the earlier template rejection. Meta button-tap jobs also use the existing
durable postback claim so redelivering the same tap cannot send it again.

No campaign is paused by this policy. New comments continue through the normal
flow.

## Durable delivery stages and follow-ups

This contribution builds on the creator-workflow package: campaign lifecycle,
versioning and deterministic rule selection must be present first. Apply the
additive `20261003091000_delivery_reliability` migration before deploying Web or
Worker. There are no dependency or deployment-provider changes in this package.

A `DeliveryEvent` records each trigger winner and subsequent send stage. The
winner and message settings are snapshotted before the first external send.
Retries retain that winner, even after campaign edits or queue eviction. They
do not fall through to another campaign if the original winner is paused or no
longer eligible. Claims and the existing `DmLog` updates are transactional.
Provider credentials are not copied into snapshots.

The trigger and follow-up snapshots are immutable. A postback stage records the
latest send attempt: only a confirmed provider rejection releases its claim, so
a later retry may use an edited campaign. On that retry, both the stored message
and campaign version are refreshed together. Successful, uncertain or crashed
claims cannot be reclaimed automatically.

Follow-ups use a durable, rendered message snapshot and a known inbound-DM or
button-tap timestamp. Missing, invalid, future or expired timestamps fail closed.
Read-receipt fallback delivery does not open a new messaging window. The worker
rechecks the campaign's active state, follow-up opt-in, account, recipient and
24-hour window before claiming a follow-up. Pausing a campaign or disabling
follow-ups cancels its pending sends. Editing a message does not rewrite already
scheduled snapshots.

Pending follow-ups whose Redis insertion failed are recovered from PostgreSQL
by the worker. Only due `PENDING` rows are retried. `CLAIMED` and `UNCONFIRMED`
rows are never automatically resent: a crash after claiming may have occurred
before or after delivery. Legacy follow-up queue jobs without a snapshot and
interaction timestamp are recorded as `SKIPPED` rather than guessed safe.

Direct Meta inbound-message and postback webhooks provide verified interaction
timestamps. The current Zernio normalization does not preserve a verified user
interaction timestamp; its follow-ups therefore fail closed as `SKIPPED`. This
does not prevent the immediate reply or reveal from being sent.

Delivery events contain message text and recipient identifiers needed for
deduplication and operations. Limit database access accordingly and apply your
own retention policy. The authenticated campaign history dashboard shows only
workspace-bound stage/status/version/timestamp/message data and redacted errors;
raw recipient IDs, operation keys and provider/queue payloads are never returned.
This package does not add a public event endpoint or conversion reporting.
