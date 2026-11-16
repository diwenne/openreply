import Link from "next/link";
import { ArrowUpRight } from "./ArrowUpRight";

export function Footer() {
  return (
    <>
      <section className="w-full border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24 text-center flex flex-col items-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            Set up your first campaign
          </h2>
          <p className="mt-3 text-[16px] text-[#a1a1aa] max-w-md">
            Clone it, connect Instagram, and write your first reply.
          </p>
          <div className="mt-8 w-full sm:w-auto flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <a
              href="https://github.com/diwenne/openreply/blob/main/docs/setup.md"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#fafafa] hover:bg-white text-[#09090b] text-[14px] font-semibold transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              <span>Set up OpenReply</span>
              <ArrowUpRight />
            </a>
            <a
              href="https://github.com/diwenne/openreply"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-white/10 text-[#fafafa] text-[14px] font-medium transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>Star on GitHub</span>
              <ArrowUpRight className="w-4 h-4 text-[#a1a1aa]" />
            </a>
          </div>
        </div>
      </section>

      <footer className="w-full border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-white hover:text-[#d4d4d8] transition-colors"
              >
                <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  <path d="m9.5 12 2 2 3.5-4" />
                </svg>
                <span>OpenReply</span>
              </a>
              <p className="mt-1 text-[13px] text-[#71717a]">
                Open source Instagram comment-to-DM automation.
              </p>
            </div>

            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#a1a1aa]">
              <a href="https://github.com/diwenne/openreply" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
              <a href="https://github.com/diwenne/openreply/blob/main/docs/setup.md" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Setup guide</a>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/data-deletion" className="hover:text-white transition-colors">Data deletion</Link>
            </nav>
          </div>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px] text-[#71717a]">
            <div>
              MIT licensed · Built by{" "}
              <a href="https://diwenhuang.ca/" target="_blank" rel="noopener noreferrer" className="text-[#a1a1aa] hover:text-white transition-colors">
                Diwen Huang
              </a>{" "}
              · Designed by{" "}
              <a href="https://dizaing.com" target="_blank" rel="noopener noreferrer" className="text-[#a1a1aa] hover:text-white transition-colors">
                Dizaing
              </a>
            </div>
            <a
              href="https://zernio.link/diwen/?utm_source=openreply&utm_medium=sponsorship&utm_campaign=openreply-integration&utm_content=landing-footer"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-white transition-colors"
            >
              <span>Supported by Zernio</span>
              <span className="text-[#52525b]">· Optional paid provider</span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
