# Conversation detail failures (issue #60)

Issue: https://github.com/diwenne/openreply/issues/60

## Observed behavior

On the reporter's account, the expanded Instagram Login conversations request
succeeded with limit=41 and failed with limit=42 or 50. Using the outer cursor
after those 41 entries with limit=1:

| Fields | Result |
| --- | --- |
| id | Success |
| id,updated_time | Success |
| id,updated_time,participants | Meta OAuthException code 1 |
| id,messages.limit(1){message,from,created_time} | Meta OAuthException code 1 |

The reporter reproduced this in Postman with a newly issued token on v25. The
original inbox error also occurred on v26. The affected entries were identified
in the Instagram app as conversations with AIs from Instagram AI Studio. This
is an account-specific observation, not a claim about every AI Studio chat or
a universal 41-conversation limit. Meta's underlying reason is unknown.

## Recovery

Healthy accounts retain the normal expanded request. Only code-1 failures
reduce the page size, until an affected entry is isolated. That entry is read
with id,updated_time, marked detailsUnavailable and retained in the list.
Traversal continues using the OUTER conversation cursor; healthy pages grow
again. The existing scope remains up to 50 unique recent conversations.

The UI explains unavailable details and disables replies without a recipient.
An owner-only conversation no longer falls back to the owner as its recipient.
No participant or recipient is inferred from an unavailable entry.

Auth, permission, rate-limit, network and minimal-metadata errors propagate.
Requests have a 10-second timeout. Repeated cursors and excessive traversal
fail explicitly instead of silently returning a misleading partial list.
Recovery performs additional reads, so affected inboxes can load more slowly.
Only one conversation-list request per account runs in the same mounted inbox.
This is not a global cache or a guarantee against account-level rate limits.
The next refresh retries unavailable details, allowing transient failures to
recover. Warning logs contain only code/subcode/trace, not credentials or chats.

## Verification

The identical application code and regression tests passed TypeScript, lint,
all 247 tests (including 16 recovery tests), and the production build on the
reporter's test branch:
https://github.com/TylonHH/openreply/actions/runs/34864292076

The reporter deployed that build and confirmed the previously affected inbox
loads again. Runtime logs changed from whole-list errors to isolated detail
warnings. AI Studio chats were identified by checking Instagram itself. An
owner-only conversation has a disabled composer, accepted by the reporter.
No outbound message test was needed for this read-path change.

The clean upstream branch excludes fork deployment and test-image workflows.
No local test runtime was available while preparing it; the application/test
files were checked against the already validated versions. Upstream CI can
rerun the normal gates for the submitted commit.

Manual regression checks:

1. Refresh the affected inbox in a fresh browser session.
2. Confirm unavailable entries are explicitly labelled.
3. Check healthy entries following them remain present within the 50-entry scope.
4. Open healthy entries and inspect their messages.
5. Open an unavailable entry and verify its explanation and disabled composer.
6. Verify a healthy second account and repeated refreshes.
