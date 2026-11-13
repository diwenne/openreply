# Welcome DM — Implementation Build Plan

**Status:** plan only, no code written. Grounded in a read of `app/api/webhook/route.ts`, `lib/meta/webhook.ts`, `lib/meta/client.ts`, `lib/meta/facebook-client.ts`, `lib/meta/facebook-oauth.ts`, `app/api/facebook/callback/route.ts`, `lib/queue/dm-worker.ts`, `lib/queue/client.ts`, `lib/utils/keyword-matcher.ts`, `prisma/schema.prisma`, `app/api/automations/route.ts`, `components/campaign-builder.tsx`.

**Decisions locked (§10):**
1. **Re-welcome:** cooldown after N days (not once-ever). N default **30**, per-automation override via `welcomeCooldownDays`.
2. **DM keyword:** match-any allowed ("welcome anyone who DMs").
3. **Platform:** Instagram **and** Facebook/Messenger. STORY_REPLY is IG-only (no FB story-reply event); DM_KEYWORD works on both.
4. **Content:** reuse tracked link / link button when a link is set, else plain text.

The FB path is cheaper than first thought: `pages_messaging` is already requested (`facebook-oauth.ts:48`), the Page is already subscribed to `["feed","messages"]` (`app/api/facebook/callback/route.ts:26`), and `sendMessengerDirectMessage(pageId, userId, text)` already exists (`facebook-client.ts:67`).

---

## 1. What already exists (don't rebuild)

The repo is already 80% of the way there. The Welcome DM is a new **trigger**, not a new pipeline.

| Need | Already in repo |
|------|-----------------|
| Send a DM to a user by their IGSID (manage_messages) | `sendDirectMessage(token, igId, userId, text)` — `lib/meta/client.ts:249`. This is the exact Welcome-DM send path. Also `sendDirectMessageWithLinkButton` if a link is wanted. |
| `messages` webhook field subscribed | **Yes** — `subscribeInstagramAccountToWebhooks` posts `subscribed_fields: ["comments", "messages"]` (`lib/meta/client.ts:598`). No new subscription call needed for *new* connects. |
| Webhook already receives `messaging[]` events | Partially — `parsePostbackEvents` reads `messaging[].postback` (`lib/meta/webhook.ts:217`). The `WebhookEntry.messaging[]` type already models `sender`, `recipient`, `postback`. We extend it to also read `messaging[].message`. |
| Keyword matching | `matchKeywords()` — `lib/utils/keyword-matcher.ts:41`. Reuse verbatim. |
| Dedup via a synthetic key with no real comment | Postback flow already does this: `commentId = reveal:<userId>` against the `@@unique([automationId, commentId])` on DmLog (`lib/queue/dm-worker.ts:572`). We copy the trick. |
| Queue + worker + plan/rate limit + logging | BullMQ `dm-processing` queue, `reserveWorkspaceDMSend`, `reserveDMSlot`, `DmLog`. Reuse. |

**The current gap:** message/story-reply events hit the webhook, get stored as a `WebhookEvent`, match none of the three parsers, and silently finish as `PROCESSED` with no action. We fill that gap.

---

## 2. The compliance model (why this is the "DM every follower" equivalent)

- No follow webhook exists; the API only lets you DM a user **after** they open a messaging window by messaging you first.
- Two user-initiated events open a 24h window and are what this feature reacts to:
  - **(a) Story reply** — user replies to the account's story → `messages` event with `message.reply_to.story`.
  - **(b) First / keyword DM** — user sends a direct message → `messages` event with `message.text`.
- Sending inside that window uses the same `manage_messages` permission already approved. **No new Meta permission, no new webhook field.** `manage_insights` is irrelevant here.

---

## 3. Data model change

### `triggerType` on Automation

Add an enum + column. Default keeps every existing campaign a comment campaign untouched.

```prisma
enum TriggerType {
  COMMENT      // existing behaviour (comment → private reply)
  STORY_REPLY  // user replies to a story → welcome DM
  DM_KEYWORD   // user sends a DM (keyword or any) → welcome DM
}

model Automation {
  // ...
  triggerType         TriggerType @default(COMMENT)
  // Re-welcome cooldown in days for STORY_REPLY / DM_KEYWORD (see §6).
  // null = use the app default (30). Ignored for COMMENT.
  welcomeCooldownDays Int?
  // ...
  @@index([instagramAccountId, triggerType, isActive]) // worker lookup for message events
}
```

Everything else the Welcome DM needs **already exists on Automation**: `keywords`, `matchAnyWord`, `wholeWordMatch`, `dmMessage`, `isActive`, `trackedLinks`. No `welcomeMessage` field — reuse `dmMessage` as the message body.

