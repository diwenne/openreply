# OpenReply — Build Plans

Two implementation plans, grounded in the current code. Planning only; no code written.

Shared backbone both features reuse unchanged: BullMQ queue (`lib/queue/client.ts`), the worker loop + idempotent send logic (`lib/queue/dm-worker.ts`), the per-account Redis rate limiter (`lib/utils/rate-limiter.ts`, key `rate:dm:{externalId}`), workspace usage/billing (`lib/billing/usage.ts`), keyword matching (`lib/utils/keyword-matcher.ts`), the `DmLog` dedup unique `@@unique([automationId, commentId])`, and `ProcessedComment`.

---

## FEATURE 1 — "You didn't click yet" reminder

### The blocking design fact (read first)

Click attribution is **per-link, not per-recipient**. `TrackedLink` holds one `slug` shared by every commenter in a campaign; `buildTrackedUrl(slug)` (`lib/tracking/message.ts`) produces the same URL for everyone; `/r/[slug]/route.ts` writes a `LinkClick` with `trackedLinkId` but **no commenter/DmLog reference**. So "has this specific commenter clicked?" cannot be answered. Every other step depends on fixing this first.

**Lazy fix (chosen):** thread the `DmLog` id through the tracked URL as a query param and record it on the click. No new link per recipient, no new slug scheme.

- Add nullable `dmLogId` to `LinkClick`.
- Append `?c=<dmLog.id>` when building the per-send URL.
- `/r/[slug]/route.ts` reads `c` and sets `linkClick.dmLogId`.
- "Didn't click" = `LinkClick.findFirst({ where: { dmLogId } })` returns null.

Existing CTR analytics group clicks by `automationId` (`app/api/automations/route.ts:157`) and are unaffected by the extra column.

### Second constraint — deliverability, not just the 24h clock

The user's hard constraint is "fire inside 24h of the triggering comment." That guard is straightforward. The deeper risk: a reminder is a **second, unsolicited** message to the commenter.
- **Opening-DM (button) campaigns** — the user tapped the button (`processPostback`), which opens a standard messaging window. Reminder is cleanly deliverable.
- **Plain private-reply campaigns** — the only interaction is the comment. A private reply can't be sent twice to one comment, so the reminder must go to the IGSID via `sendDirectMessage` (`recipient:{id}`), which needs an open standard window that a comment alone may not grant.

Build the 24h-from-comment guard as specified, but **confirm with the owner** whether reminders should be restricted to opening-DM / engaged campaigns (see open questions).

### Ordered steps

1. **Prisma migration** (schema + attribution column, below). `prisma migrate dev`, regenerate client to `app/generated/prisma`.
2. **Attribution plumbing.** `buildTrackedUrl(slug, baseUrl?, dmLogId?)` appends `?c=`. Update the two send sites in `lib/queue/dm-worker.ts` (comment path ~L379, postback path ~L541) to pass the `DmLog.id`. In `processPostback` the `DmLog` upsert currently runs *after* the send (L584); move the create before the send so the id exists, or compute the deterministic `commentId` key (`reveal:<userId>`) and look it up. `/r/[slug]/route.ts`: parse `c`, set `dmLogId` on create.
3. **New queue job type.** In `lib/queue/client.ts`: add `ProcessReminderJob { dmLogId: string }`, `REMINDER_JOB_NAME = "process-reminder"`, extend the `DmQueueJob` union.
4. **Enqueue the delayed job.** After a `SENT` update in `processComment` (`lib/queue/dm-worker.ts:423`) and `processPostback` (:584), when `automation.reminderEnabled` and a tracked link exists: `getDMQueue().add(REMINDER_JOB_NAME, { dmLogId }, { delay, jobId: \`reminder_${dmLogId}\` })`. `delay = min(reminderDelayMinutes*60_000, 24h − SAFETY_BUFFER − (now − triggerTime))`. Deterministic `jobId` makes re-enqueue a no-op (BullMQ dedup) — the idempotency floor.
5. **Fire-time handler `processReminder`** (`lib/queue/dm-worker.ts`): load `DmLog` + automation. Skip if `reminderSentAt` set (idempotency). Skip if a `LinkClick` with this `dmLogId` exists (they clicked). Skip + stamp `reminderSkippedReason="window_expired"` if `now − triggerTime ≥ 24h − SAFETY_BUFFER`. Otherwise reserve usage + rate slot (reuse `reserveWorkspaceDMSend` + `reserveDMSlot`), `sendDirectMessage(token, externalId, commenterId, reminderText)`, stamp `reminderSentAt`. On error stamp `reminderError` (mirror the existing SENT/FAILED pattern).
6. **Dispatch.** `processJob` (`lib/queue/dm-worker.ts:624`) routes `REMINDER_JOB_NAME → processReminder`.
7. **API validation.** Add `reminderEnabled` / `reminderDelayMinutes` / `reminderMessage` to both zod schemas in `app/api/automations/route.ts` (create L18, update L68) and to the `create`/`update` data blocks. Refine: if `reminderEnabled`, require a message and a tracked link.
8. **Campaign builder UI.** `components/campaign-builder.tsx`: new state (`reminderEnabled`, `reminderDelayMinutes`, `reminderMessage`) beside the opening-DM block (~L157); a `Toggle` + delay input + textarea section modeled on the public-reply section; load them in edit mode (~L243); add the three keys to the submit `payload` (L369). Reuse `{username}` personalization.
9. **Test.** One `__tests__/reminder.test.ts` asserting: click present → no send; window expired → skip; happy path → send + stamp; double-fire → no second send.

