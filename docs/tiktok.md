# TikTok comment replies

OpenReply can answer TikTok comments that contain a keyword with a public reply. It is optional: without `TIKTOK_APP_ID` and `TIKTOK_APP_SECRET`, the TikTok page, routes and worker loops stay off and Instagram is unaffected.

**Public replies only.** TikTok's API for replying to a comment with a direct message is limited to some regions, so this feature posts a visible reply under the comment and does not send DMs. Point people to your bio or pinned link in the reply text.

## What you need

- A running OpenReply instance with the worker (see [setup.md](setup.md)). The worker posts the replies and runs the comment polling.
- A public HTTPS URL for `NEXTAUTH_URL`, with no port. TikTok rejects redirect URLs with a port, so local development needs an HTTPS tunnel.
- A TikTok account to connect. TikTok's Accounts API works with Business and personal accounts.
- A TikTok For Business developer account.

## 1. Create the TikTok developer app

This uses the **TikTok API for Business** (business-api.tiktok.com), not the developers.tiktok.com Login Kit, which cannot read or reply to comments.

1. Sign up for TikTok For Business and register as a developer.
2. Create an app at <https://business-api.tiktok.com/portal/apps>.
3. Under **Authorization → Scope of permission**, tick **TikTok Accounts**, including Business User, Business Media and Business Comment (read and manage).
4. Upload an app logo (JPG or PNG, at most 512x512). Without it, the TikTok login shows an error page.
5. In **App Detail → Basic Information**, add the redirect URL:

   ```
   https://your-domain.example/api/tiktok/callback/
   ```

   The trailing slash is required by TikTok, and it must match `NEXTAUTH_URL` exactly. No query string and no port.
6. TikTok asks new apps (and scope increases) that include TikTok Accounts to submit the **Accounts API Access Application Form** before review. Then submit the app for review. Plan for the review to take a while before any account can connect.

OpenReply asks for these scopes, so each must be approved on the app:

```
user.info.basic,user.info.username,video.list,comment.list,comment.list.manage
```

If the app is not approved for any one of them, TikTok refuses the whole login with `invalid_scope`.

## 2. Set the environment variables

On the web app and the worker:

```bash
TIKTOK_APP_ID=your-app-id          # App ID from the developer portal
TIKTOK_APP_SECRET=your-app-secret  # Secret from the same page
```

Restart both. A **TikTok** entry appears in the sidebar.

Optional tuning, on the worker:

| Variable | Default | What it does |
| --- | --- | --- |
| `TIKTOK_POLL_INTERVAL_MS` | `300000` | How often the worker checks recent comments (5 min). |
| `TIKTOK_POLL_MAX_VIDEOS` | `10` | Videos checked per account per sweep, one API call each. |
| `TIKTOK_POLL_LOOKBACK_HOURS` | `72` | Comments older than this are ignored. |
| `TIKTOK_REPLIES_PER_MINUTE` | `10` | Replies per account per minute. The rest wait their turn. |

TikTok allows 40 calls a minute per account per endpoint, and 600 a minute per app at the Basic tier. The defaults stay well under both.

## 3. Connect an account

As a workspace owner or admin, open **TikTok** (or **Settings**) and click **Connect TikTok**. Accept all requested permissions: a connection without the comment permissions is refused, because it could never reply.

Access tokens last a day and are refreshed automatically. The refresh token lasts about a year; after that, or if the owner revokes access in TikTok, the account shows **Reconnect needed**.

## 4. Get comments: polling, and optionally the webhook

The worker checks the newest comments on the videos your campaigns cover every few minutes, so replies work with no further setup.

For faster pickup, register the comment webhook: in the TikTok connection panel, an owner or admin clicks **Register comment webhook**. That calls TikTok's `business/webhook/update` for the whole developer app with the `COMMENT` event and this URL:

```
https://your-domain.example/api/tiktok/webhook
```

- The subscription belongs to the TikTok app, not to one account, and covers every authorized account. Only one callback URL per app, so an app should serve one OpenReply instance.
- OpenReply never sends an `item_list` to TikTok. Once an item list is set on an app, TikTok keeps adding to it and the webhook stops covering every video.
- Events are signed with `TIKTOK_APP_SECRET`; unsigned or stale deliveries get a 401.
- TikTok says comment events arrive within five minutes, so they are not instant either. Polling keeps running as a safety net.

## 5. Create a campaign

On the TikTok page, click **New TikTok campaign**:

- **Which videos**: all videos, or one picked from your recent videos.
- **Keywords**: same matching as Instagram campaigns (case, accents and emoji ignored; whole word or partial). Or reply to every comment.
- **Reply variations**: up to 10, each at most 150 characters. One is picked at random per reply.

**Use several reply variations.** TikTok hides replies it considers spam, and many near-identical comments in a short time is exactly what it looks for. Vary the wording, and keep the reply rate conservative.

Only top-level comments are answered. Replies inside a thread, your own comments, and the replies OpenReply posts are ignored.

## How a reply is sent

TikTok's reply endpoint has no idempotency key: sending the same request twice posts two replies. So each comment is claimed in the `TikTokReplyLog` table first (one row per account and comment), and the reply is sent exactly once.

| Status | Meaning |
| --- | --- |
| Replied | TikTok accepted the reply. |
| Skipped | The comment was yours. |
| Failed | TikTok rejected the reply, for example missing permission or invalid text. Nothing was posted. |
| Unconfirmed | The request timed out or TikTok returned a server error. The reply may or may not be live, and it is not retried, so check the comment on TikTok. |

When TikTok rate-limits a reply, nothing was posted, so the claim is released and the comment is tried again after five minutes. An expired token is refreshed and the reply sent once more.

## Troubleshooting

- **`invalid_scope` on login**: the app is not approved for one of the scopes above.
- **Callback 404 or redirect mismatch**: the redirect URL in the portal must be `NEXTAUTH_URL` + `/api/tiktok/callback/`, with the trailing slash. OpenReply sends that exact string in both the login and the token exchange.
- **No replies**: check that the worker is running with the TikTok variables set, that the campaign is active, and the **Recent TikTok replies** table. Worker and sweep errors are in the `OperationalEvent` table.
- **Webhook signature failures** are recorded as `OperationalEvent` warnings. The usual cause is a `TIKTOK_APP_SECRET` from a different app.
