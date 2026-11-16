"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "./ArrowUpRight";

export function Navbar({ stars = "3.3K" }: { stars?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-7">
            <a
              href="#"
              className="flex items-center gap-2 text-white font-semibold text-[15px] tracking-tight hover:opacity-90 transition-opacity shrink-0"
            >
              <svg
                className="w-4 h-4 text-white shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <path d="m9.5 12 2 2 3.5-4" />
              </svg>
              <span>OpenReply</span>
            </a>

            <nav className="hidden md:flex items-center gap-6 text-[13.5px] font-medium text-[#a1a1aa]">
              <a href="#how-it-works" className="hover:text-white transition-colors whitespace-nowrap">
                How it works
              </a>
              <a href="#self-host" className="hover:text-white transition-colors whitespace-nowrap">
                Self-host it
              </a>
              <a
                href="https://buymeacoffee.com/diwen"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors whitespace-nowrap"
              >
                Buy me a coffee
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <a
              href="https://github.com/diwenne/openreply"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`GitHub repository, ${stars} stars`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black border border-white/15 hover:border-white/30 text-[13px] font-medium text-[#d4d4d8] hover:text-white tabular-nums transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4 fill-current text-[#d4d4d8]" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span className="inline-flex items-center gap-1">
                <span>{stars}</span>
                <svg className="w-3.5 h-3.5 fill-[#eab308] text-[#eab308]" viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            </a>

            <span className="hidden sm:block h-4 w-px bg-white/15" aria-hidden="true" />

            <Link
              href="/login"
              className="hidden md:inline-flex items-center px-3 py-1.5 text-[13px] font-medium text-[#a1a1aa] hover:text-white transition-colors whitespace-nowrap"
            >
              Sign in
            </Link>

            <Link
              href="/login"
              className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#fafafa] hover:bg-white text-[#09090b] text-[13px] font-semibold transition-colors whitespace-nowrap"
            >
              <span>Get started</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="md:hidden relative inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-[#18181b] text-white hover:bg-white/10 transition-colors"
            >
              <span className="sr-only">Menu</span>
              <span
                className={`absolute w-4 h-[1.5px] bg-current rounded-full transition-all duration-300 ease-out ${
                  open ? "translate-y-0 rotate-45" : "-translate-y-[5px]"
                }`}
              />
              <span
                className={`absolute w-4 h-[1.5px] bg-current rounded-full transition-all duration-200 ease-out ${
                  open ? "opacity-0 scale-x-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute w-4 h-[1.5px] bg-current rounded-full transition-all duration-300 ease-out ${
                  open ? "translate-y-0 -rotate-45" : "translate-y-[5px]"
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      <div
        aria-hidden={!open}
        className={`md:hidden fixed inset-0 top-14 z-40 h-[calc(100dvh-3.5rem)] bg-[#09090b] border-t border-white/10 px-6 py-10 flex flex-col justify-between transition-opacity duration-300 ease-out ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <nav className="my-auto flex flex-col items-center text-center gap-2 text-[22px] font-medium tracking-tight text-[#a1a1aa]">
          <a
            href="#how-it-works"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-3.5 rounded-xl hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            How it works
          </a>
          <a
            href="#self-host"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-3.5 rounded-xl hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            Self-host it
          </a>
          <a
            href="https://buymeacoffee.com/diwen"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-3.5 rounded-xl hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            Buy me a coffee
          </a>
        </nav>

        <div className="pt-6 border-t border-white/10 flex flex-col gap-3">
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-[#18181b] border border-white/10 text-white text-[15px] font-medium transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#fafafa] hover:bg-white text-[#09090b] text-[15px] font-semibold transition-colors"
          >
            <span>Get started</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
