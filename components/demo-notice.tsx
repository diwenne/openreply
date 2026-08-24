"use client";

import { useSyncExternalStore } from "react";

/**
 * The public demo, and the only host this notice ever appears on. This repo is
 * something other people clone and deploy, and a self-hoster's instance is not
 * a demo — naming this domain on their site would tell their visitors the
 * opposite of the truth.
 */
const DEMO_HOST = "openreply.diwen.dev";

const DISMISS_KEY = "openreply:demo-notice-dismissed";
const SETUP_DOCS_URL =
  "https://github.com/diwenne/openreply/blob/main/docs/setup.md";

/// Module-level so both variants agree, and so dismissing survives a
/// client-side navigation between the landing page and the login page.
let dismissed: boolean | null = null;
let listeners: Array<() => void> = [];

function isDismissed(): boolean {
  if (dismissed === null) {
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Storage can throw in private modes. Showing the notice is the safe side.
      dismissed = false;
    }
  }
  return dismissed;
}

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
  };
}

/// The host is only knowable in the browser, so the server snapshot is always
/// false. Rendering on the server instead would flash the notice onto every
/// instance that is not the demo.
function getSnapshot(): boolean {
  return window.location.hostname === DEMO_HOST && !isDismissed();
}

function getServerSnapshot(): boolean {
  return false;
}

function dismiss() {
  dismissed = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Dismissal simply does not persist if storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function DemoNotice({ variant }: { variant: "banner" | "panel" }) {
  const visible = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  if (!visible) return null;

  if (variant === "banner") {
    return (
      <div className="relative border-b border-orange-200 bg-orange-50">
        <p className="mx-auto w-full max-w-6xl px-10 py-2 text-center text-xs leading-5 text-zinc-700 sm:px-14 sm:text-sm">
          <span className="font-bold text-zinc-900">{DEMO_HOST}</span> is a
          demo. OpenReply is self-hosted — signing in here will not send DMs for
          your account.{" "}
          <a
            href={SETUP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-orange-700 underline underline-offset-2 transition hover:text-orange-800"
          >
            Deploy your own copy
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss demo notice"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-500 transition hover:text-zinc-900 sm:right-4"
        >
          <DismissIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-5 rounded border border-warning/30 bg-warning/10 px-4 py-3 pr-10">
      <p className="text-sm leading-6 text-foreground">
        <span className="font-semibold">{DEMO_HOST} is a demo instance.</span>{" "}
        Signing in here will not send DMs for your Instagram account. OpenReply
        is self-hosted, so it only works on a deployment you run yourself, with
        your own Meta app and your own domain.{" "}
        <a
          href={SETUP_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-warning underline underline-offset-2"
        >
          Read the setup guide
        </a>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss demo notice"
        className="absolute right-1 top-1 p-2 text-muted transition hover:text-foreground"
      >
        <DismissIcon />
      </button>
    </div>
  );
}

function DismissIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 stroke-current"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}