### Prisma migration shape

```prisma
model Automation {
  // ...existing...
  reminderEnabled      Boolean @default(false)
  reminderDelayMinutes Int?    // minutes after send; UI caps < 1440
  reminderMessage      String?
}

model DmLog {
  // ...existing...
  reminderSentAt      DateTime?
  reminderError       String?
  reminderSkippedReason String?
}

model LinkClick {
  // ...existing...
  dmLogId String?
  @@index([dmLogId])
}
```
No `DmLog`→`LinkClick` relation needed; the nullable scalar + index is enough for the existence check. Backfill: none (old clicks stay `dmLogId=null`, which only means "pre-feature", never counted as a reminder-eligible click because those `DmLog`s have `reminderEnabled=false`).

### Risks / ceilings
- **Deliverability policy** (above) — the real ceiling, not the clock. Restricting to opening-DM campaigns is the safe default.
- **Window anchor** — using `DmLog.createdAt` as the comment proxy; the webhook doesn't persist the exact comment timestamp. Off by the queue latency (seconds). Acceptable; a `SAFETY_BUFFER` (suggest 1h) absorbs it.
- **Polling re-enqueue** — the reconciler re-adds comments with non-deterministic job ids; the reminder keys off `dmLogId` with a deterministic job id, so no duplicate reminders even if the comment is reprocessed.
- **Delay > BullMQ practical bounds** — delays up to 24h are fine for BullMQ delayed jobs; no extra infra.

### Effort
~1.5–2 days. Attribution plumbing (step 2) and the postback reorder are the fiddly parts; the rest mirrors existing patterns.

---

## FEATURE 2 — Facebook / Messenger comment-to-DM

### Reuse map (most of the backbone is untouched)
Unchanged: BullMQ queue + `process-comment` job, the whole `processComment` matching/dedup/usage/rate-limit flow, `DmLog` + `ProcessedComment` dedup, rate limiter (its key is already a generic external id), billing, keyword matcher, `TrackedLink`/`LinkClick`/`/r/[slug]`, report sharing. Webhook signature verification **already accepts `FACEBOOK_APP_SECRET`** (`lib/meta/webhook.ts:13`). The *only* platform-specific seams are: the account model, OAuth, webhook parsing, the send calls, and the post picker.

### Account model — generalize, don't rename
Renaming `InstagramAccount` cascades through `Automation.instagramAccountId`, `DmLog`, `LinkClick`, and ~20 routes. **Lazy choice:** keep the model name, add `platform` + `pageId`. The worker and webhook already treat `instagramId` as "the external account id used for webhook `entry.id` and send calls." For Facebook rows, **store the Page id in `instagramId`** so every existing `findUnique({ where: { instagramId } })` keeps working, and add `pageId` (= same value) + `platform` for explicit routing/clarity.
`// ponytail: instagramId holds a Page id for FB rows. Rename model to Account if a 3rd platform lands.`

### Ordered steps

