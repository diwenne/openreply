import type { SeoPageConfig } from "@/components/seo-page-shell";

const templateLinks = [
  { label: "DTC product link template", href: "/templates/dtc-product-link" },
  { label: "Real estate lead form template", href: "/templates/real-estate-lead-form" },
  { label: "Fitness plan template", href: "/templates/fitness-plan" },
  { label: "Browse every template", href: "/templates" },
];

export const manychatAlternativePage: SeoPageConfig = {
  eyebrow: "Manychat alternative",
  title: "A focused Manychat alternative for Instagram comment-to-DM campaigns",
  description:
    "ManyChat Alternative is for teams that do not need a broad chatbot builder. It turns keyword comments into Meta-compliant private replies, tracked links, campaign analytics, and client reports.",
  primaryCta: "Try the focused alternative",
  bullets: [
    "Built around Instagram comments, posts, reels, and private replies.",
    "Official Meta API flow with no scraping or password sharing.",
    "Campaign templates, tracked links, and shareable client reports.",
    "Open-source core with hosted SaaS for agencies that want managed reliability.",
  ],
  sections: [
    {
      title: "Narrower by design",
      body: "Broad automation suites can be powerful, but they also add flow-builder weight. ManyChat Alternative keeps the campaign path tight: keyword, post, reply, link, result.",
    },
    {
      title: "Agency proof",
      body: "Tracked links and shareable reports make it easier to show clients what happened after the comment, not just that a message was sent.",
    },
    {
      title: "Meta-first delivery",
      body: "Comment events are processed through webhooks, queued, deduped, checked against limits, and sent as private replies using the comment ID.",
    },
  ],
  comparisonTitle: "ManyChat Alternative vs broad chatbot builders",
  comparisons: [
    {
      label: "Setup",
      ours: "Create a keyword campaign for a specific post or reel.",
      other: "Build and maintain a larger chatbot automation flow.",
    },
    {
      label: "Reporting",
      ours: "Campaign-level sends, skips, failures, clicks, CTR, and client report links.",
      other: "Usually broader conversation analytics that need cleanup for client reporting.",
    },
    {
      label: "Positioning",
      ours: "Instagram Campaign OS for agencies and campaign teams.",
      other: "General DM automation across many channels and use cases.",
    },
  ],
  templateLinks,
  faqs: [
    {
      title: "Is ManyChat Alternative a full Manychat replacement?",
      body: "No. ManyChat Alternative is intentionally focused on Instagram comment-to-DM campaigns. If you need a complete chatbot suite, use a broad platform. If you need fast campaign loops, ManyChat Alternative is built for that.",
    },
    {
      title: "Does it support agencies?",
      body: "Yes. It supports multiple Instagram accounts, workspace members, account filters, analytics, and shareable reports, with no account limit.",
    },
  ],
};

export const templatesSeoPage: SeoPageConfig = {
  eyebrow: "Instagram comment-to-DM templates",
  title: "Instagram comment-to-DM templates for high-intent campaign replies",
  description:
    "Start with proven campaign patterns for product links, lead magnets, price replies, launch waitlists, coaching offers, events, and local services.",
  primaryCta: "Use a template",
  bullets: [
    "Template intent carries into signup and campaign creation.",
    "Each template includes keywords, a campaign goal, and reply copy.",
    "Tracked links turn template replies into measurable clicks.",
    "Agencies can reuse templates across client accounts.",
  ],
  sections: [
    {
      title: "Product link drops",
      body: "Use LINK, SHOP, BUY, or SIZE comments to send exact product pages, launch bundles, or collection links.",
    },
    {
      title: "Lead magnets",
      body: "Use GUIDE, CHECKLIST, PLAN, or START comments to send free resources and follow-up offers.",
    },
    {
      title: "Local services",
      body: "Use PRICE, BOOK, INFO, or TOUR comments to deliver booking links, quote forms, and local offer pages.",
    },
  ],
  comparisonTitle: "Template campaigns vs manual inbox replies",
  comparisons: [
    {
      label: "Speed",
      ours: "Launch from reusable campaign templates in minutes.",
      other: "Reply manually or rebuild the same campaign copy each time.",
    },
    {
      label: "Measurement",
      ours: "Use tracked links and keyword analytics per campaign.",
      other: "Rely on screenshots, inbox memory, or scattered link data.",
    },
    {
      label: "Reuse",
      ours: "Clone the same playbook across posts, reels, and client accounts.",
      other: "Repeat setup work for every campaign.",
    },
  ],
  templateLinks,
  faqs: [
    {
      title: "Can I edit the template copy?",
      body: "Yes. Templates are starting points. You can change keywords, private reply text, tracked destination URLs, and active status before launching.",
    },
    {
      title: "Do templates work for reels?",
      body: "Yes. Campaigns can target Instagram posts or reels returned by the connected professional account.",
    },
  ],
};

