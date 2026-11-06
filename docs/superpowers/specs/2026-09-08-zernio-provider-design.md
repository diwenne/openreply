# Optional Zernio connection provider

OpenReply remains self-hosted and owns campaigns, keyword matching, follow gates, queues, retries, logs, tracking and its inbox UI. Zernio optionally handles Instagram connections, platform credentials, API calls and incoming events. Direct Meta remains available. Existing accounts are never silently migrated.

## Onboarding

An owner/admin saves one encrypted unrestricted Zernio API key per workspace, selects one profile, and selects existing Instagram accounts or launches Zernio's connection flow. OpenReply creates its own signed webhook subscription without overwriting other integrations. Never expose the saved key or webhook secret to the browser. Verify profile/account ownership server-side. Preserve local account identity and reject accounts already connected elsewhere or through Meta. Disconnecting from OpenReply must not delete accounts in Zernio.

## Execution

Introduce an explicit provider boundary around the existing Meta API operations. Both providers produce the shapes OpenReply already uses. Cover post selection, profile data, comments/reconciliation, public and private replies, DM/button sending, inbox reads, follower status and reporting. Unknown follower status remains unknown/fail-open. Token refresh only handles direct Meta accounts. Incoming Zernio events must be signed, mapped to the configured workspace/account, deduplicated, and fed into the existing campaign queue. Do not execute campaigns in both services.

## Branding and attribution

Soft optional recommendation, transparent paid-service and sponsor disclosure. Placements: README, setup guide including AI assistant prompt, connection settings, small sidebar credit, public website hero sponsor credit, getting-started option, FAQ, footer. OpenReply identity leads. Use official unmodified Zernio SVG assets and /Users/miki/GitHub/Schedule-Posts-API/public/design.md for Zernio palette/type/clear space. Every promotional link to Zernio has utm_source=openreply, utm_medium=sponsorship, utm_campaign=openreply-integration and placement-specific utm_content. API/auth URLs are functional protocol URLs, not marketing CTAs. No promotional text appended to customer messages.

## Landing page refresh

Maintainer approval relayed by user: refresh OpenReply public landing page in this PR. Keep OpenReply identity and existing useful links/SEO. Improve hierarchy, comment-to-DM product preview, mobile layout and the two setup options. Use restrained sponsor treatment, not a Zernio takeover.

## Release

Instagram only. No automatic provider migration, special discount, hosting service or generic plugin marketplace. Validate with mocked boundary contracts, existing regression suite, Prisma generation, typecheck, lint, build and browser inspection. Document any feature/API limitations found by the compatibility audit honestly. Open upstream PR; do not merge it without maintainer review. Live customer accounts are not test fixtures.
