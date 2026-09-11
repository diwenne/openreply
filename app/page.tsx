import type { Metadata } from "next";
import "./landing.css";
import Link from "next/link";
import Image from "next/image";
import localFont from "next/font/local";
import { DemoNotice } from "@/components/demo-notice";
import { zernioLink } from "@/lib/zernio-links";

const geist = localFont({
  src: "../public/fonts/geist-latin.woff2",
  display: "swap",
  weight: "100 900",
});
const GITHUB_URL = "https://github.com/diwenne/openreply";
const SETUP_DOCS_URL = `${GITHUB_URL}/blob/main/docs/setup.md`;
const ZERNIO_DOCS_URL = `${GITHUB_URL}/blob/main/docs/zernio.md`;

function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

const githubIconPath =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z";

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/diwenne/openreply", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number"
      ? data.stargazers_count
      : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "OpenReply - Open source Instagram comment-to-DM automation",
  description:
    "A free, self-hosted ManyChat alternative. Turn Instagram keyword comments into automatic private replies. Connect through your own Meta app or optional paid provider Zernio.",
};

function SponsorCredit({ placement }: { placement: string }) {
  return (
    <a
      className="or-sponsor-credit"
      href={zernioLink({ placement })}
      target="_blank"
      rel="sponsored noopener noreferrer"
    >
      <span>Supported by</span>
      <Image
        src="/brand/zernio-primary.svg"
        alt="Zernio"
        width={76}
        height={24}
      />
      <span className="or-sponsor-disclosure">Optional paid provider</span>
    </a>
  );
}

function ReplyPreview() {
  return (
    <figure
      className="or-preview"
      aria-label="Example campaign: a GUIDE comment triggers a private reply with a guide link"
    >
      <div className="or-preview-top">
        <span className="or-wordmark">
          OpenReply<span aria-hidden="true">↗</span>
        </span>
        <span className="or-mono">Campaign preview</span>
      </div>
      <div className="or-preview-body">
        <div className="or-preview-heading">
          <span className="or-avatar">S</span>
          <div>
            <strong>Sunday studio</strong>
            <span>@sunday.studio · Instagram</span>
          </div>
          <span className="or-active">Active</span>
        </div>
        <div className="or-post">
          <span className="or-mono">Campaign: New drop</span>
          <p>
            Comment GUIDE below
            <br />and I’ll send you the link.
          </p>
          <span>Keyword: GUIDE</span>
          <div className="or-post-lines" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="or-comment">
          <span className="or-avatar or-avatar-small">M</span>
          <div>
            <strong>maya.creates</strong>
            <p>GUIDE! need this 😍</p>
          </div>
        </div>
        <div className="or-match">
          <span aria-hidden="true">↓</span>
          <span>
            Keyword <code>GUIDE</code> matched
          </span>
          <span className="or-match-line" />
          <span>Private reply</span>
        </div>
        <div className="or-message">
          <span className="or-mono">Sunday studio → Maya</span>
          <p>Hey Maya! Here’s the link 👇</p>
          <span className="or-message-link">
            Shop the new drop <span aria-hidden="true">↗</span>
          </span>
        </div>
        <div className="or-delivered">
          <span aria-hidden="true">✓</span> Sent through the official Instagram
          API
        </div>
      </div>
      <figcaption>
        Example content. Your keywords, your message, your links.
      </figcaption>
    </figure>
  );
}

const steps = [
  [
    "Connect your account",
    "Choose Zernio or your own Meta app, then connect an Instagram Business or Creator account.",
  ],
  [
    "Set up a campaign",
    "Pick a post or reel, add keywords, and write the private reply. Add a public reply or tracked link buttons if you need them.",
  ],
  [
    "OpenReply handles the rest",
    "Incoming events trigger your campaigns. A background worker queues, rate-limits, and logs each send, with retries and comment reconciliation.",
  ],
];
const features = [
  [
    "Custom reply messages",
    "Write your own messages, personalize with a username, and use up to two tracked link buttons.",
  ],
  [
    "Multiple triggers",
    "Trigger campaigns from post comments, incoming DMs, and text replies to Stories.",
  ],
  [
    "Inbox",
    "Read conversations and reply from OpenReply, within Instagram’s messaging window.",
  ],
  [
    "Delivery logs",
    "See sent, skipped, and failed messages, with reasons. Follow tracked link clicks back to a campaign.",
  ],
];

