# Meta App Review Notes

ManyChat Alternative uses the official Instagram API to send private replies to people who comment on a connected Instagram professional account's post or reel.

## Permissions To Request

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

## Review Demo Script

1. Sign in to ManyChat Alternative with an email magic link.
2. Connect an Instagram Business or Creator account.
3. Create a campaign for a recent reel/post with keyword `LINK`.
4. From a tester Instagram account, comment `LINK` on that reel/post.
5. Show `/api/webhook` receiving the comment event.
6. Show the worker sending a private reply through the Instagram messages endpoint using the comment ID.
7. Show the log row in the dashboard with status `SENT`.

## Compliance Positioning

- The app never scrapes Instagram.
- The app only sends a private reply when a user comments on the connected business account's content.
- Tokens are encrypted at rest with AES-256-GCM.
- Customers can disconnect Instagram from Settings.
- Rate limiting, deduplication, and monthly plan limits prevent spammy behavior.
