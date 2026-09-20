<div align="center">

# OpenReply

Open-sourced ManyChat for Instagram comment-to-DM automation.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/diwenne/openreply?style=flat&color=black)](https://github.com/diwenne/openreply/stargazers)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

</div>

Someone comments `LINK` on your reel, and OpenReply queues a DM with your link. That is the whole idea. OpenReply watches the comments on your Instagram posts, and when a comment matches a keyword you set, it sends that person a private reply through the official Meta API. You can also post a public reply under the comment at the same time.

OpenReply is free, MIT-licensed software running on your own infrastructure, with no software seat limits or plan caps. Hosting and optional provider costs are separate.

> **Supported by [Zernio](https://zernio.com/?utm_source=openreply&utm_medium=sponsorship&utm_campaign=openreply-integration&utm_content=readme-sponsor).** An optional paid Instagram connection provider that lets you avoid creating and reviewing your own Meta app. OpenReply still runs your campaigns, queues, logs, and inbox on your infrastructure. [Connect with Zernio](docs/zernio.md), or keep using your own Meta app.

> **OpenReply is self-hosted. You have to deploy your own copy.**
>
> [openreply.diwen.dev](https://openreply.diwen.dev) is a demo of the dashboard, not a service you can sign up for. Creating an account there will never send a DM for you, and there is no hosted plan to upgrade to.
>
> A working instance needs your deployed fork, a public HTTPS URL, PostgreSQL, Redis, a running worker, and an Instagram connection. Choose optional paid Zernio or your own Meta app. [docs/setup.md](docs/setup.md) walks through all of it.

> If this saves you a subscription or a weekend of building, a star on the repo genuinely helps other people find it.

## Why this exists

Comment-to-DM is one feature, but every tool that offers it wants a recurring subscription for it. OpenReply makes that workflow available as software you can inspect, modify, and host yourself.

OpenReply is built around Meta's official Instagram private replies. It does not scrape, it does not automate a browser, and it never asks for an Instagram password. Instagram’s policies, permissions, messaging windows, and rate limits still apply.

## Features

- Keyword to DM. Match one or many keywords per post, whole-word or partial.
- Optional public reply. Post a visible comment reply on top of the DM.
- DM and Story reply triggers. The same keywords can also fire on an inbound DM, which covers text replies to your Stories, since Instagram delivers those as DMs. That makes `Reply LINK to this Story` work with no post involved. Turn it on per campaign, and subscribe to the `messages` webhook field if you use your own Meta app. Zernio webhook registration is automatic.
- Tracked links. Swap a link for a tracked redirect and see clicks and CTR per campaign.
- Two link buttons. Send up to two tappable link buttons in one DM, each a separate tracked link with its own click stats.
- Follow gate. Optionally require a follow before you hand over the link. The DM asks the commenter to follow and tap a button; on tap, OpenReply checks Meta's `is_user_follow_business` flag and only sends the link once they follow, re-prompting until then. It fails open (sends the link anyway) when Instagram does not return follow status, so a real follower is never trapped.
- Personalization. Use `{username}` in your message to greet the commenter by name.
- Per-account rate limiting. Stays under Meta's documented cap of 750 private replies per hour, and queues the overflow instead of dropping it.
- Multiple Instagram accounts. Connect several professional accounts under one workspace, each with its own limits.
- Workspaces and roles. Owner, admin, and member roles with invite links, useful if you run this for clients.
- Campaign templates. Start from a preset instead of a blank form.
- English and Traditional Chinese interface, with a saved language preference. See [interface languages](docs/localization.md).
- Inbox. Read your Instagram DM conversations and reply from the dashboard, inside Meta's 24-hour messaging window. Cached so it loads instantly on repeat visits.
- DM logs. Every send, skip, and failure is logged with a reason.
- Self-comment filtering. Your own comments never trigger a reply, since Meta rejects DMing yourself anyway.

## How it works

1. Someone comments on your Instagram post or reel, or DMs you, or replies to your Story.
2. Your connection provider (direct Meta or Zernio) delivers the event to your OpenReply instance.
3. OpenReply checks the text against your active campaigns.
4. On a keyword match, it queues a job.
5. A background worker sends the private reply, and the public reply if you enabled one.

The web app receives the webhook and serves the dashboard. A separate worker process does the sending, because the send has to survive rate limits and retries. Both talk to the same Postgres and Redis.

## Quick start

1. **Choose your Instagram connection.** [Zernio](docs/zernio.md) is recommended if you want to avoid setting up your own Meta app. It is a paid service and sponsor, not a hosted OpenReply plan. Or follow the existing [direct Meta setup](docs/setup.md#the-meta-app).
2. **Deploy the app and worker.** Both paths need PostgreSQL, Redis, a public HTTPS URL, and email delivery for magic-link sign-in.
3. **Connect an Instagram Business or Creator account** in Settings, create a campaign, and test a keyword comment from another account.

Read [docs/setup.md](docs/setup.md) for the complete walkthrough, including a provider-aware AI assistant prompt. Existing accounts are never automatically migrated. Check [Zernio’s feature limits](docs/zernio.md#feature-availability) before choosing.

### Deploy the web app

The button creates your web deployment. You still need to configure the database, Redis, email delivery, and a separate always-on worker.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/diwenne/openreply)

### Run it locally

```bash
git clone https://github.com/diwenne/openreply.git
cd openreply
npm install
cp .env.example .env      # then fill in the values, see docs/setup.md
docker-compose up -d      # starts Postgres and Redis
npm run db:generate
npm run db:migrate
npm run dev               # web app on http://localhost:3000
npm run worker            # in a second terminal, this sends the DMs
```

Two processes, always. `npm run dev` serves the app and receives webhooks. `npm run worker` is what actually sends the messages. If comments come in and no DM ever arrives, the worker is the first thing to check.

Full environment variables and the production layout are in [docs/setup.md](docs/setup.md).

## Set it up with your AI assistant

If you use Claude Code, Cursor, or a similar tool, an assistant can walk you through either connection path. There is a ready-made prompt in the [Set it up with an AI assistant](docs/setup.md#set-it-up-with-an-ai-assistant) section of the setup guide. Paste it into your assistant inside a clone of this repo, choose your provider before configuring any Meta secrets, and it will walk you through connecting Instagram and going live.

## Tech stack

- Next.js 16 and React 19 for the web app and API routes
- Prisma 7 with PostgreSQL
- BullMQ on Redis for the send queue and the worker
- Auth.js (NextAuth) with email magic links through Resend
- Tailwind CSS for the interface
- The official Instagram API with Instagram Login

For the complete stack — application libraries, the two runtime processes, and the free services this runs on (Vercel, Neon, Redis Cloud, an Oracle Cloud always-free VM for the worker, Resend, Meta) — see [docs/stack.md](docs/stack.md).

## Contributing

Issues and pull requests are welcome. If you hit a Meta quirk that is not in the setup guide, a PR that documents it is worth as much as a code fix, because that is where everyone loses time.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Credits

Built and maintained by Diwen Huang.

- GitHub: [@diwenne](https://github.com/diwenne)
- Website: [diwenhuang.ca](https://diwenhuang.ca)
- X: [@diwenne](https://x.com/diwennee)
- Instagram: [@devdiwen](https://instagram.com/devdiwen)

OpenReply was initially forked from [instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm) by [Anish Raj](https://github.com/im-anishraj), also MIT licensed, and has been substantially built upon since.

## Star History

<a href="https://www.star-history.com/?repos=diwenne%2Fopenreply&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=diwenne/openreply&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=diwenne/openreply&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=diwenne/openreply&type=date&legend=top-left" />
  </picture>
</a>

## Star the repo

If OpenReply is useful to you, star it. It is the simplest way to help the project reach the next person looking for a free way to do this.

## License

MIT. See [LICENSE](LICENSE).
