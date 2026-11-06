# Zernio Provider Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans task by task.

**Goal:** Add an optional Zernio Instagram provider and contextual sponsor onboarding.
**Architecture:** Preserve OpenReply's campaign engine and direct Meta support. Store provider identity on InstagramAccount and credentials in a workspace-owned ZernioConnection; map normalized Zernio events into existing queue events.
**Tech Stack:** Next.js 16, React 19, Prisma 7/PostgreSQL, BullMQ/Redis, Vitest.
**Spec:** docs/superpowers/specs/2026-09-08-zernio-provider-design.md

## Global Constraints

- No new dependencies, no `as any`, no secrets in responses or logs.
- New functions with more than two arguments take an object parameter.
- Raw GET fetches use cache: 'no-store'.
- Follow public/design.md in the Zernio source repo for sponsor assets and treatment.
- Marketing UTMs: source=openreply, medium=sponsorship, campaign=openreply-integration; unique content per placement.
- Work only in the isolated worktree; never mutate production/customer data.

### Task 1: Provider runtime and compatibility

**Files:** Create lib/instagram/provider.ts and lib/zernio/client.ts (or small action modules); modify existing runtime consumers under lib/queue, lib/polling, lib/reports and app/api/instagram plus account crons. Leave OAuth connect/callback, settings, schema, webhook ingress, public UI and docs to controller.
**Interfaces:** Schema provided by controller: InstagramAccount.provider ('META'|'ZERNIO', default META), zernioAccountId nullable string, accessToken remains string (empty for Zernio), workspaceId existing. Workspace has zernioConnection relation. ZernioConnection: workspaceId unique, apiKey encrypted string, profileId nullable string, webhookId nullable string, webhookSecret encrypted string. Resolve provider via explicit account metadata, never token prefixes. Controller onboarding uses its own HTTP helper unless coordination chooses shared client.
- [ ] Read every current Meta operation and consuming flow before changing it. Read authoritative Zernio routes in /Users/miki/GitHub/Schedule-Posts-API (CodeGraph first, then precise file reads) to derive payloads; never guess endpoint shapes.
- [ ] Add boundary tests showing selected account routing, outgoing private-reply/button/DM shapes, pagination, rate-limit/auth errors, unknown follower state, and direct Meta preservation. Run focused tests and observe missing provider failure.
- [ ] Implement typed provider adapters and migrate runtime consumers. Preserve identifiers; do not duplicate sending between providers. Exclude Zernio from Meta token refresh. Explicitly report unsupported metrics rather than fabricate values.
- [ ] Run focused tests and typecheck after Prisma generation. Report gaps with exact source evidence. Do not commit other workers' files.

### Task 2: Workspace connection and event ingress

**Files:** prisma/schema.prisma + migration, lib/zernio connection/event helpers, app/api/zernio/**, app/(dashboard)/settings/page.tsx + components/zernio-connection.tsx, lib/env.ts, proxy.ts, shared queue event processor.
- [ ] Add connection schema with encrypted secrets and one provider per account; generate Prisma client.
- [ ] Test unsigned/wrong-workspace events, self/echo filtering, normalized comment/message/postback/read shapes and job deduplication.
- [ ] Implement authenticated owner/admin settings, key validation, profile selection, account import/connect, non-destructive webhook registration, and key replacement protections.
- [ ] Extract existing event enqueueing for both webhook transports; guard routing by workspace plus provider identity.
- [ ] Add settings UI with clear status, errors and paid sponsor choice. Test public webhook accessibility and secret-free settings responses.

### Task 3: Sponsor surfaces and setup documentation

**Files:** README.md, docs/setup.md, docs/zernio.md, app/page.tsx, components/sidebar.tsx, public/brand/zernio SVG assets, lib/zernio-links.ts, sponsor component/CSS.
- [ ] Add official assets and centralized UTM helper with a test preserving query/hash and distinguishing placement.
- [ ] Refresh the whole public landing page with clearer hierarchy and an attractive markup-built comment-to-DM preview. Preserve OpenReply identity and useful existing links/SEO. Add small hero credit, setup option, FAQ/footer links and sidebar credit, applying Zernio brand guide within OpenReply identity.
- [ ] Rewrite setup and AI assistant prompt with provider choice before Meta secrets/review. Explain unrestricted key, paid service, self-hosting and feature limits.
- [ ] Inspect desktop/mobile and all Zernio outbound links.

### Task 4: Verify and open PR

- [ ] Run npm test, npm run typecheck, npm run lint, npm run build; compare baseline failures where present.
- [ ] Review whole diff for tenant isolation, retries/dedup, OAuth state and secrets, feature parity and honest copy.
- [ ] Fix findings, commit, push feature branch to owned fork and open PR against diwenne/openreply main with scope, migration, checks and live-test limitations.
