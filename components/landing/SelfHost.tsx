import { ArrowUpRight } from "./ArrowUpRight";

export function SelfHost() {
  return (
    <section id="self-host" className="w-full border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            Self-host OpenReply. <span className="text-[#71717a]">Choose your connection.</span>
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] text-[#a1a1aa] leading-relaxed">
            Both options need your own web app, background worker, PostgreSQL, and Redis. OpenReply is free software; hosting and provider costs are separate.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#121214] border border-white/15 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 620 814" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" aria-label="Zernio">
                      <path d="M0 230.458L0 461.78L359.783 367.324C404.618 355.553 445.318 396.864 432.88 441.519L332.554 801.71L561.96 801.71L609.501 568.36C613.469 548.882 607.541 528.703 593.669 514.466L287.32 200.054C273.062 185.42 252.341 179.041 232.321 183.12L0 230.458Z" fill="#EB3514" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white tracking-tight">Connect with Zernio</h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-medium text-white whitespace-nowrap">
                  Recommended
                </span>
              </div>

              <p className="mt-1.5 text-[12px] font-mono text-[#71717a]">Recommended for simpler setup</p>

              <p className="mt-4 text-[14.5px] text-[#a1a1aa] leading-relaxed">
                Use Zernio’s managed Instagram connection instead of creating and reviewing your own Meta app. Save an API key in Settings, choose a profile, and connect your account.
              </p>

              <ul className="mt-6 space-y-2.5 text-[13.5px] text-[#d4d4d8]">
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-white shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>No Meta app secrets to configure in OpenReply</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-white shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>OpenReply registers the webhook for you</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-white shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>Optional paid service and project sponsor</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-4">
              <a
                href="https://zernio.link/diwen/?utm_source=openreply&utm_medium=sponsorship&utm_campaign=openreply-integration&utm_content=landing-setup"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#fafafa] hover:bg-white text-[#09090b] text-[13.5px] font-semibold transition-colors"
              >
                <span>Explore Zernio</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://github.com/diwenne/openreply/blob/main/docs/zernio.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium text-[#a1a1aa] hover:text-white transition-colors"
              >
                Read setup &amp; feature limits
              </a>
            </div>
          </div>

          <div className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#0081FB]" aria-label="Meta">
                      <path d="M16.924 5.5c-2.067 0-3.57 1.387-4.924 3.314C10.646 6.887 9.143 5.5 7.076 5.5 3.838 5.5 1.5 8.515 1.5 12.238c0 3.45 1.908 6.262 4.862 6.262 1.844 0 3.19-.942 4.656-3.175l.982-1.503.982 1.503c1.466 2.233 2.812 3.175 4.656 3.175 2.954 0 4.862-2.812 4.862-6.262C22.5 8.515 20.162 5.5 16.924 5.5zm-10.562 10.6c-1.554 0-2.562-1.646-2.562-3.862 0-2.368 1.21-4.338 3.276-4.338 1.448 0 2.473 1.073 3.744 3.058l.274.428-.996 1.522C8.748 14.962 7.772 16.1 6.362 16.1zm11.276 0c-1.41 0-2.386-1.138-3.736-3.192l-.996-1.522.274-.428c1.271-1.985 2.296-3.058 3.744-3.058 2.066 0 3.276 1.97 3.276 4.338 0 2.216-1.008 3.862-2.562 3.862z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white tracking-tight">Use your own Meta app</h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-[#a1a1aa] whitespace-nowrap">
                  Direct
                </span>
              </div>

              <p className="mt-1.5 text-[12px] font-mono text-[#71717a]">Direct connection</p>

              <p className="mt-4 text-[14.5px] text-[#a1a1aa] leading-relaxed">
                Keep the existing direct Meta integration. Create your app, configure Instagram Login and webhooks, and manage platform credentials yourself.
              </p>

              <ul className="mt-6 space-y-2.5 text-[13.5px] text-[#d4d4d8]">
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-[#a1a1aa] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>Bring your own Meta app and secrets</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-[#a1a1aa] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>Handle App Review where required</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-[#a1a1aa] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>No Zernio account or subscription needed</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-4">
              <a
                href="https://github.com/diwenne/openreply/blob/main/docs/setup.md#the-meta-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-white/10 text-white text-[13.5px] font-medium transition-colors"
              >
                <span>Follow the direct Meta guide</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#a1a1aa]" />
              </a>
            </div>
          </div>
        </div>

        <p className="mt-8 text-[12.5px] text-[#71717a] leading-relaxed">
          Instagram’s account requirements, permissions, messaging windows, and rate limits apply with either provider. Existing accounts are never automatically migrated.
        </p>
      </div>
    </section>
  );
}
