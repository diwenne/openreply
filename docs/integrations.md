# API and MCP

Workspace owners and admins can create keys at **API & MCP** (`/integrations`).
The UI offers 30, 60 or 90 days (default: 30). The API accepts whole days from
1 to 90. Existing keys are never extended. Copy the token at creation; only its
SHA-256 hash is stored. Revocation takes effect on subsequent authenticated requests.
Use HTTPS and never put a token in a URL, source control, screenshots or prompts.
Keys belong to the workspace, not their creator, and remain valid until expiry,
revocation or workspace deletion. Review keys when team members leave.

## Scopes

A key is read-only unless you tick more when you create it.

| Scope | Allows |
|---|---|
| `campaigns:read` | Every key has it. List and read campaigns, stats, connected accounts, posts and DM logs. |
| `campaigns:write` | Create, edit, pause and delete campaigns. **Campaigns created with a key always start paused.** |
| `campaigns:activate` | Turn campaigns on, so they start replying to people on Instagram. |

Two rules keep "write" from becoming "send":

- Editing a **live** campaign changes what people receive immediately, so it
  needs `campaigns:activate` too. A write-only key gets 403 and has to pause the
  campaign first.
- A campaign must be paused before it can be deleted (409 otherwise), since
  deleting also removes its DM logs and tracked links.

Pausing only ever stops messages, so `campaigns:write` or `campaigns:activate`
is enough.

Apply migrations and regenerate Prisma before starting the new web version:

```sh
npm run db:migrate
npm run db:generate
```

The additive migration only creates `ServiceKey`; it does not change campaigns,
authentication providers or worker behavior. `REDIS_URL` is required for service
requests. Each key allows 120 requests per fixed 60-second window. Redis failures
reject requests with 503 instead of disabling the limiter.

## MCP clients

Connect to `https://YOUR-DOMAIN/api/mcp` using Streamable HTTP and a custom header:

```text
Authorization: Bearer <service-key>
```

With Claude Code:

```sh
claude mcp add --transport http openreply https://YOUR-DOMAIN/api/mcp \
  --header "Authorization: Bearer <service-key>"
```

There is no OAuth server, dynamic client registration or token in the URL.
Clients requiring OAuth are not supported. Never switch to public access to work
around a client limitation.

`tools/list` only shows the tools the key's scopes allow.

| Tool | Scope | What it does |
|---|---|---|
| `list_campaigns` | read | Up to 100 compact campaign summaries, newest first. |
| `get_campaign` `{ id }` | read | Settings, ordered `trackedLinks`, and `trackedDestinationUrl`, `secondaryDestinationUrl`, `secondaryButtonLabel`. Missing links are `[]` / `null`. |
| `get_campaign_stats` `{ id }` | read | Aggregate send outcomes and raw link requests (**not** unique recipients). |
| `list_instagram_accounts` | read | Connected accounts: id, username, provider. Never tokens. |
| `list_posts` `{ instagramAccountId?, limit? }` | read | Recent posts and reels (up to 50) of an account, to target a campaign. |
| `list_dm_logs` `{ id, status?, limit? }` | read | What happened with each matching comment: status, error, public reply outcome. Up to 100. |
| `create_campaign` | write | Same fields as the dashboard form. Always created paused. |
| `update_campaign` `{ id, ... }` | write | Only the given fields change. An empty string for a link removes it. |
| `pause_campaign` `{ id }` | write or activate | Stops the campaign. |
| `activate_campaign` `{ id }` | activate | Turns the campaign on. |
| `delete_campaign` `{ id }` | write | Deletes a paused campaign. |

`create_campaign` and `update_campaign` use the dashboard's own validation
(`lib/campaigns/mutations.ts`), so the same rules apply: a campaign targets one
post (`postId`), every post (`matchAnyPost`) or the next reel
(`pendingNextReel`); it has keywords or `matchAnyWord`; an opening DM needs a
message and a button label. `isActive` and `reportShareEnabled` are not
accepted: activation has its own tool and report sharing stays in the dashboard.
Validation errors return the field errors.

## REST

Use the same Bearer header. Every endpoint maps onto the tool of the same name,
with the same scopes and output.

```text
GET    /api/v1/campaigns                          list_campaigns
GET    /api/v1/campaigns?id=<id>                  get_campaign
GET    /api/v1/campaigns?id=<id>&stats=1          get_campaign_stats
POST   /api/v1/campaigns                          create_campaign (JSON body)
GET    /api/v1/campaigns/<id>                     get_campaign
PATCH  /api/v1/campaigns/<id>                     update_campaign (JSON body)
DELETE /api/v1/campaigns/<id>                     delete_campaign
POST   /api/v1/campaigns/<id>/pause               pause_campaign
POST   /api/v1/campaigns/<id>/activate            activate_campaign
GET    /api/v1/campaigns/<id>/stats               get_campaign_stats
GET    /api/v1/campaigns/<id>/logs?status=&limit= list_dm_logs
GET    /api/v1/accounts                           list_instagram_accounts
GET    /api/v1/posts?instagramAccountId=&limit=   list_posts
```

Responses use `{ "data": ... }`; errors use `{ "error": ..., "details"? }`.
Lists are capped without pagination. Detail responses use an explicit safe
projection: no provider tokens, report-share secrets or account relations; DM
logs leave out Instagram user and comment ids. A campaign or account outside the
key's workspace returns 404. Invalid/expired/revoked keys return 401, missing
scope returns 403, rate limits return 429. Results are `Cache-Control: no-store`.

Admin key management uses session authentication at `/api/integrations/keys`:
GET lists metadata (never hashes/tokens), POST creates a key, DELETE with `?id=`
revokes it. A supplied Origin must match `NEXTAUTH_URL` (or the request origin).
JSON request bodies are bounded to 64 KiB including streamed/chunked requests.

## Verification

`npm test` includes mocked authentication/route/tool tests. Set `TEST_DATABASE_URL`
to a disposable local PostgreSQL database to also exercise full migrations,
workspace isolation, the write tools, deterministic link ordering and fixed key
expiration. The DB suites create and remove their own schemas.

For actual HTTP verification, migrate a **disposable local** database, start
the web app with that `DATABASE_URL`, local `REDIS_URL` and loopback
`NEXTAUTH_URL`, then run:

```sh
TEST_BASE_URL=http://127.0.0.1:3317 \
TEST_DATABASE_URL=postgresql://postgres:local-test@127.0.0.1:54456/postgres \
npx tsx scripts/verify-integrations.ts
```

The script refuses non-loopback URLs, creates dummy fixtures and keys, and
removes its test user/workspace in `finally`. It must never run against a real
deployment, including one tunneled through localhost. No Meta messages are sent:
the campaigns it creates are never activated.
