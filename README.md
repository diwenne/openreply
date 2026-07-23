<div align="center">

# OpenReply

Open-sourced ManyChat for Instagram comment-to-DM automation.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/diwenne/openreply?style=flat&color=black)](https://github.com/diwenne/openreply/stargazers)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

</div>

Someone comments `LINK` on your reel, and they get a DM with your link a second later. That is the whole idea. OpenReply watches the comments on your Instagram posts, and when a comment matches a keyword you set, it sends that person a private reply through the official Meta API. You can also post a public reply under the comment at the same time.

ManyChat does this and charges a monthly fee. OpenReply is the same core feature, free, running on your own infrastructure, with no seat limits and no plan caps.

> If this saves you a subscription or a weekend of building, a star on the repo genuinely helps other people find it.

## Why this exists

Comment-to-DM is one feature, but every tool that offers it wants a recurring subscription for it. The actual work is a webhook, a keyword match, and one API call to Meta. That does not need to cost anything to run for a single account.

OpenReply is built around Meta's official Instagram private replies. It does not scrape, it does not automate a browser, and it never asks for an Instagram password. That keeps your account inside Meta's rules, which matters if you care about not getting flagged.

## Features

- Keyword to DM. Match one or many keywords per post, whole-word or partial.
- Optional public reply. Post a visible comment reply on top of the DM.
- Tracked links. Swap a link for a tracked redirect and see clicks and CTR per campaign.
- Personalization. Use `{username}` in your message to greet the commenter by name.
- Per-account rate limiting. Stays under Meta's documented cap of 750 private replies per hour, and queues the overflow instead of dropping it.
- Multiple Instagram accounts. Connect several professional accounts under one workspace, each with its own limits.
- Workspaces and roles. Owner, admin, and member roles with invite links, useful if you run this for clients.
- Campaign templates. Start from a preset instead of a blank form.
- Inbox. Read your Instagram DM conversations and reply from the dashboard, inside Meta's 24-hour messaging window. Cached so it loads instantly on repeat visits.
- DM logs. Every send, skip, and failure is logged with a reason.
- Self-comment filtering. Your own comments never trigger a reply, since Meta rejects DMing yourself anyway.

## How it works

1. Someone comments on your Instagram post or reel.
2. Meta sends a webhook to your OpenReply instance.
3. OpenReply checks the comment against your active campaigns.
4. On a keyword match, it queues a job.
5. A background worker sends the private reply, and the public reply if you enabled one.

The web app receives the webhook and serves the dashboard. A separate worker process does the sending, because the send has to survive rate limits and retries. Both talk to the same Postgres and Redis.

## Quick start

You need a few free accounts before anything works: a Meta developer app, a Resend account for login emails, and somewhere to host (Vercel for the web app, Railway for the worker plus Postgres and Redis). The Instagram account you connect has to be a Business or Creator account, not a personal one.

The honest version: the code deploys in minutes, but the Meta app setup is the part that takes real time. Read [docs/setup.md](docs/setup.md) before you start. It is the single setup guide, covering hosting, your domain, the environment, and every Meta wrong turn so you do not have to find them yourself.

### Deploy the web app

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/diwenne/openreply)

### Run it locally

```bash
git clone https://github.com/diwenne/openreply.git
cd openreply
npm install
cp .env.example .env      # then fill in the values, see docs/setup.md
docker-compose up -d      # starts Postgres and Redis
npm run db:migrate
npm run dev               # web app on http://localhost:3000
npm run worker            # in a second terminal, this sends the DMs
```

Two processes, always. `npm run dev` serves the app and receives webhooks. `npm run worker` is what actually sends the messages. If comments come in and no DM ever arrives, the worker is the first thing to check.

Full environment variables and the production layout are in [docs/setup.md](docs/setup.md).

## Set it up with your AI assistant

If you use Claude Code, Cursor, or a similar tool, the Meta setup is a lot faster with an assistant driving it. There is a ready-made prompt in the [Set it up with an AI assistant](docs/setup.md#set-it-up-with-an-ai-assistant) section of the setup guide. Paste it into your assistant inside a clone of this repo, hand over your keys as it asks, and it will walk you through connecting Instagram and going live.

## Tech stack

- Next.js 16 and React 19 for the web app and API routes
- Prisma 7 with PostgreSQL
- BullMQ on Redis for the send queue and the worker
- Auth.js (NextAuth) with email magic links through Resend
- Tailwind CSS for the interface
- The official Instagram API with Instagram Login

## Contributing

Issues and pull requests are welcome. If you hit a Meta quirk that is not in the setup guide, a PR that documents it is worth as much as a code fix, because that is where everyone loses time.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Credits

Built and maintained by Diwen Huang.

- GitHub: [@diwenne](https://github.com/diwenne)
- Website: [diwenhuang.ca](https://diwenhuang.ca)
- X: [@diwenne](https://x.com/diwenne)
- Instagram: [@devdiwen](https://instagram.com/devdiwen)

OpenReply is a fork of [instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm) by [Anish Raj](https://github.com/im-anishraj), also MIT licensed. The billing layer and plan caps were removed, and the setup was documented from scratch.

## Star the repo

If OpenReply is useful to you, star it. It is the simplest way to help the project reach the next person looking for a free way to do this.

## License

MIT. See [LICENSE](LICENSE).
