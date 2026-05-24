import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CampaignCue - Instagram Comment to DM Campaign OS",
  description:
    "A premium self-serve SaaS for turning Instagram keyword comments into Meta-compliant private replies, lead capture, and campaign growth.",
};

const navLinks = [
  { label: "Templates", href: "/templates" },
  { label: "Product", href: "#product" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Security", href: "#security" },
  { label: "Pricing", href: "#pricing" },
];

const heroStats = [
  { value: "24/7", label: "Comment monitoring" },
  { value: "1", label: "DM per matched comment" },
  { value: "0", label: "Scraping required" },
];

const audiences = [
  "DTC store",
  "Creator studio",
  "Agency desk",
  "Course seller",
  "Launch team",
  "Beauty brand",
  "Fitness coach",
  "Event team",
];

const flowSteps = [
  {
    eyebrow: "Connect",
    title: "Link your Instagram professional account",
    description:
      "Owners sign in by email, connect Instagram once, and manage the account as a workspace integration.",
  },
  {
    eyebrow: "Build",
    title: "Choose a post, keywords, and the exact DM",
    description:
      "Create campaigns for reels, posts, launches, product drops, lead magnets, and client work.",
  },
  {
    eyebrow: "Deliver",
    title: "Send comment-based private replies safely",
    description:
      "Meta webhooks are deduped, queued, checked against limits, and sent through the private reply flow.",
  },
];

const campaignCards = [
  {
    title: "Lead magnets",
    description:
      "Send guides, checklists, discount links, webinar links, or gated resources the moment someone asks.",
  },
  {
    title: "Social commerce",
    description:
      "Turn comments like PRICE, LINK, SIZE, or BUY into an instant product conversation inside Instagram.",
  },
  {
    title: "Agency workflows",
    description:
      "Package repeatable comment-to-DM funnels for campaign clients without relying on manual inbox work.",
  },
  {
    title: "Creator launches",
    description:
      "Capture spikes from reels, stories, and launches while the audience is actively engaging.",
  },
];

const platformFeatures = [
  "Email magic-link signup",
  "Workspace-based tenancy",
  "Agency multi-account support",
  "Stripe-backed plan limits",
  "Encrypted Instagram tokens",
  "Webhook event storage",
  "Queue-backed delivery worker",
  "DM logs and statuses",
  "Token refresh maintenance",
];

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    label: "Start testing",
    description: "For validating one keyword campaign.",
    features: ["1 campaign", "100 DMs per month", "Email sign-in", "Basic DM logs"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$19",
    label: "Most popular",
    description: "For brands and creators running repeatable launches.",
    features: [
      "10 campaigns",
      "2,000 DMs per month",
      "Stripe billing portal",
      "Daily token maintenance",
    ],
    cta: "Start Pro",
    featured: true,
  },
  {
    name: "Agency",
    price: "$49",
    label: "Higher volume",
    description: "For operators managing bigger campaign pipelines.",
    features: [
      "Unlimited campaigns",
      "10 Instagram accounts",
      "10,000 DMs per month",
      "Queue-backed worker",
      "Member roles and reports",
    ],
    cta: "Start Agency",
    featured: false,
  },
];

const faqs = [
  {
    question: "Does CampaignCue use the official Meta API?",
    answer:
      "Yes. The product is built around Meta webhooks and Instagram private replies, not scraping, browser automation, or password sharing.",
  },
  {
    question: "What happens when I hit my monthly DM limit?",
    answer:
      "The worker checks workspace plan limits before sending. Over-limit replies are skipped and logged so operators can see what happened.",
  },
  {
    question: "Can users sign up without Instagram first?",
    answer:
      "Yes. Signup uses email magic links. Instagram is connected after the workspace exists, which is cleaner for a B2B SaaS flow.",
  },
  {
    question: "Is this ready for public launch?",
    answer:
      "The app is implementation-ready, but public launch still depends on production credentials, deployment, and Meta App Review approval.",
  },
];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.091-3.091L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.091-3.091L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.091 3.091L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.091 3.091ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );
}

function InstagramPost() {
  return (
    <div className="border border-white/10 bg-zinc-950 p-3 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-pink-500 via-orange-400 to-yellow-300" />
          <div>
            <p className="text-sm font-semibold text-white">@studio.store</p>
            <p className="text-xs text-zinc-500">Reel campaign</p>
          </div>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300">
          Live
        </span>
      </div>

      <div className="mt-3 aspect-[4/5] overflow-hidden bg-[linear-gradient(135deg,#f97316_0%,#ec4899_48%,#22d3ee_100%)] p-4">
        <div className="flex h-full flex-col justify-between border border-white/20 bg-black/20 p-4">
          <p className="text-xs font-semibold text-white/80">New drop</p>
          <div>
            <p className="text-2xl font-bold leading-tight text-white">
              Comment LINK
            </p>
            <p className="mt-2 text-sm text-white/80">
              Get the full guide in your inbox.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-semibold text-white">@maya.co</p>
          <p className="mt-1 text-sm text-zinc-300">LINK please</p>
        </div>
        <div className="border border-emerald-300/20 bg-emerald-300/10 p-3">
          <p className="text-xs font-semibold text-emerald-100">Matched keyword</p>
          <p className="mt-1 text-sm text-zinc-200">Queued private reply</p>
        </div>
      </div>
    </div>
  );
}

