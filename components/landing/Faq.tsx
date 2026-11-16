export function Faq() {
  return (
    <section id="faq" className="w-full border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
          <div className="lg:col-span-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">FAQ</h2>
            <p className="mt-3 text-[15px] text-[#a1a1aa] leading-relaxed">
              Common questions about licensing, hosting, and Instagram connection providers.
            </p>
          </div>

          <div className="lg:col-span-8 divide-y divide-white/10 border-y border-white/10">
            <details className="group py-5" open>
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15.5px] font-medium text-white">
                <span>Is OpenReply free?</span>
                <span className="text-[#71717a] group-open:rotate-45 transition-transform duration-200 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] text-[#a1a1aa] leading-relaxed pr-8">
                Yes. OpenReply is MIT-licensed software with no software subscription or seat limits. You pay for your own infrastructure and any optional services you choose, including Zernio.
              </p>
            </details>

            <details className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15.5px] font-medium text-white">
                <span>Can I use the public demo to send DMs?</span>
                <span className="text-[#71717a] group-open:rotate-45 transition-transform duration-200 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] text-[#a1a1aa] leading-relaxed pr-8">
                No. Deploy your own instance first. The public demo shows the interface; it is not a hosted automation service. The{" "}
                <a href="https://github.com/diwenne/openreply/blob/main/docs/setup.md" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-4 hover:text-[#d4d4d8]">
                  setup guide
                </a>{" "}
                walks through both processes, the databases, and your provider choice.
              </p>
            </details>

            <details className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15.5px] font-medium text-white">
                <span>Do I need Zernio?</span>
                <span className="text-[#71717a] group-open:rotate-45 transition-transform duration-200 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] text-[#a1a1aa] leading-relaxed pr-8">
                No. Zernio is an optional paid connection provider and sponsor. It can spare you setting up your own Meta app, while OpenReply still runs on your infrastructure. The direct Meta path stays available.{" "}
                <a href="https://zernio.link/diwen/?utm_source=openreply&utm_medium=sponsorship&utm_campaign=openreply-integration&utm_content=landing-faq" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-4 hover:text-[#d4d4d8]">
                  Learn about Zernio
                </a>.
              </p>
            </details>

            <details className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15.5px] font-medium text-white">
                <span>Which Instagram accounts can I connect?</span>
                <span className="text-[#71717a] group-open:rotate-45 transition-transform duration-200 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] text-[#a1a1aa] leading-relaxed pr-8">
                Instagram Business and Creator accounts. Personal accounts are not supported. Connections use the official API, and Instagram’s platform policies still apply.
              </p>
            </details>

            <details className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15.5px] font-medium text-white">
                <span>Are there differences between providers?</span>
                <span className="text-[#71717a] group-open:rotate-45 transition-transform duration-200 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] text-[#a1a1aa] leading-relaxed pr-8">
                Yes. With Zernio, the post picker shows the latest 25 posts. Reporting needs its analytics add-on and synced data, and follower snapshots can be up to 24 hours old. Inbox previews are omitted when message direction is unavailable; opening threads and replying are supported. Read the{" "}
                <a href="https://github.com/diwenne/openreply/blob/main/docs/zernio.md" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-4 hover:text-[#d4d4d8]">
                  provider guide
                </a>{" "}
                before choosing.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
