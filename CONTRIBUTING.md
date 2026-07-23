# Contributing

Thanks for wanting to help. OpenReply is public so the comment-to-DM engine is something you can read, run yourself, and improve.

## Ways to help

- Fix a bug. The DM worker and the webhook parser are the parts that matter most.
- Improve the docs. If you hit a Meta setup quirk that is not written down, adding it to `docs/setup.md` is as valuable as a code fix. That guide is where people lose the most time.
- Add campaign templates in `lib/templates/`.
- Add tests. The suite runs with `npm test`.

## Development setup

```bash
npm install
docker-compose up -d
cp .env.example .env      # fill in the values, see docs/setup.md
npm run db:generate
npm run db:migrate
npm run dev
```

Run the worker in a second terminal, since it is what sends the DMs:

```bash
npm run worker
```

## Before you open a pull request

Branch from `main`, keep the change focused on one thing, and make sure these pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If a check cannot run in your environment, say why in the pull request body. A small, clear pull request is easier to merge than a large one that touches many things at once.

## A note on the codebase

This is Next.js 16, and some conventions differ from older versions. There are dev notes in `AGENTS.md`. When you are unsure about an API, read the relevant guide in `node_modules/next/dist/docs/` before writing against it.

## Campaign templates

A template contribution should include a name, the target niche, a suggested post or reel, the keywords, the DM copy, and a short example. Do not include real tokens, private data, or scraped content.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. For anything involving a webhook or a failed send, the Postgres tables describe it best: `WebhookEvent` for delivery, `DmLog` for send status, `OperationalEvent` for worker errors.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
