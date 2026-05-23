# Contributing

Thanks for helping make CampaignCue better.

This project is public because the core Instagram comment-to-DM engine should be inspectable, self-hostable, and useful to builders. The hosted SaaS will monetize managed infrastructure, agency workflows, analytics, reports, support, and templates.

## Ways To Contribute

- Fix bugs.
- Improve docs.
- Add campaign templates.
- Improve tests.
- Help with production hardening.
- Build small UI improvements.

Good starting points:

- [Good first issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Atype%3Agood-first-issue)
- [Documentation issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Atype%3Adocs)
- [Template issues](https://github.com/im-anishraj/instagram-comment-to-dm/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Atemplates)

## Development Setup

```bash
npm install
docker-compose up -d
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
```

## Pull Request Rules

- Create a branch from `main`.
- Use branch names like `area/short-description`.
- Do not commit directly to `main`.
- Link the GitHub issue in the PR body.
- Keep PRs focused on one issue.

Required checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If a check cannot be run locally, explain why in the PR body.

## Branch Naming

Preferred examples:

- `growth/github-viral-setup`
- `hardening/production-readiness`
- `product/public-templates`
- `product/tracked-links-analytics`
- `docs/meta-app-review`

## Issue Labels

- `priority:p0`: launch blocker.
- `priority:p1`: high priority.
- `priority:p2`: important follow-up.
- `area:*`: subsystem or roadmap area.
- `type:*`: kind of work.

## Campaign Templates

Template contributions should include:

- Template name.
- Target niche.
- Suggested post/reel prompt.
- Keywords.
- DM copy.
- Compliance notes.
- Example use case.

Do not include private customer data, real tokens, or scraped content.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