1. **Prisma migration** (below). Migrate + regenerate.
2. **Facebook OAuth** — `lib/meta/facebook-oauth.ts` (reuse `createOAuthState`/`verifyOAuthState`/`encryptToken` from `lib/meta/oauth.ts`): `getFacebookAuthUrl` → `https://www.facebook.com/{ver}/dialog/oauth`, scopes `pages_messaging,pages_manage_metadata,pages_read_engagement`; `exchangeFacebookCode` → user token → long-lived; `getUserPages` → `GET /me/accounts` (returns `{id, name, access_token}` per Page — Page tokens from a long-lived user token don't expire, so `tokenExpiresAt=null`).
3. **Connect routes** — `app/api/facebook/connect/route.ts` (mirror `app/api/instagram/connect/route.ts`) and `app/api/facebook/callback/route.ts` (mirror the IG callback): exchange code, list Pages, upsert an `InstagramAccount` per connected Page with `platform=FACEBOOK`, `pageId=id`, `instagramId=id`, encrypted Page token, then subscribe the Page: `POST graph.facebook.com/{ver}/{pageId}/subscribed_apps` with `subscribed_fields=["feed","messages"]`. Reuse `canConnectInstagramAccount` (`lib/instagram-accounts.ts`) — its unique check is on `instagramId`, which now holds the Page id.
4. **Webhook parsing** — in `lib/meta/webhook.ts` add `parseFacebookCommentEvents` for `payload.object === "page"`, `change.field === "feed"`, `value.item === "comment"`, `value.verb === "add"`. Map the (different) shape — `entry.id`=pageId, `value.comment_id`, `value.from.{id,name}`, `value.post_id`, `value.message` — into the existing `WebhookCommentEvent`. Skip the Page's own comments (`from.id === entry.id`). In `app/api/webhook/route.ts` (:78) call this parser alongside `parseCommentEvents` and enqueue the union into the same `process-comment` job. No new queue, no new worker.
5. **Send adapter** — `lib/meta/facebook-client.ts`: `sendMessengerPrivateReply(token, pageId, commentId, msg)` → `POST graph.facebook.com/{ver}/{pageId}/messages` with `recipient:{comment_id}`; `sendMessengerDirectMessage(...recipient:{id})`; `sendFacebookCommentReply(token, commentId, msg)` → `POST /{commentId}/comments`. Reuse the `handleResponse` error taxonomy from `lib/meta/client.ts` (import or factor the shared helper).
6. **Worker dispatch by platform** — in `lib/queue/dm-worker.ts`, a small `senders(platform)` selector returning `{ privateReply, privateReplyWithLinkButton, directMessage, directMessageWithLinkButton, commentReply }` bound to either the IG or FB client. `processComment`/`processPostback` bodies stay shared; only the send calls go through the selector. Note: FB button-template support differs from IG — keep the existing try-button-then-fallback-to-inline pattern (`lib/queue/dm-worker.ts:381`), which already degrades gracefully.
7. **Post picker** — IG posts come from `getUserMedia` on `graph.instagram.com` (`lib/meta/client.ts`). FB needs `GET graph.facebook.com/{ver}/{pageId}/published_posts`. Add a FB branch in the posts API + `components/post-picker.tsx`. **Or** ship FB as any-post-only for v1 and defer the picker (confirm).
8. **Reconciler** — `lib/polling/comment-reconciler.ts` is IG-specific (`getUserMedia`, `getRecentMediaComments` on the IG graph). Page `feed` webhooks are more reliable than IG's, so **scope the reconciler to `platform===INSTAGRAM` for v1** and rely on webhooks for FB (confirm). FB reconciler = a later task if needed.
9. **UI** — platform is implied by the selected account, so `components/campaign-builder.tsx` mostly reuses as-is: the account picker (`components/account-select.tsx`) lists both IG and FB accounts; add a platform badge. Settings page (`app/(dashboard)/settings/page.tsx`): add a "Connect Facebook Page" button → `/api/facebook/connect`.
10. **env** — add `FACEBOOK_APP_ID` to `lib/env.ts` (`FACEBOOK_APP_SECRET` already present, L41) and `.env.example`.
11. **Meta dashboard** (out-of-repo, gating): add the **Facebook Login** product; request `pages_messaging` / `pages_manage_metadata` / `pages_read_engagement`; subscribe the app to the Page `feed` + `messages` webhook fields; submit **App Review for `pages_messaging`** (separate review from the IG approval already granted — this is the long-lead item).
12. **Tests** — extend `__tests__/webhook.test.ts` with a `page`/`feed` fixture asserting it parses into a `process-comment` job; a `facebook-client` happy-path test.

### Prisma migration shape

```prisma
enum Platform {
  INSTAGRAM
  FACEBOOK
}

model InstagramAccount {
  // ...existing...
  platform Platform @default(INSTAGRAM)
  pageId   String?  // Facebook Page id; null for IG rows (instagramId also = pageId for FB)
}
```
`DmLog`/`LinkClick` need no platform column — derivable via the account relation. `@default(INSTAGRAM)` backfills every existing row correctly with no data migration.

### Risks / ceilings
- **App Review for `pages_messaging`** — separate approval, the critical-path timeline risk. Everything else can be built behind it against a dev/test Page.
- **24h window + private replies** — same messaging-window rules as IG apply to Messenger (private reply to a comment allowed ~7 days; follow-up DMs need an open window). Same caveat as Feature 1.
- **Page admin requirement** — the connecting user must be an admin of the Page for `/me/accounts` to return a Page token.
- **`instagramId`-holds-a-pageId wart** — deliberate reuse to avoid a rename cascade; documented with a `ponytail:` note and revisited only on a 3rd platform.
- **Button templates** — FB template behavior differs; the existing fallback-to-inline path covers it, but verify on a real Page.

### Effort
~4–6 days of code (OAuth + connect routes ~1.5d, webhook parse + send adapter + dispatch ~1.5d, post picker + UI ~1d, tests/env ~0.5d), plus **wall-clock wait on App Review** that gates production but not development.

---

## Confirm with repo owner before building

**Feature 1**
1. Restrict reminders to opening-DM / engaged campaigns (deliverability-safe), or attempt on all link campaigns?
2. Window anchor — `DmLog.createdAt` acceptable, or must we persist the exact comment timestamp from the webhook?
3. Default `reminderDelayMinutes`, the UI max (< 1440), and the `SAFETY_BUFFER` size.

**Feature 2**
4. Keep `InstagramAccount` + `platform` (chosen, cheap) or bite the rename to `Account` now?
5. FB v1 as any-post-only (defer the post picker), or build the FB post picker up front?
6. Scope the polling reconciler to IG for v1 (rely on Page webhooks for FB)?
7. Status of Meta business verification and whether App Review for `pages_messaging` can start now.
8. Connect one chosen Page per flow, or bulk-connect every Page the user administers?
