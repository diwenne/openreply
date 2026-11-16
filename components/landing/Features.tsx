export function Features() {
  return (
    <section id="features" className="w-full border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            Features
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] text-[#a1a1aa] leading-relaxed">
            Everything you need to automate Instagram replies without giving up control of your data or infrastructure.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="rounded-xl bg-[#18181b] border border-white/10 p-4 space-y-3">
              <div className="text-[13px] text-[#e4e4e7] leading-relaxed">
                Hey <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11.5px] text-white">@username</span>, here is the link you asked for:
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2 rounded-lg bg-[#27272a] border border-white/10 text-center text-[12px] font-medium text-white">
                  Get the repo
                </div>
                <div className="px-3 py-2 rounded-lg bg-[#27272a] border border-white/10 text-center text-[12px] font-medium text-[#d4d4d8]">
                  Live demo
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Custom reply messages</h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-[#a1a1aa] leading-relaxed">
                Write your own messages, personalize with a username, and use up to two tracked link buttons.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="flex flex-col gap-2.5 py-1">
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#18181b] border border-white/15">
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-white">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Post comments</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#18181b]/70 border border-white/10">
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-[#d4d4d8]">
                  <svg className="w-4 h-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Incoming DMs</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#18181b]/70 border border-white/10">
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-[#d4d4d8]">
                  <svg className="w-4 h-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Story replies</span>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Multiple triggers</h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-[#a1a1aa] leading-relaxed">
                Trigger campaigns from post comments, incoming DMs, and text replies to Stories.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="rounded-xl bg-[#18181b] border border-white/10 p-4 space-y-2.5 text-[12px]">
              <div className="flex items-center justify-between text-[#71717a] pb-1.5 border-b border-white/10">
                <span className="font-medium text-white">@alex.dev</span>
              </div>
              <div className="flex justify-start">
                <span className="px-3 py-1.5 rounded-2xl rounded-bl-sm bg-[#27272a] text-[#e4e4e7]">
                  Got the link, thanks!
                </span>
              </div>
              <div className="flex justify-end">
                <span className="px-3 py-1.5 rounded-2xl rounded-br-sm bg-white text-[#09090b] font-medium">
                  Anytime! Let me know if you need help.
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Inbox</h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-[#a1a1aa] leading-relaxed">
                Read conversations and reply from OpenReply, within Instagram’s messaging window.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="rounded-xl bg-[#18181b] border border-white/10 p-4 space-y-2 font-mono text-[11.5px]">
              <div className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>sent</span>
                </span>
                <span className="text-[#71717a]">@amrita · clicked link</span>
              </div>
              <div className="flex items-center justify-between text-[#a1a1aa]">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>skipped</span>
                </span>
                <span className="text-[#71717a]">duplicate comment</span>
              </div>
              <div className="flex items-center justify-between text-[#a1a1aa]">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  <span>failed</span>
                </span>
                <span className="text-[#71717a]">window expired</span>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Delivery logs</h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-[#a1a1aa] leading-relaxed">
                See sent, skipped, and failed messages, with reasons. Follow tracked link clicks back to a campaign.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