export const agenciesSeoPage: SeoPageConfig = {
  eyebrow: "Instagram DM automation for agencies",
  title: "Instagram DM automation for agencies managing client campaigns",
  description:
    "ManyChat Alternative gives agencies multi-account workspaces, client-ready reports, tracked links, and a focused comment-to-DM workflow for repeatable Instagram campaigns.",
  primaryCta: "Start an agency workspace",
  bullets: [
    "Connect multiple client Instagram accounts on the Agency plan.",
    "Filter dashboards, logs, campaigns, and settings by account.",
    "Invite teammates as owners, admins, or members.",
    "Share read-only client reports without exposing workspace controls.",
  ],
  sections: [
    {
      title: "Client separation",
      body: "Account filters keep campaign creation, logs, and reporting cleaner when one workspace manages multiple brands.",
    },
    {
      title: "Repeatable offers",
      body: "Use templates to package lead magnets, product drops, price replies, and launch waitlists as repeatable agency services.",
    },
    {
      title: "Proof of work",
      body: "Shareable reports show sends, skips, failures, clicks, CTR, top keywords, and tracked links in a client-safe view.",
    },
  ],
  comparisonTitle: "Agency workflow vs generic automation",
  comparisons: [
    {
      label: "Client reporting",
      ours: "Public read-only campaign report links, unbranded, with no plan gating.",
      other: "Manual screenshots or dashboards that expose too much internal workspace context.",
    },
    {
      label: "Team roles",
      ours: "Owner, admin, and member roles with invite links.",
      other: "Often one shared login or overpowered teammate access.",
    },
    {
      label: "Account operations",
      ours: "Per-account filters for campaigns, logs, dashboard stats, and settings.",
      other: "Client work can get mixed across broad automation workspaces.",
    },
  ],
  templateLinks,
  faqs: [
    {
      title: "How many Instagram accounts can agencies connect?",
      body: "The Agency plan is shaped for up to 10 connected Instagram professional accounts in the current launch packaging.",
    },
    {
      title: "Can clients see reports without logging in?",
      body: "Yes. Shareable report pages are public read-only links that hide private workspace controls and DM copy.",
    },
  ],
};

export const commentLinkSeoPage: SeoPageConfig = {
  eyebrow: "Comment LINK automation",
  title: "Comment LINK automation for Instagram posts and reels",
  description:
    "Let followers comment LINK, SHOP, GUIDE, or any keyword and receive the right private reply with a tracked destination URL.",
  primaryCta: "Automate comment LINK",
  bullets: [
    "Match exact keywords or whole-word phrases.",
    "Send Meta-compliant private replies from the triggering comment.",
    "Insert tracked links into replies with click analytics.",
    "Deduplicate comment jobs and log sent, skipped, and failed outcomes.",
  ],
  sections: [
    {
      title: "For product links",
      body: "Turn high-intent LINK comments into tracked visits to product pages, landing pages, waitlists, or checkout offers.",
    },
    {
      title: "For creator offers",
      body: "Send guides, free resources, course links, and coaching applications without manually watching the inbox.",
    },
    {
      title: "For launch spikes",
      body: "Queue and process campaign replies while a reel is getting attention, with plan and rate-limit checks in the worker.",
    },
  ],
  comparisonTitle: "Comment LINK automation vs manual link replies",
  comparisons: [
    {
      label: "Reply accuracy",
      ours: "Every matched comment gets the campaign reply tied to that post or reel.",
      other: "Manual replies are easy to miss when comments spike.",
    },
    {
      label: "Tracking",
      ours: "Tracked links connect private replies to click outcomes.",
      other: "Regular pasted links rarely show campaign-level performance.",
    },
    {
      label: "Compliance",
      ours: "Built around official private reply semantics and rate-aware queues.",
      other: "Unsafe browser automation or scraping can put accounts at risk.",
    },
  ],
  templateLinks,
  faqs: [
    {
      title: "Can I use keywords other than LINK?",
      body: "Yes. Each campaign can use multiple keywords such as PRICE, SHOP, GUIDE, PLAN, WAITLIST, TOUR, or your own phrase.",
    },
    {
      title: "Does ManyChat Alternative send a normal Instagram DM?",
      body: "It sends a Meta-compliant private reply triggered by the comment event, using the Instagram comment ID.",
    },
  ],
};

