# Open-Core Model

CampaignCue is built as an open-core product.

The core engine stays public so builders can inspect, self-host, fork, and contribute. The hosted business makes money by offering convenience, reliability, agency workflows, analytics, reports, support, and managed infrastructure.

## Open Core

The MIT core includes:

- Next.js web app.
- Email magic-link auth.
- Workspace foundation.
- Instagram account connection.
- Comment webhook processing.
- Keyword matching.
- Private reply worker.
- DM logs.
- Stripe subscription foundation.
- Deployment documentation.

## Hosted SaaS Value

The hosted product can charge for:

- Managed Vercel/Railway infrastructure.
- Production monitoring.
- Hosted Postgres and Redis.
- Public campaign templates.
- Tracked links.
- Campaign analytics.
- Shareable client reports.
- Multi-account agency workspaces.
- Priority support.
- Done-for-you onboarding.

## Why Open-Core Fits This Product

Instagram automation buyers need trust. A public core helps with:

- API transparency.
- Meta compliance confidence.
- Community validation.
- Faster issue discovery.
- Better self-hosting adoption.
- Inbound developer and agency attention.

The SaaS monetization layer should compete on reliability, speed, workflow, and proof of ROI rather than hiding the basic worker code.

## Boundary

The repo remains MIT unless the maintainer changes licensing in a future version.

Paid hosted features should be communicated clearly and should not mislead self-hosters about what is available in the public core.
