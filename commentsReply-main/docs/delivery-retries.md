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
flow. No schema migration is required.