### Migration shape

- `prisma/migrations/<ts>_add_trigger_type/migration.sql`:
  - `CREATE TYPE "TriggerType" AS ENUM ('COMMENT','STORY_REPLY','DM_KEYWORD');`
  - `ALTER TABLE "Automation" ADD COLUMN "triggerType" "TriggerType" NOT NULL DEFAULT 'COMMENT';`
  - `ALTER TABLE "Automation" ADD COLUMN "welcomeCooldownDays" INTEGER;` (nullable, no default → existing rows null → use app default 30)
  - `CREATE INDEX "Automation_instagramAccountId_triggerType_isActive_idx" ON "Automation"("instagramAccountId","triggerType","isActive");`
- Backfill: none. The `DEFAULT 'COMMENT'` makes every existing row a comment campaign, so existing automations keep working with zero data migration.
- Run `prisma migrate dev` locally; apply on Railway (Postgres) via `prisma migrate deploy` in the worker/web release step.

**No change to DmLog.** We reuse its `commentId` column + `@@unique([automationId, commentId])` as the dedup key (see §6).

---

## 4. Webhook — parse message & story-reply events

**File:** `lib/meta/webhook.ts` (add a parser) + `app/api/webhook/route.ts` (enqueue).

### New type + parser `parseMessageEvents(payload)`

Incoming shape (Instagram `object: "instagram"`, `entry[].messaging[]`):

```jsonc
{
  "sender":    { "id": "<IGSID of the user>" },
  "recipient": { "id": "<account IG id>" },
  "timestamp": 1731500000000,
  "message": {
    "mid":  "<message id>",
    "text": "hey!",
    "is_echo": true,                       // present & true on OUR OWN sends — must skip
    "reply_to": { "story": { "id": "...", "url": "..." } }  // present → STORY reply
    // reply_to.mid (reply to a normal message) → NOT a story reply
  }
}
```

Parser returns `WebhookMessageEvent { instagramAccountId, senderId, text, mid, isStoryReply, timestamp }`.