export default async function Home() {
  const stars = await getGitHubStars();
  return (
    <div id="top" className={`or-landing ${geist.className}`}>
      <a className="or-skip" href="#main">
        Skip to content
      </a>
      <DemoNotice variant="banner" />
      <header className="or-header">
        <div className="or-container or-nav">
          <a className="or-wordmark" href="#top" aria-label="OpenReply home">
            OpenReply
          </a>
          <nav aria-label="Main navigation">
            <a href="#how">How it works</a>
            <a href="#setup">Self-host it</a>
            <a href={GITHUB_URL}>
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a
              className="or-stars"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="View OpenReply on GitHub"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d={githubIconPath} />
              </svg>
              {stars !== null && <span>{formatStars(stars)}</span>}
            </a>
          </nav>
          <div className="or-nav-cta">
            <a className="or-nav-signin" href="/login">
              Sign in
            </a>
            <a className="or-button or-button-small" href="/login">
              Get started <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="or-container or-hero">
          <div className="or-hero-copy">
            <h1>
              Turn Instagram comments
              <br />
              into private replies.
            </h1>
            <p className="or-lead">
              Someone comments a keyword on your post or reel, OpenReply sends
              them a DM automatically. Free, open source, self-hosted.
            </p>
            <div className="or-actions">
              <a className="or-button or-button-primary" href={SETUP_DOCS_URL}>
                Set up OpenReply <span aria-hidden="true">↗</span>
              </a>
              <a className="or-text-link" href="#how">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="or-hero-note">
              Free software. Self-hosted. Your infrastructure.
            </p>
            <SponsorCredit placement="landing-hero" />
          </div>
          <ReplyPreview />
        </section>
        <div className="or-container or-principles">
          <span>MIT licensed</span>
          <span>Official Instagram API</span>
          <span>No password sharing</span>
          <span>Your campaigns, in your database</span>
        </div>
        <div className="or-container">
          <div className="or-sheet">
            <section id="how" className="or-section or-how">
              <div>
                <h2>How it works</h2>
                <p>
                  Send a product link, share a resource, or deliver your latest
                  guide. You decide what starts the conversation and what
                  happens next.
                </p>
              </div>
              <ol className="or-steps">
                {steps.map(([title, description], index) => (
                  <li key={title}>
                    <span className="or-step-number">0{index + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section id="features" className="or-section">
              <div className="or-section-intro">
                <h2>Features</h2>
              </div>
              <div className="or-feature-grid">
                {features.map(([title, description]) => (
                  <article key={title}>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="or-technical">
              <div>
                <h2>
                  Open code.
                  <br />A system you can inspect.
                </h2>
                <p>
                  OpenReply owns the campaigns, keyword matching, queues,
                  retries, logs, and inbox. Your connection provider handles the
                  Instagram API.
                </p>
                <a href={GITHUB_URL} className="or-text-link">
                  Explore the source <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="or-runtime">
                <div>
                  <span className="or-mono">Web app</span>
                  <strong>Next.js + React</strong>
                  <span>Dashboard & incoming events</span>
                </div>
                <div>
                  <span className="or-mono">Background worker</span>
                  <strong>Node.js + BullMQ</strong>
                  <span>Queued delivery & reconciliation</span>
                </div>
                <div>
                  <span className="or-mono">Your data</span>
                  <strong>PostgreSQL + Redis</strong>
                  <span>Campaigns, accounts, logs & queue</span>
                </div>
              </div>
            </section>
            <section id="setup" className="or-section">
              <div className="or-section-intro">
                <h2>Self-host OpenReply. Choose your connection.</h2>
                <p>
                  Both options need your own web app, background worker,
                  PostgreSQL, and Redis. OpenReply is free software; hosting and
                  provider costs are separate.
                </p>
              </div>
              <div className="or-provider-grid">
                <article className="or-provider-zernio">
                  <div className="or-provider-title">
                    <h3>Connect with Zernio</h3>
                    <span>Recommended for simpler setup</span>
                  </div>
                  <p>
                    Use Zernio’s managed Instagram connection instead of
                    creating and reviewing your own Meta app. Save an API key in
                    Settings, choose a profile, and connect your account.
                  </p>
                  <ul>
                    <li>No Meta app secrets to configure in OpenReply</li>
                    <li>OpenReply registers the webhook for you</li>
                    <li>Optional paid service and project sponsor</li>
                  </ul>
                  <a
                    className="or-text-link"
                    href={zernioLink({ placement: "landing-setup" })}
                    rel="sponsored noopener noreferrer"
                    target="_blank"
                  >
                    Explore Zernio <span aria-hidden="true">↗</span>
                  </a>
                  <a className="or-provider-guide" href={ZERNIO_DOCS_URL}>
                    Read setup & feature limits
                  </a>
                </article>
                <article>
                  <div className="or-provider-title">
                    <h3>Use your own Meta app</h3>
                    <span>Direct connection</span>
                  </div>
                  <p>
                    Keep the existing direct Meta integration. Create your app,
                    configure Instagram Login and webhooks, and manage platform
                    credentials yourself.
                  </p>
                  <ul>
                    <li>Bring your own Meta app and secrets</li>
                    <li>Handle App Review where required</li>
                    <li>No Zernio account or subscription needed</li>
                  </ul>
                  <a
                    className="or-text-link"
                    href={`${SETUP_DOCS_URL}#the-meta-app`}
                  >
                    Follow the direct Meta guide{" "}
                    <span aria-hidden="true">↗</span>
                  </a>
                </article>
              </div>
              <p className="or-setup-note">
                Instagram’s account requirements, permissions, messaging
                windows, and rate limits apply with either provider. Existing
                accounts are never automatically migrated.
              </p>
            </section>
            <section className="or-section or-faq">
              <div>
                <h2>FAQ</h2>
              </div>
              <div>
                <details>
                  <summary>Is OpenReply free?</summary>
                  <p>
                    Yes. OpenReply is MIT-licensed software with no software
                    subscription or seat limits. You pay for your own
                    infrastructure and any optional services you choose,
                    including Zernio.
                  </p>
                </details>
                <details>
                  <summary>Can I use the public demo to send DMs?</summary>
                  <p>
                    No. Deploy your own instance first. The public demo shows
                    the interface; it is not a hosted automation service. The{" "}
                    <a href={SETUP_DOCS_URL}>setup guide</a> walks through both
                    processes, the databases, and your provider choice.
                  </p>
                </details>
                <details>
                  <summary>Do I need Zernio?</summary>
                  <p>
                    No. Zernio is an optional paid connection provider and
                    sponsor. It can spare you setting up your own Meta app,
                    while OpenReply still runs on your infrastructure. The
                    direct Meta path stays available.{" "}
                    <a
                      href={zernioLink({ placement: "landing-faq" })}
                      rel="sponsored noopener noreferrer"
                      target="_blank"
                    >
                      Learn about Zernio
                    </a>
                    .
                  </p>
                </details>
                <details>
                  <summary>Which Instagram accounts can I connect?</summary>
                  <p>
                    Instagram Business and Creator accounts. Personal accounts
                    are not supported. Connections use the official API, and
                    Instagram’s platform policies still apply.
                  </p>
                </details>
                <details>
                  <summary>Are there differences between providers?</summary>
                  <p>
                    Yes. With Zernio, the post picker shows the latest 25 posts.
                    Reporting needs its analytics add-on and synced data, and
                    follower snapshots can be up to 24 hours old. Inbox previews
                    are omitted when message direction is unavailable; opening
                    threads and replying are supported. Read the{" "}
                    <a href={ZERNIO_DOCS_URL}>provider guide</a> before
                    choosing.
                  </p>
                </details>
              </div>
            </section>
          </div>
        </div>
        <section className="or-container or-closing">
          <h2>
            Set up your first campaign
          </h2>
          <p>Clone it, connect Instagram, and write your first reply.</p>
          <div className="or-actions">
            <a className="or-button or-button-primary" href={SETUP_DOCS_URL}>
              Set up OpenReply <span aria-hidden="true">↗</span>
            </a>
            <a className="or-text-link" href={GITHUB_URL}>
              Star on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
      <footer className="or-footer">
        <div className="or-container">
          <div className="or-footer-top">
            <div>
              <Link href="/" className="or-wordmark">
                OpenReply<span aria-hidden="true">↗</span>
              </Link>
              <p>Open source Instagram comment-to-DM automation.</p>
            </div>
            <nav aria-label="Footer navigation">
              <a href={GITHUB_URL}>GitHub</a>
              <a href={SETUP_DOCS_URL}>Setup guide</a>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/data-deletion">Data deletion</Link>
            </nav>
          </div>
          <div className="or-footer-bottom">
            <span>
              MIT licensed · Built by{" "}
              <a href="https://diwenhuang.ca">Diwen Huang</a>
            </span>
            <SponsorCredit placement="landing-footer" />
          </div>
        </div>
      </footer>
    </div>
  );
}