function BuilderPreview() {
  return (
    <div className="border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Product guide reply</p>
          <p className="text-xs text-zinc-500">Campaign builder</p>
        </div>
        <span className="bg-cyan-300 px-3 py-1 text-xs font-bold text-zinc-950">
          Active
        </span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold text-zinc-500">POST OR REEL</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 bg-[linear-gradient(135deg,#f43f5e,#22d3ee)]" />
              <div>
                <p className="text-sm font-semibold text-white">Spring drop reel</p>
                <p className="text-xs text-zinc-500">12.8k views</p>
              </div>
            </div>
          </div>

          <div className="border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold text-zinc-500">KEYWORDS</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["LINK", "GUIDE", "PRICE"].map((item) => (
                <span
                  key={item}
                  className="border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold text-zinc-500">PRIVATE REPLY</p>
          <div className="mt-4 flex-1 border border-white/10 bg-zinc-950 p-4 text-sm leading-6 text-zinc-200">
            Hey {"{username}"}, here is the product guide you asked for:
            <span className="text-cyan-200"> shop.link/guide</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["1", "job"],
              ["0", "dupes"],
              ["sent", "status"],
            ].map(([value, label]) => (
              <div key={label} className="border border-white/10 bg-zinc-950 p-2">
                <p className="text-sm font-bold text-white">{value}</p>
                <p className="text-[11px] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardVisual() {
  return (
    <div className="border border-white/10 bg-zinc-950 p-4 shadow-2xl shadow-black/40">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Active campaigns", "8"],
          ["DMs this month", "1,284"],
          ["Delivery status", "99%"],
        ].map(([label, value]) => (
          <div key={label} className="border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Recent replies</p>
          <p className="text-xs text-zinc-500">Live logs</p>
        </div>
        <div className="mt-4 space-y-2">
          {[
            ["@maya.co", "Product guide reply", "Sent"],
            ["@founder.ray", "Price request", "Sent"],
            ["@shop.ava", "Lead magnet", "Queued"],
          ].map(([user, automation, status]) => (
            <div
              key={`${user}-${automation}`}
              className="grid grid-cols-[1fr_1.1fr_auto] items-center gap-3 border border-white/10 bg-zinc-950 px-3 py-2 text-sm"
            >
              <span className="truncate text-white">{user}</span>
              <span className="truncate text-zinc-400">{automation}</span>
              <span className="bg-emerald-300/10 px-2 py-1 text-xs font-semibold text-emerald-100">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[linear-gradient(115deg,rgba(34,211,238,0.16),rgba(16,185,129,0.08)_42%,rgba(244,63,94,0.10)_70%,rgba(9,9,11,0)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="CampaignCue home">
            <span className="flex h-9 w-9 items-center justify-center border border-cyan-200/20 bg-cyan-300/10 text-sm font-black text-cyan-100">
              CC
            </span>
            <span className="text-lg font-bold text-white">CampaignCue</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-zinc-400 transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-white sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-cyan-300 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
            >
              Start free
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-16 pt-12 sm:px-6 sm:pt-18 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">
            <SparkIcon />
            Built for Meta-compliant Instagram growth
          </div>

          <h1 className="mt-7 text-balance text-5xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
            Make every comment start the right DM
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
            CampaignCue turns keyword comments on posts and reels into private
            replies, campaign logs, and measurable lead capture for businesses,
            creators, and agencies.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200"
            >
              Start free
              <ArrowIcon />
            </Link>
            <a
              href="#product"
              className="inline-flex items-center justify-center border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              See the workflow
            </a>
          </div>

          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="border border-white/10 bg-white/[0.035] p-4">
                <dt className="text-2xl font-black text-white">{stat.value}</dt>
                <dd className="mt-1 text-xs leading-5 text-zinc-500">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="absolute -left-4 top-8 hidden h-20 w-20 border border-cyan-200/20 bg-cyan-300/10 lg:block" />
          <div className="absolute -right-4 bottom-10 hidden h-24 w-24 border border-rose-200/20 bg-rose-300/10 lg:block" />
          <div className="relative grid gap-4 sm:grid-cols-[0.74fr_1fr]">
            <InstagramPost />
            <div className="space-y-4 sm:pt-16">
              <BuilderPreview />
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-white/10 bg-zinc-950 p-4">
                  <p className="text-xs text-zinc-500">Plan guard</p>
                  <p className="mt-2 text-lg font-bold text-white">2,000/mo</p>
                </div>
                <div className="border border-white/10 bg-zinc-950 p-4">
                  <p className="text-xs text-zinc-500">Worker</p>
                  <p className="mt-2 text-lg font-bold text-white">Running</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-zinc-950/55 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-zinc-400">
            Designed for teams turning social attention into owned conversations
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {audiences.map((audience) => (
              <div
                key={audience}
                className="border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-sm font-semibold text-zinc-300"
              >
                {audience}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-cyan-200">Product workflow</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              A cleaner way to run Instagram DM campaigns
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-400">
              The app separates business signup from Instagram connection, then
              gives each workspace real usage, billing, delivery, and log state.
            </p>
          </div>

          <div className="grid gap-4">
            {flowSteps.map((step) => (
              <article
                key={step.title}
                className="grid gap-4 border border-white/10 bg-white/[0.035] p-5 sm:grid-cols-[140px_1fr]"
              >
                <p className="text-sm font-bold text-emerald-200">{step.eyebrow}</p>
                <div>
                  <h3 className="text-xl font-bold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:items-center">
          <DashboardVisual />

          <div>
            <p className="text-sm font-bold uppercase text-emerald-200">Operator dashboard</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              Built to show what happened, not hide it
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-400">
              Every comment event becomes traceable: queued, matched, sent,
              skipped, failed, rate-limited, or blocked by plan limits.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {platformFeatures.slice(0, 4).map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                  <span className="text-emerald-200">
                    <CheckIcon />
                  </span>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="use-cases" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase text-cyan-200">Use cases</p>
          <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
            Campaigns your team can launch without inbox chaos
          </h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {campaignCards.map((card) => (
            <article key={card.title} className="border border-white/10 bg-zinc-950 p-5">
              <div className="mb-6 flex h-10 w-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/10 text-cyan-100">
                <SparkIcon />
              </div>
              <h3 className="text-xl font-bold text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="security" className="border-y border-white/10 bg-zinc-950/60 py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-200">Trust and compliance</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              Serious foundations for a public B2B product
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-400">
              The system is designed around official APIs, encrypted tokens,
              idempotent queue processing, and Stripe-provisioned plans.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {platformFeatures.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-3 border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold text-zinc-200"
              >
                <span className="text-emerald-200">
                  <CheckIcon />
                </span>
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase text-cyan-200">Pricing</p>
          <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
            Free to test, simple to scale
          </h2>
          <p className="mt-5 text-base leading-8 text-zinc-400">
            Each plan maps directly to campaign count and monthly DM volume.
            Stripe webhooks provision the workspace plan after checkout.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {pricingTiers.map((tier) => (
            <article
              key={tier.name}
              className={`border p-6 ${
                tier.featured
                  ? "border-cyan-200/40 bg-cyan-300/10"
                  : "border-white/10 bg-white/[0.035]"
              }`}
            >
              <div className="flex min-h-24 items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black text-white">{tier.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{tier.description}</p>
                </div>
                <span
                  className={`px-3 py-1 text-xs font-bold ${
                    tier.featured
                      ? "bg-cyan-300 text-zinc-950"
                      : "border border-white/10 text-zinc-400"
                  }`}
                >
                  {tier.label}
                </span>
              </div>

              <div className="mt-7 flex items-end gap-1">
                <span className="text-5xl font-black text-white">{tier.price}</span>
                <span className="pb-2 text-sm text-zinc-500">/mo</span>
              </div>

              <ul className="mt-7 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-zinc-300">
                    <span className="mt-0.5 text-emerald-200">
                      <CheckIcon />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-bold transition ${
                  tier.featured
                    ? "bg-cyan-300 text-zinc-950 hover:bg-cyan-200"
                    : "border border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]"
                }`}
              >
                {tier.cta}
                <ArrowIcon />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-bold uppercase text-emerald-200">FAQ</p>
              <h2 className="mt-3 text-4xl font-black leading-tight text-white">
                Questions before you launch
              </h2>
            </div>
            <div className="grid gap-3">
              {faqs.map((faq) => (
                <article key={faq.question} className="border border-white/10 bg-zinc-950 p-5">
                  <h3 className="text-lg font-bold text-white">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(16,185,129,0.10),rgba(244,63,94,0.08))] p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-cyan-100">
              Ready when your next reel goes live
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl">
              Start free and turn keyword comments into private replies
            </h2>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
          >
            Start free
            <ArrowIcon />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 text-sm text-zinc-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center border border-cyan-200/20 bg-cyan-300/10 text-xs font-black text-cyan-100">
              CC
            </span>
            <span>CampaignCue</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition hover:text-white">
                {link.label}
              </a>
            ))}
            <Link href="/login" className="transition hover:text-white">
              Sign in
            </Link>
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <Link href="/data-deletion" className="transition hover:text-white">
              Data deletion
            </Link>
            <Link href="/meta-review" className="transition hover:text-white">
              Meta review
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
