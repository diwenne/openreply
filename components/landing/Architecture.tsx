import { ArrowUpRight } from "./ArrowUpRight";

const stack = [
  { title: "Web app", tech: "Next.js + React", description: "Dashboard & incoming events", icon: "web" },
  { title: "Background worker", tech: "Node.js + BullMQ", description: "Queued delivery & reconciliation", icon: "worker" },
  { title: "Your data", tech: "PostgreSQL + Redis", description: "Campaigns, accounts, logs & queue", icon: "data" },
];

export function Architecture() {
  return (
    <section id="architecture" className="w-full border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            Open code. <span className="text-[#71717a]">A system you can inspect.</span>
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] text-[#a1a1aa] leading-relaxed">
            OpenReply owns the campaigns, keyword matching, queues, retries, logs, and inbox. Your connection provider handles the Instagram API.
          </p>
          <div className="mt-6">
            <a
              href="https://github.com/diwenne/openreply"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[14px] font-medium text-white hover:text-[#d4d4d8] transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>Explore the source</span>
              <ArrowUpRight />
            </a>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {stack.map((item) => (
            <div key={item.title} className="rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-7 flex flex-col justify-between gap-8">
              <div className="flex items-center gap-2.5">
                {item.icon === "web" && (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="Next.js">
                      <svg className="w-5 h-5" viewBox="0 0 180 180" aria-label="Next.js">
                        <circle cx="90" cy="90" fill="black" r="90" />
                        <path d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z" fill="white" />
                        <rect fill="white" height="72" width="12" x="115" y="54" />
                      </svg>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="React">
                      <svg className="w-5 h-5" viewBox="0 0 569 512" aria-label="React">
                        <g fill="#58C4DC" fillRule="nonzero">
                          <circle cx="285.5" cy="255.5" r="54.5" />
                          <ellipse cx="284.5" cy="256" rx="260" ry="100" fill="none" stroke="#58C4DC" strokeWidth="24" />
                          <ellipse cx="284.5" cy="256" rx="260" ry="100" fill="none" stroke="#58C4DC" strokeWidth="24" transform="rotate(60 284.5 256)" />
                          <ellipse cx="284.5" cy="256" rx="260" ry="100" fill="none" stroke="#58C4DC" strokeWidth="24" transform="rotate(120 284.5 256)" />
                        </g>
                      </svg>
                    </div>
                  </>
                )}
                {item.icon === "worker" && (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="Node.js">
                      <svg className="w-5 h-5" viewBox="0 0 256 292" aria-label="Node.js">
                        <path fill="#41873F" d="M134.923 1.832c-4.344-2.443-9.502-2.443-13.846 0L6.787 67.801C2.443 70.244 0 74.859 0 79.745v132.208c0 4.887 2.715 9.502 6.787 11.945l114.29 65.968c4.344 2.444 9.502 2.444 13.846 0l114.29-65.968c4.344-2.443 6.787-7.058 6.787-11.945V79.745c0-4.886-2.715-9.501-6.787-11.944L134.923 1.832Z" />
                      </svg>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="BullMQ">
                      <img src="/icons/bullmq.svg" alt="BullMQ" className="w-5 h-5 object-contain" />
                    </div>
                  </>
                )}
                {item.icon === "data" && (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="PostgreSQL">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#336791" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="PostgreSQL">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-center" title="Redis">
                      <svg className="w-5 h-5" viewBox="0 0 256 220" aria-label="Redis">
                        <path d="M246 169c-13.7 7-84.5 36.2-99.5 44-15.1 7.9-23.5 7.8-35.4 2.1C99.2 209.4 24 179 10.3 172.5 3.6 169.3 0 166.5 0 164v-26s98-21.3 113.9-27c15.8-5.6 21.3-5.8 34.8-.9 13.4 5 94 19.5 107.3 24.3V160c0 2.5-3 5.3-10 9" fill="#912626" />
                        <path d="M246 143.2c-13.7 7.1-84.5 36.2-99.5 44-15.1 8-23.5 7.9-35.4 2.2-11.9-5.7-87.2-36.1-100.8-42.6-13.5-6.5-13.8-11-.5-16.2 13.4-5.2 88.2-34.6 104-40.3 16-5.6 21.4-5.8 34.9-1 13.4 5 83.8 33 97.1 37.9 13.3 4.9 13.8 8.9.2 16" fill="#C6302B" />
                      </svg>
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white tracking-tight">{item.title}</h3>
                <p className="mt-1 font-mono text-[12px] text-[#71717a]">{item.tech}</p>
                <p className="mt-2.5 text-[14px] text-[#71717a] leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
