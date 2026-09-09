# Meta App Review notes

You only need App Review if you want people who are not testers on your app to connect their own Instagram accounts. If you run OpenReply for your own accounts, skip this. See the "Letting other people use your instance" section of [docs/setup.md](docs/setup.md).

OpenReply uses the official Instagram API to send a private reply to someone who comments on a connected professional account's post or reel.

## Permissions to request

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`
- `instagram_business_manage_insights`

These four are the exact list sent in the Instagram Business Login authorization
URL (`getAuthorizationUrl` in `lib/meta/oauth.ts`). Add every one of them to the
app's "Instagram business login" permissions in the Meta dashboard, otherwise
the consent screen drops the missing ones silently and the resulting token can
never call the endpoint that needs them.

## Permission justifications

Paste these into the App Review request, adjusted to your wording.

`instagram_business_basic`. We use this to identify the connected Instagram professional account after the user authorizes through Instagram business login, so we can associate the account with their workspace and show which account each automation belongs to.

`instagram_business_manage_comments`. When a follower comments a keyword the account owner configured on the owner's own post or reel, we receive the comment through the comments webhook and, if the owner enabled it, post a public reply under that comment. We only act on comments on the connecting account's own media.

`instagram_business_manage_messages`. After a follower comments a configured keyword, we send that follower a one-time private reply with content the account owner set up, typically a link or answer the follower asked for by commenting. This is the standard Instagram comment-to-DM flow. We send one reply per matching comment and respect Meta's rate limits.

`instagram_business_manage_insights`. We read the insights (reach, plays, saves, shares, comment counts) of the connected account's own reels and posts, and only those, to build the campaign dashboard the account owner sees inside the app. Each campaign is bound to a post, so the owner needs the post's own reach next to the DMs and link clicks that post produced in order to judge whether the campaign worked. We never read insights for accounts other than the one that authorized us, we never read follower-level or demographic data about individual people, and the numbers are shown only to the workspace that connected the account.

### How the campaign dashboard uses insights

Every DM we send carries a tracked short link with a per-post attribution token
(`?src=ig<media_id>`), and every click is stored with that token. Insights supply
the denominator: reach and plays for the same media id. Together they turn the
dashboard from "we sent N DMs" into "this reel reached X people, produced N DMs
and C clicks". That is the whole reason the permission is requested — it is not
used for any audience analysis, export, or resale.

## Screencast script

Record on your published app, real accounts, one take, about two to three minutes. Narrate each step.

1. Sign in with an email magic link.
2. Go to Settings and click Connect Instagram. Show the consent screen with the permissions being granted.
3. Create a campaign on a recent post with keyword `LINK`, a DM message, and save.
4. On a second phone or account, comment `LINK` on that post.
5. Show the second account receiving the DM, and the public reply appearing under the comment.
6. Back in the app, show the DM Logs page with the SENT row.

Reviewers want to see the permission produce a real result for a real user. This flow does that directly.

## Compliance positioning

- The app never scrapes Instagram and never asks for a password.
- It only sends a reply when someone comments on the connected account's own content.
- Tokens are encrypted at rest with AES-256-GCM.
- Granted permissions are not stored in our database: `InstagramAccount` keeps
  only the encrypted token and its expiry, so the token itself is the single
  source of truth for what was granted. Consequence: after the scope list
  changes, an account connected under the old list keeps a token without the new
  permission until its owner reconnects from Settings (which re-runs the consent
  screen and overwrites `accessToken`). There is nothing to migrate, but there is
  something to redo — see the reconnection note in docs/setup.md.
- Users can disconnect Instagram from Settings.
- Per-account rate limiting and deduplication prevent spammy behavior.

## Business verification

Meta usually requires business verification before granting Advanced Access. It asks for a document proving a legal entity: a business registration or license, articles of incorporation, a business tax document, or a business bank statement. If you do not have a registered business, you cannot complete this step, and the practical path is to run OpenReply for your own accounts instead, which never needs review.
