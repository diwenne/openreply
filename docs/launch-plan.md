# Launch Plan

This document turns the roadmap into a practical launch sequence.

## Positioning

ManyChat Alternative should not launch as a generic chatbot builder.

Launch message:

> Open-source Instagram comment-to-DM campaign OS for agencies and campaign teams.

Primary wedge:

> Campaign OS for Instagram comments: templates, delivery, tracked links, analytics, and client reports.

## Target Customer

First audience: agencies.

Why:

- Agencies can pay more than individual creators.
- Agencies manage repeated campaign workflows.
- Agencies need client proof and reporting.
- Agencies can bring multiple accounts later.

Secondary audiences:

- DTC brands.
- Creators selling digital products.
- Coaches and course sellers.
- Event and webinar teams.

## Pre-Launch Checklist

- Merge B2B SaaS foundation.
- Fix production audit and release blockers.
- Deploy staging web/API on Vercel.
- Deploy worker on Railway.
- Connect managed Postgres and Redis.
- Configure Resend.
- Configure Meta test app and webhook.
- Complete one real test-account comment-to-DM flow.
- Add privacy, terms, and data deletion pages.

## Public Launch Assets

- Demo GIF: comment keyword -> private reply.
- Landing page screenshot.
- Dashboard screenshot.
- Campaign builder screenshot.
- Logs screenshot.
- README demo section.
- Template examples.
- One comparison page: Manychat alternative for agencies.
- SEO pages for templates, agencies, and comment LINK automation.

## Launch Channels

- GitHub README and topics.
- GitHub Discussions.
- Product Hunt once staging is stable.
- Indie Hackers build-in-public post.
- Reddit posts in relevant founder and marketing communities.
- Twitter/X build thread.
- Agency outreach with founding offer.
- Creator/agency template posts.

## Viral Loops

First loop: public templates.

- Users discover templates through SEO and GitHub.
- Users click "Use this template".
- Signup preserves template intent.
- Successful users can publish their own anonymized templates.

Second loop: shareable reports.

- Agencies send reports to clients.
- Reports are unbranded and available to everyone.
- Reports show campaign proof.
- Reports expose campaign results only, not workspace controls.

Third loop: contributor loop.

- Good first issues.
- Template contributions.
- Public roadmap.
- Discussions for campaign ideas.

Fourth loop: agency expansion.

- Agency workspaces connect multiple client Instagram accounts.
- Owners and admins invite teammates with role-based access.
- Campaign, log, and dashboard views filter by account for cleaner client operations.

## Revenue Plan

Initial paid packaging:

- Free: one account, one campaign, 100 DMs/month, branded reports.
- Pro: one account, 10 campaigns, 2,000 DMs/month.
- Agency: multiple accounts, higher DM volume, client reports, priority support.

Founding agency offer:

- Limited-time annual deal for the first public agency customers.
- Manual onboarding included.
- Feedback calls used to shape the Campaign OS roadmap.
- Public template pages used as the first SEO and GitHub sharing loop.
- Referral credits stay manual until the fraud controls in [referral-program.md](referral-program.md) are implemented.

## Launch Risks

- Meta App Review can delay public customer use.
- Rate limits and private reply limitations must be communicated.
- Competitors already have broader feature sets.
- The product must win through focus, transparency, templates, and agency reporting.

## Success Metrics

First 30 days:

- 100 GitHub stars.
- 20 self-host attempts.
- 10 agencies on waitlist or beta.
- 8 working campaign templates.
- 1 campaign with tracked link clicks and CTR.
- 1 verified real Instagram private reply flow.

First 90 days:

- 500 GitHub stars.
- 25 hosted beta users.
- 5 paying agencies.
- 25 public templates.
- 10 public case/report examples.