**Skip rules (critical — these prevent loops and junk):**
- `payload.object !== "instagram"` → skip (FB Messenger out of scope for v1; see §9).
- `message.is_echo === true` → **skip.** Our own `sendDirectMessage` echoes back as a message event; without this guard a `matchAnyWord` DM_KEYWORD welcome re-triggers on its own reply → infinite loop.
- no `message` on the `messaging[]` entry (it's a `postback`) → skip (postbacks keep their own parser/path).
- `senderId === recipientId` (account's own action) → skip.
- no `senderId` or no `message.mid` → skip.
- `isStoryReply = Boolean(message.reply_to?.story)`.

### Facebook parser `parseFacebookMessageEvents(payload)`

Same output shape, for `object: "page"`, `entry[].messaging[]`. Mirrors `parseFacebookCommentEvents`, which already handles the `object: "page"` branch.

- `recipient.id` = Page id (= the FB row's `instagramId`), `sender.id` = the user's PSID.
- **No story-reply on FB** — Page message events carry no `reply_to.story`. So FB events always yield `isStoryReply: false` and only ever match `DM_KEYWORD` automations.
- Same `is_echo` / self / missing-field skips.
- **Standby channel:** when the app is not the primary message receiver, events arrive under `entry[].standby[]` instead of `messaging[]`. v1 reads only `messaging[]`. `ponytail:` ignore standby; add if a handover-protocol setup needs it.

### Route enqueue (`route.ts`)

Mirror the existing comment loop. After the `commentEvents`/`postbackEvents` loops, union the IG + FB message parsers (same way the route already unions `parseCommentEvents` + `parseFacebookCommentEvents`):

```
const messageEvents = [
  ...parseMessageEvents(payload),          // object: "instagram"
  ...parseFacebookMessageEvents(payload),  // object: "page"
];
for (const e of messageEvents) {
  await queue.add(MESSAGE_JOB_NAME, {
    instagramAccountId: e.instagramAccountId, // IG user id OR FB Page id
    senderId: e.senderId,
    text: e.text,
    mid: e.mid,
    isStoryReply: e.isStoryReply,
    messageTimestamp: e.timestamp,   // for the 24h guard in the worker
  }, {
    // Idempotent enqueue: same mid never queues twice. ":" is illegal in BullMQ ids.
    jobId: `message_${e.instagramAccountId}_${e.mid.replace(/:/g, "_")}`,
  });
  // also tag WebhookEvent.workspaceId like the comment loop does
}
```

---

## 5. Queue + Worker

### `lib/queue/client.ts`

- Add `MESSAGE_JOB_NAME = "process-message"`.
- Add `ProcessMessageJob { instagramAccountId; senderId; text; mid; isStoryReply; messageTimestamp }`.
- Add it to the `DmQueueJob` union.

### `lib/queue/dm-worker.ts`

- Route in `processJob`: `if (job.name === MESSAGE_JOB_NAME) return processMessage(...)`.
- New `processMessage(job)`:
  1. `wanted = job.data.isStoryReply ? "STORY_REPLY" : "DM_KEYWORD"`. (FB events are always `DM_KEYWORD` — no story replies on FB.)
  2. Find automations: `where { triggerType: wanted, isActive: true, instagramAccount: { instagramId } }` — **no `postId` filter** (story replies / DMs aren't tied to a post). Include `instagramAccount`, `workspace`, `trackedLinks`. `instagramAccount.platform` (INSTAGRAM | FACEBOOK) drives the sender dispatch in step 7.
  3. **24h window guard** (see §7) — compute once up front; if stale, mark SKIPPED and return.
  4. For each automation: match = `matchAnyWord ? true : matchKeywords(text, keywords, wholeWordMatch)`. Skip if no match.
  5. **Dedup** (see §6): synthetic `commentId = welcome:<senderId>`; if a `DmLog` for `(automationId, commentId)` is already `SENT`, skip.
  6. `reserveWorkspaceDMSend` (plan limit) + `reserveDMSlot` (hourly rate) — identical to `processComment`. On deny, write the matching SKIPPED_* status and release reservations, same as today.
  7. Send via `senders(platform)` — same dispatch `processComment`/`processReminder` already use, so IG and FB are handled by one code path. When a tracked link is set: `senders(platform).directMessageWithLinkButton(token, acctId, senderId, body, buttonLabel, trackedUrl)` with the button-template-then-inline fallback copied from `processComment` (`dm-worker.ts:426`). When no link: `senders(platform).directMessage(token, acctId, senderId, renderMessageWithTracking({ message: automation.dmMessage, commenterName: null, trackedLinks, dmLogId }))`. `acctId = automation.instagramAccount.instagramId` (IG user id for IG, Page id for FB).
  8. Upsert `DmLog` → `SENT` / `FAILED` exactly like the postback path, storing `commenterId = senderId`, `commentText = text` (or `"(story reply)"` when empty), `commentId = welcome:<senderId>`.

**No opening-DM button flow, no public reply** — there's no comment to reply to, and the window is already open, so we just send the DM. This keeps `processMessage` much shorter than `processComment`.

---

## 6. Dedup / idempotency key design

Two independent layers, both reusing existing mechanisms:

| Layer | Key | Purpose |
|-------|-----|---------|
| **Enqueue idempotency** | BullMQ `jobId = message_<acct>_<mid>` | The same webhook message event (same `mid`) never creates two jobs. Meta retries webhooks; this absorbs that. |
| **Re-welcome cooldown** | `DmLog.commentId = welcome:<senderId>:<bucket>` against `@@unique([automationId, commentId])`, where `bucket = floor(now_ms / (cooldownDays * 86_400_000))` | One welcome per sender per automation **per cooldown window**. `cooldownDays = automation.welcomeCooldownDays ?? 30`. A `findUnique` on `{ automationId, commentId }` returning `SENT` → skip (already welcomed this window). Same synthetic-commentId trick the postback flow uses (`reveal:<userId>`). |

**Why `mid` can't be the sender-dedup key:** every new DM from the same user has a fresh `mid`, so a `mid`-based key would re-welcome on every message. `senderId` (+ time bucket) is the stable per-person key.

**Cooldown bucket note:** the bucket is a fixed calendar grid (`floor(now/window)`), not a rolling "N days since last welcome." A sender welcomed near the end of one bucket could be welcomed again early in the next, so the real minimum gap ranges (0, N] days. This is the lazy, storage-free version — no "last welcomed at" timestamp to read. `ponytail: fixed-grid bucket; switch to a rolling gap (store lastWelcomedAt, compare) only if the loose boundary matters.` Default N = 30.

---

## 7. The 24-hour window guard

The window **opens at the user's message** (`message.timestamp`). We react to that same event, so a prompt send is compliant by construction. The guard exists only for the pathological-delay case: BullMQ retry backoff (`[5m, 15m, 45m]` × 3 attempts) or a worker outage could push a send past the window, where Meta would reject it (error 10/100) and burn a plan-limit reservation.

Reuse the existing constants in `dm-worker.ts`:

```
MESSAGING_WINDOW_MS = 24h; SAFETY_BUFFER = 1h   // already defined (lines 45–48)

if (Date.now() - job.data.messageTimestamp >= MESSAGING_WINDOW_MS - SAFETY_BUFFER) {
  // too old — don't attempt. Log SKIPPED (reason "window_expired"); do NOT throw (no retry).
  return;
}
```

Check this **before** reserving plan/rate slots so a stale event never consumes quota. This mirrors `processReminder`'s existing window check (`dm-worker.ts:744`).

---

## 8. Campaign-builder UI

**File:** `components/campaign-builder.tsx` (+ the Zod schemas in `app/api/automations/route.ts`).

Current builder hardcodes a comment campaign: `TriggerScope = specific | any | next` (which *post*), then keyword mode, then DM message.

Changes:
1. Add a top-level **trigger-type** selector before the post/scope section: **Comment** · **Story reply** · **DM keyword**. New state `triggerType`. Show **Story reply** only when the selected account's `platform === "INSTAGRAM"` (FB has no story-reply event); for FB accounts offer Comment · DM keyword only.
2. When `triggerType !== COMMENT`: **hide the post-scope UI** (`specific/any/next`, post picker, `matchAnyPost`, `pendingNextReel`) — none applies to story/DM triggers. Keep: keyword list + match-any toggle + whole-word toggle + the welcome message (`dmMessage`) + optional tracked link.
3. For DM_KEYWORD, label match-any as "Welcome anyone who DMs" (plain welcome). For STORY_REPLY, keyword/any both work (reply text is matchable).
4. Add a **re-welcome cooldown** input (days, default 30) shown for STORY_REPLY / DM_KEYWORD → `welcomeCooldownDays`.
5. Hide opening-DM and public-reply sections for non-comment triggers (not applicable).
6. Send `triggerType` and `welcomeCooldownDays` in the create/update payload.

### API schema (`app/api/automations/route.ts`)

- Add `triggerType: z.enum(["COMMENT","STORY_REPLY","DM_KEYWORD"]).default("COMMENT")` and `welcomeCooldownDays: z.number().int().min(1).max(365).optional().nullable()` to both create and update schemas.
- The post-target refine (`matchAnyPost || pendingNextReel || postId`, line ~54) must **only apply when `triggerType === "COMMENT"`**. For story/DM triggers force `postId=null, matchAnyPost=false, pendingNextReel=false` in the `create` data.
- The keyword refine (`matchAnyWord || keywords.length >= 1`) stays — valid for all three.
- Add a refine: `triggerType === "STORY_REPLY"` requires the resolved account's `platform === "INSTAGRAM"` (reject a FB account + story-reply combo; the account is already looked up in the POST handler at line ~300).
- In `prisma.automation.create` (line 347), pass `triggerType` + `welcomeCooldownDays` and null the post fields for non-comment types.

---

## 9. Meta permissions / webhook fields

| Item | Status |
|------|--------|
| `instagram_business_manage_messages` (manage_messages) | **Approved, Advanced Access.** Covers IG `sendDirectMessage`. |
| IG `messages` webhook field | **Already subscribed** in code (`client.ts:598`). Story replies arrive on this same field (`reply_to.story`). No new field. |
| `pages_messaging` (Facebook) | **Already requested** (`facebook-oauth.ts:48`). Covers `sendMessengerDirectMessage`. |
| FB Page `messages` webhook field | **Already subscribed** — `["feed","messages"]` (`app/api/facebook/callback/route.ts:26`). |
| `manage_comments`, `manage_insights` | Not needed for this feature. |
| New permissions | **None.** |

**One operational catch:** accounts connected *before* `"messages"` was added to `subscribed_fields` may not actually be subscribed to it — the `webhookSubscribed` boolean doesn't track which fields. New connects (IG and FB) are fine. **Action:** add a one-off re-subscribe for existing accounts — re-call `subscribeInstagramAccountToWebhooks` (IG) / re-POST `subscribed_apps` with `["feed","messages"]` (FB), e.g. from the token-refresh cron or a manual admin endpoint — and/or verify in the Meta App Dashboard that `messages` is subscribed at the app level for both products. Flagged in §10.

---

## 10. Decisions — settled

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Re-welcome policy | **Cooldown after N days.** Default N = 30, per-automation `welcomeCooldownDays` override. Fixed-grid bucket in the dedup key (§6). |
| 2 | DM_KEYWORD match-any | **Allowed** — "welcome anyone who DMs". Safe via is_echo skip + sender-dedup + existing rate/plan limiters. |
| 3 | Platform scope | **Instagram + Facebook.** STORY_REPLY IG-only; DM_KEYWORD both. FB infra already present (§9). |
| 4 | Welcome content | **Tracked link / button when a link is set, else plain text.** Reuses `directMessageWithLinkButton` + fallback. |

**Remaining nits (not blocking — sensible defaults in place):**
- **Cooldown default N:** set to 30. Change here if a different default is wanted; it's also per-campaign editable.
- **Existing-account re-subscribe (§9):** recommend shipping the one-off re-subscribe so already-connected accounts receive message/story events. Low effort; skip only if all live accounts were connected recently enough to already have the `messages` field.

---

## 11. Ordered build steps

1. **Schema** — add `TriggerType` enum + `Automation.triggerType` (default COMMENT) + `welcomeCooldownDays Int?` + composite index; `prisma migrate dev`. *(prisma/schema.prisma, new migration)*
2. **Webhook parsers** — `parseMessageEvents` (IG) + `parseFacebookMessageEvents` (FB) + `WebhookMessageEvent` type, with is_echo / story-reply / self-skip rules; extend the `messaging[].message` types. *(lib/meta/webhook.ts)*
3. **Route** — enqueue `process-message` jobs from the unioned IG + FB parsers, with `mid`-based jobId + workspace tagging. *(app/api/webhook/route.ts)*
4. **Queue types** — `MESSAGE_JOB_NAME`, `ProcessMessageJob`, union member. *(lib/queue/client.ts)*
5. **Worker** — `processMessage` (match → window guard → cooldown dedup → reserve → `senders(platform).directMessage[WithLinkButton]` → DmLog); wire into `processJob`. *(lib/queue/dm-worker.ts)*
6. **API schema** — `triggerType` + `welcomeCooldownDays` in create/update Zod; gate the post refine on COMMENT; add the STORY_REPLY→IG-platform refine; null post fields for welcome types; pass through to `create`. *(app/api/automations/route.ts)*
7. **UI** — trigger-type selector (Story reply hidden for FB accounts); cooldown-days input; conditionally hide post-scope/opening-DM/public-reply; send `triggerType` + `welcomeCooldownDays`. *(components/campaign-builder.tsx)*
8. **Re-subscribe** (recommended) — one-off `subscribed_fields` refresh for existing IG + FB accounts. *(reuse `subscribeInstagramAccountToWebhooks` + FB `subscribed_apps` POST)*
9. **Tests** — unit: `parseMessageEvents` / `parseFacebookMessageEvents` (story vs plain vs is_echo vs self vs object type); `processMessage` cooldown dedup (second event same sender in-window → skipped; after bucket rollover → sends) and window guard (stale timestamp → skipped). Follow the repo's existing `__tests__` + vitest setup. *(ponytail: one decisive test per new branch, no new framework.)*

### Files summary

**New:** `prisma/migrations/<ts>_add_trigger_type/migration.sql`; worker + webhook test files under `__tests__`.
**Edit:** `prisma/schema.prisma`, `lib/meta/webhook.ts`, `app/api/webhook/route.ts`, `lib/queue/client.ts`, `lib/queue/dm-worker.ts`, `app/api/automations/route.ts`, `components/campaign-builder.tsx`. *(Recommended re-subscribe: `app/api/cron/refresh-tokens/route.ts` or a small admin endpoint.)*

---

## 12. Risks & ceilings

- **Echo loop (highest risk).** `matchAnyWord` DM_KEYWORD + our own send echoing back = self-retrigger. Mitigated by the `is_echo` skip **and** sender-dedup. Both must land; test the is_echo case explicitly.
- **Broad trigger volume.** DM_KEYWORD match-any welcomes every first-DM sender → can hit the hourly `reserveDMSlot` / monthly plan limits fast. Existing limiters already protect quota; they'll just SKIP_* the overflow. Worth a word in the UI.
- **Pre-existing accounts not subscribed to `messages`** → their story/DM events never arrive. Operational, not code (§9).
- **Window edge.** Covered by the guard; the only loss is a stale-by-design event, which is correct to drop.
- **Story replies with no text** (sticker/reaction-only) won't match keywords — only `matchAnyWord` catches them. Acceptable.

## 13. Effort estimate

Roughly **2.5–3.5 days** for the IG + FB v1 as decided: schema + migration (~1h), IG + FB webhook parsers + route (~3–4h), queue + worker `processMessage` with cooldown + link-button send (~4–5h, a trimmed `processComment`), API schema gating + refines (~2h), UI trigger selector + cooldown input + conditional sections (~4–6h, the fiddliest part), re-subscribe one-off (~1–2h), tests (~3h). The FB path adds little code (senders dispatch + a parser) because `pages_messaging`, the FB `messages` subscription, and `sendMessengerDirectMessage` already exist.
